import { landDesign } from '../panels/PromptBar'
import { DEVICES } from '../doc/devices'
import { camel, cssToStyle, toHtml, toJsx, toPage } from '../doc/html'
import { artboardOf, boardsOn } from '../doc/ops'
import type * as ops from '../doc/ops'
import { runAs, useEditor } from '../doc/store'
import * as clean from '../lib/clean'
import { effectNames, effectOf, effectPatch, imageBgPatch } from '../lib/effects'
import * as gen from '../lib/generate'

/** the most one write_html may carry: a component, never a page */
const WRITE_CAP = 3000
import * as edits from '../lib/ops'
import { guideOf, guideTopics, type GuideTopic } from './guide'
import { palette } from '../lib/palette'
import { tokensOf } from '../lib/tokens'
import type { Doc, Node, Style } from '../doc/types'

/**
 * The agent's half of the editor.
 *
 * Every tool below calls the same store action a button or a drag calls, so
 * there is no second code path to keep in step and an agent's write lands on
 * the undo stack like anything else. The tools are deliberately thin: the
 * interesting work already lives in `doc/ops.ts`, and a tool that reimplemented
 * any of it would be a tool that could disagree with the canvas.
 *
 * Two decisions shape the whole surface:
 *
 * 1. The document is html, so the agent reads html and writes html. There is
 *    no bespoke node format to teach it and nothing to translate, which is the
 *    reason `write_html` can be the only structural write tool.
 * 2. Reads return the browser's *measured* layout, not the css that was asked
 *    for. An agent that writes `display: flex` and reads back three boxes at
 *    real coordinates can see what it did, and that is the thing a design tool
 *    painting into a canvas cannot offer it.
 */

// -------------------------------------------------------------- webmcp typing

interface Tool {
  name: string
  description: string
  inputSchema?: object
  annotations?: { readOnlyHint?: boolean }
  execute(input: never, ctx: { signal?: AbortSignal }): unknown
}

interface ModelContext {
  registerTool(tool: Tool, options?: { signal?: AbortSignal }): Promise<void>
}

/** `navigator.modelContext` is the Chrome 146 name, deprecated in 150 */
export const modelContext = (): ModelContext | null => {
  const d = document as unknown as { modelContext?: ModelContext }
  const n = navigator as unknown as { modelContext?: ModelContext }
  return d.modelContext ?? n.modelContext ?? null
}

/** is this a browser that brought its own, before we consider polyfilling */
export const hasNativeWebMcp = () => modelContext() != null

// -------------------------------------------------------------------- helpers

const S = () => useEditor.getState()

/**
 * Wait for React to render and the canvas to re-measure.
 *
 * Boxes come from `getBoundingClientRect` in a layout effect, so a write is
 * not measurable in the tick that made it. Two frames is enough for the commit
 * and the measure that follows it, and it is what lets every tool return real
 * geometry instead of the geometry it hoped for.
 */
const settle = () =>
  new Promise<void>(done =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())))

class ToolError extends Error {}

const fail = (msg: string): never => { throw new ToolError(msg) }

function nodeOr(id: string): Node {
  const n = S().doc.nodes[id]
  return n ?? fail(`No node "${id}". Call get_document to see what exists.`)
}

function idsOr(ids: string[]): string[] {
  if (!ids?.length) fail('No ids given.')
  const missing = ids.filter(id => !S().doc.nodes[id])
  if (missing.length) fail(`No such node: ${missing.join(', ')}.`)
  return ids
}

/** css keys may arrive kebab or camel; the document stores camel */
const normalise = (style: Record<string, string>): Style => {
  const out: Style = {}
  for (const [k, v] of Object.entries(style)) out[camel(k)] = String(v)
  return out
}

/**
 * Long attribute values are summarised, not sent.
 *
 * An embedded image is a data uri of a hundred kilobytes or more. Returning it
 * would spend the agent's whole context on base64 it can do nothing with, and
 * it already knows what it asked for.
 */
const LONG = 180

function brief(props: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(props)) {
    out[k] = v.length > LONG
      ? `${v.slice(0, 40)}… <${v.startsWith('data:') ? 'embedded image' : 'long value'}, ${v.length} chars>`
      : v
  }
  return out
}

/** what a node looks like to the agent: what it asked for, and what it got */
function describe(doc: Doc, id: string) {
  const n = doc.nodes[id]
  if (!n) return null
  const b = S().boxes[id]
  return {
    id: n.id,
    name: n.name,
    type: n.type,
    tag: n.tag,
    ...(n.text != null && { text: n.text }),
    ...(Object.keys(n.props).length && { attributes: brief(n.props) }),
    style: n.style,
    parent: n.parent,
    children: n.children,
    /** measured, in artboard pixels — the browser's answer, not the css */
    box: b && {
      x: Math.round(b.x), y: Math.round(b.y),
      w: Math.round(b.w), h: Math.round(b.h),
    },
  }
}

/** what a generated vector is worth saying about, markup excluded */
const summary = (made: gen.SvgOut, markup: string) => ({
  by: made.label,
  model: made.model,
  chars: markup.length,
  ...(made.credits != null && { credits: made.credits }),
  ...(made.note && { note: made.note }),
})

/**
 * Run a write, then log it and mark what it touched.
 *
 * The log and the highlight are not decoration: in a room where a person and
 * an agent edit the same nodes, "what just changed and who changed it" is the
 * only way either of them can follow along.
 */
async function act<T>(
  tool: string, detail: string, ids: string[], run: () => T,
): Promise<T> {
  const data = { input: calling, ...(ids.length ? { nodes: ids } : {}) }
  try {
    // the store logs human edits by wrapping its own actions; this says the
    // pen has changed hands, so the write is attributed once and correctly
    const value = runAs('agent', run)
    if (ids.length) S().touch(ids)
    S().note({ by: 'agent', tool, detail, data })
    await settle()
    return value
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    S().note({ by: 'agent', tool, detail, error, data })
    throw e
  }
}

/** the input of the tool being executed, so the log can show the call itself */
let calling: unknown = null

// ---------------------------------------------------------------------- tools

const TOOLS: Tool[] = [
  {
    name: 'get_document',
    description:
      'Read the design as HTML. Every element carries a data-easel id, which is '
      + 'the handle every other tool takes. Start here: the HTML is the document, '
      + 'not a summary of it, so whatever you see is exactly what will ship.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        artboardId: {
          type: 'string',
          description: 'Limit to one artboard. Omit for every artboard in the file.',
        },
      },
    },
    execute: ({ artboardId }: { artboardId?: string }) => {
      const { doc, boxes } = S()
      const boards = artboardId ? [nodeOr(artboardId).id] : doc.artboards
      return {
        artboards: boards.map(id => {
          const b = doc.nodes[id]
          const box = boxes[id]
          return {
            id,
            name: b.name,
            page: b.page ?? doc.pages[0]?.id,
            size: box ? { w: Math.round(box.w), h: Math.round(box.h) } : null,
            html: toHtml(doc, id, { ids: true, brief: true }),
          }
        }),
        pages: doc.pages.map(p => ({
          ...p, showing: p.id === doc.page, artboards: boardsOn(doc, p.id),
        })),
        nodeCount: Object.keys(doc.nodes).length,
        devices: DEVICES.map(d => d.name),
      }
    },
  },

  {
    name: 'get_guide',
    description:
      'How to use Easel well — layout rules, design taste, and the etiquette of '
      + 'sharing a document with a person. Call with topic "overview" before '
      + 'other tools; the other topics are layout, design, and turns.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['overview', 'layout', 'design', 'turns'],
          description: 'Which guide to fetch. Defaults to overview.',
        },
      },
    },
    execute: ({ topic }: { topic?: GuideTopic }) => {
      const t = topic ?? 'overview'
      const guide = guideOf(t)
      if (!guide) {
        fail(`Unknown topic "${topic}". Topics: ${Object.keys(guideTopics).join(', ')}`)
      }
      return { topic: t, guide }
    },
  },

  {
    name: 'get_node',
    description:
      'One node in full: its tag, text, attributes, the CSS the document holds, '
      + 'and the box the browser actually laid it out at. Use this after a write '
      + 'to check what the layout really did — the children come back with their '
      + 'measured boxes too, so one call tells you whether a flex row really did '
      + 'sit its items side by side.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The data-easel id.' } },
      required: ['id'],
    },
    execute: ({ id }: { id: string }) => {
      nodeOr(id)
      const { doc } = S()
      const kids = doc.nodes[id].children
      return {
        ...describe(doc, id),
        /**
         * The children's measured boxes, inline. Checking a layout is the
         * reason this tool exists, and a container's own box cannot show
         * whether the items inside it wrapped, collapsed or overlapped — so
         * asking would have cost a round trip per child.
         */
        ...(kids.length && {
          layout: kids.map(k => {
            const d = describe(doc, k)
            return { id: k, tag: d?.tag, ...(d?.text && { text: d.text }), box: d?.box }
          }),
        }),
        html: toHtml(doc, id, { ids: true, brief: true }),
      }
    },
  },

  {
    name: 'get_selection',
    description:
      "What the person at the keyboard has selected right now, and what they are "
      + 'looking at. Call this when they say "this" or "that" — it is how you find '
      + 'out what they mean.',
    annotations: { readOnlyHint: true },
    execute: () => {
      const { doc, sel, cam, tool, editing } = S()
      return {
        selection: sel.map(id => describe(doc, id)).filter(Boolean),
        empty: sel.length === 0,
        activeTool: tool,
        editingText: editing,
        zoom: Math.round(cam.zoom * 100) / 100,
      }
    },
  },

  {
    name: 'find_nodes',
    description:
      'Search the design by layer name, text content, or tag. Cheaper than '
      + 'reading the whole document when you already know what you are after.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Matched case-insensitively against name and text.' },
        tag: { type: 'string', description: 'Exact tag filter, e.g. "button".' },
      },
    },
    execute: ({ query, tag }: { query?: string; tag?: string }) => {
      const { doc } = S()
      const q = query?.toLowerCase()
      const hits = Object.values(doc.nodes).filter(n => {
        if (tag && n.tag !== tag.toLowerCase()) return false
        if (!q) return true
        return n.name.toLowerCase().includes(q) || (n.text ?? '').toLowerCase().includes(q)
      })
      return {
        count: hits.length,
        nodes: hits.slice(0, 50).map(n => ({
          id: n.id, name: n.name, tag: n.tag, type: n.type,
          text: n.text, parent: n.parent,
        })),
      }
    },
  },

  {
    name: 'create_artboard',
    description:
      'Add an empty artboard, which is one page of the design. Rarely needed: '
      + 'generate_design makes its own board for a new web page and stacks phone '
      + 'screens on the board they belong to. Give either a device name or an '
      + 'explicit size.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        device: {
          type: 'string',
          enum: DEVICES.map(d => d.name),
          description: 'A size preset. Ignored if w and h are given.',
        },
        w: { type: 'number' },
        h: { type: 'number' },
        background: { type: 'string', description: 'Any CSS colour.' },
        page: { type: 'string', description: 'Which page it lands on. Defaults to the one showing.' },
      },
    },
    execute: async (input: { name?: string; device?: string; w?: number; h?: number; background?: string; page?: string }) => {
      const preset = DEVICES.find(d => d.name === input.device)
      const w = input.w ?? preset?.w ?? 1280
      const h = input.h ?? preset?.h ?? 832
      const id = await act('create_artboard', `${input.name ?? input.device ?? 'Artboard'} ${w}×${h}`, [], () =>
        S().createArtboard({
          name: input.name ?? preset?.name, w, h,
          background: input.background, page: input.page,
        }))
      return { id, ...describe(S().doc, id) }
    },
  },

  {
    name: 'manage_pages',
    description:
      'Add, rename, delete or switch pages. A page is a named wall of '
      + 'artboards; every board stays addressable by id whichever page is '
      + 'showing, so you only need to switch when you want the person to see '
      + 'something.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'rename', 'delete', 'show'] },
        id: { type: 'string', description: 'The page, for rename, delete and show.' },
        name: { type: 'string', description: 'For add and rename.' },
      },
      required: ['action'],
    },
    execute: async ({ action, id, name }: { action: string; id?: string; name?: string }) => {
      const known = (p: string) =>
        S().doc.pages.some(x => x.id === p) || fail(`No page "${p}".`)

      if (action === 'add') {
        const made = await act('manage_pages', `add ${name ?? ''}`, [], () => S().addPage(name))
        return { added: made, pages: S().doc.pages, showing: S().doc.page }
      }
      if (!id) fail('Pass the page id.')
      known(id!)
      if (action === 'rename') {
        if (!name) fail('Pass a name.')
        await act('manage_pages', `rename ${id}`, [], () => S().renamePage(id!, name!))
      } else if (action === 'delete') {
        if (S().doc.pages.length < 2) fail('A file needs at least one page.')
        await act('manage_pages', `delete ${id}`, [], () => S().removePage(id!))
      } else if (action === 'show') {
        await act('manage_pages', `show ${id}`, [], () => S().showPage(id!))
      } else fail(`Unknown action "${action}".`)

      return { pages: S().doc.pages, showing: S().doc.page }
    },
  },

  {
    name: 'write_html',
    description:
      'Insert markup you already have. For building a page, screen or section '
      + 'from a description use generate_design instead; this is for a small '
      + 'component, a fix, or a logo. Write an HTML fragment into a parent and it becomes '
      + 'real nodes the person can then select and drag. Use inline style '
      + 'attributes for CSS. Flow layout works: a div with display:flex lays its '
      + 'children out for real, so prefer flex and grid over positioning every '
      + 'child by hand. Position the fragment root with position:absolute plus '
      + 'left and top to place it on the artboard. Semantic tags are kept, so use '
      + 'h1, p, button and a rather than divs everywhere. Returns the ids created '
      + 'and the boxes the browser laid them out at.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description: 'Artboard or frame id to write into.',
        },
        html: {
          type: 'string',
          description: 'An HTML fragment. May have several roots.',
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: 'append adds to the parent; replace swaps its children. Defaults to append.',
        },
      },
      required: ['parentId', 'html'],
    },
    execute: async ({ parentId, html, mode }: { parentId: string; html: string; mode?: string }) => {
      nodeOr(parentId)
      if (!html?.trim()) fail('html was empty.')
      // a whole page in one write is the agent designing instead of Easel:
      // no reference, no brand, no phone rule. it goes back with the tool
      // that does those things, and anything smaller still writes
      if (html.length > WRITE_CAP) {
        fail(`That is ${html.length} characters, more than one component. To build a page, screen or section, `
          + 'call generate_design with the person\'s request as the prompt; Easel designs it from a reference '
          + 'in this file\'s brand and keeps a mobile app as phone screens. write_html is for one small piece '
          + `of markup you already hold, under ${WRITE_CAP} characters.`)
      }
      const ids = await act('write_html', `${html.length} chars into ${parentId}`, [], () =>
        S().insertHtml(parentId, html, mode === 'replace' ? 'replace' : 'insert'))
      if (!ids.length) fail('Nothing was created — the fragment had no elements.')
      S().touch(ids)
      const { doc } = S()
      return {
        created: ids.length,
        roots: ids.filter(id => doc.nodes[id]?.parent === parentId).map(id => describe(doc, id)),
        nodes: ids.map(id => {
          const b = S().boxes[id]
          return {
            id, tag: doc.nodes[id]?.tag,
            box: b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) },
          }
        }),
      }
    },
  },

  {
    name: 'set_style',
    description:
      'Patch CSS on one or more nodes. Keys may be camelCase or kebab-case, and '
      + 'an empty string removes a property — which is how you hand a width or '
      + 'height back to the browser. Returns the boxes after the browser has '
      + 're-laid them out.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        style: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'CSS declarations, e.g. { "background": "#111", "borderRadius": "12px" }.',
        },
        css: {
          type: 'string',
          description: 'Alternative to style: a declaration string like "color: red; gap: 8px".',
        },
      },
      required: ['ids'],
    },
    execute: async ({ ids, style, css }: { ids: string[]; style?: Record<string, string>; css?: string }) => {
      idsOr(ids)
      const patch = { ...(css ? cssToStyle(css) : {}), ...(style ? normalise(style) : {}) }
      if (!Object.keys(patch).length) fail('No css given — pass style or css.')
      await act('set_style', `${Object.keys(patch).join(', ')} on ${ids.join(', ')}`, ids, () =>
        S().patchStyle(ids, patch))
      return { nodes: ids.map(id => describe(S().doc, id)) }
    },
  },

  {
    name: 'set_text',
    description: "Replace a node's text content.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
    },
    execute: async ({ id, text }: { id: string; text: string }) => {
      const n = nodeOr(id)
      if (n.children.length) fail(`"${id}" has child elements, so it has no text of its own.`)
      await act('set_text', `${id}: ${JSON.stringify(text.slice(0, 40))}`, [id], () =>
        S().setText(id, text))
      return describe(S().doc, id)
    },
  },

  {
    name: 'set_image',
    description:
      'Point an image node at a URL or data URI. If you can generate or find an '
      + 'image, this is how it gets onto the canvas — Easel does not generate '
      + 'images itself, it shows the one you give it. Pass a node id for an '
      + 'existing image, or a parentId to create one.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'An existing image node.' },
        parentId: { type: 'string', description: 'Create a new image here instead.' },
        src: { type: 'string', description: 'https URL or data: URI.' },
        alt: { type: 'string' },
        w: { type: 'number' },
        h: { type: 'number' },
      },
      required: ['src'],
    },
    execute: async (input: { id?: string; parentId?: string; src: string; alt?: string; w?: number; h?: number }) => {
      const { src, alt, w, h } = input
      if (!/^(https?:|data:)/.test(src)) fail('src must be an http(s) URL or a data: URI.')

      let id = input.id
      if (id) nodeOr(id)
      else if (input.parentId) {
        const parent = nodeOr(input.parentId).id
        id = await act('set_image', `new image in ${parent}`, [], () =>
          S().createNode(parent, 'image', { w: w ?? 320, h: h ?? 240 }) ?? fail('Could not create the image.'))
      } else fail('Pass either id or parentId.')

      const target = id as string
      await act('set_image', `${target} ← ${src.slice(0, 60)}`, [target], () => {
        S().setProps(target, { src, ...(alt != null && { alt }) })
        if (w != null || h != null) {
          S().patchStyle([target], {
            ...(w != null && { width: `${w}px` }),
            ...(h != null && { height: `${h}px` }),
          })
        }
      })
      return describe(S().doc, target)
    },
  },

  {
    name: 'generate_image',
    description:
      'Generate an image from a text prompt and place it on the canvas. It comes '
      + 'back as a data URI embedded in the document, so the export carries the '
      + 'picture rather than a link to it. Prefer set_image if you can make the '
      + 'image yourself — you will get a better one. Same prompt and seed gives '
      + 'the same image, so a retry is only different if you change something.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the image should show.' },
        id: { type: 'string', description: 'An existing image node to fill.' },
        parentId: { type: 'string', description: 'Create a new image here instead.' },
        ratio: {
          type: 'string',
          enum: [...gen.RATIOS],
          description: 'Aspect ratio. Defaults to 1:1.',
        },
        w: { type: 'number', description: 'Node width in px. Defaults to the ratio.' },
        h: { type: 'number', description: 'Node height in px. Defaults to the ratio.' },
        x: { type: 'number', description: 'Offset inside the parent. Defaults to 24.' },
        y: { type: 'number' },
        seed: { type: 'number' },
      },
      required: ['prompt'],
    },
    execute: async (input: { prompt: string; id?: string; parentId?: string; ratio?: string; w?: number; h?: number; x?: number; y?: number; seed?: number }) => {
      const { prompt, ratio, seed } = input
      const size = gen.ratioSize(ratio ?? '1:1', 384)
      const w = input.w ?? size.w
      const h = input.h ?? size.h

      if (input.id) nodeOr(input.id)
      else if (input.parentId) nodeOr(input.parentId)
      else fail('Pass either id or parentId.')

      const made = await gen.oneImage({ prompt, ratio, seed })
      const detail = `${JSON.stringify(prompt.slice(0, 40))} by ${made.label}`

      // one commit either way, so one undo step undoes the generation rather
      // than leaving an empty image node behind
      const target = input.id
        ? await act('generate_image', `${input.id}: ${detail}`, [input.id], () => {
          S().setProps(input.id!, { src: made.src, alt: prompt })
          return input.id!
        })
        : await act('generate_image', `${input.parentId}: ${detail}`, [], () =>
          S().insertImage(input.parentId!, made.src, prompt, {
            x: input.x ?? 24, y: input.y ?? 24, w, h,
          }, prompt.slice(0, 28)) ?? fail('Could not create the image.'))

      // describe() runs props through brief(), so the data uri comes back as a
      // one-line summary. never return it whole: it is a hundred kilobytes of
      // base64 the model can do nothing with but pay for
      return {
        ...describe(S().doc, target),
        generated: { by: made.label, model: made.model, w: made.w, h: made.h, embedded: made.embedded },
        ...(made.note && { note: made.note }),
      }
    },
  },

  {
    name: 'generate_svg',
    description:
      'Generate a vector from a text prompt and place it on the canvas as real '
      + 'inline SVG — a div holding an <svg> element, not a raster and not an '
      + 'opaque blob. So the paths are readable, set_style on the wrapper\'s '
      + '`color` recolours everything drawn with currentColor, and export_code '
      + 'hands back the markup. Good for icons, logos, marks and simple '
      + 'illustrations. Pass an existing svg node id to redraw it.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to draw, e.g. "moon icon in outline style".' },
        id: { type: 'string', description: 'An existing svg node to redraw.' },
        parentId: { type: 'string', description: 'Artboard or frame to draw into.' },
        ratio: {
          type: 'string',
          enum: [...gen.RATIOS],
          description: 'Aspect ratio of the drawing. Defaults to 1:1.',
        },
        w: { type: 'number', description: 'Node width in px. Defaults to the ratio.' },
        h: { type: 'number', description: 'Node height in px.' },
        x: { type: 'number', description: 'Offset inside the parent. Defaults to 24.' },
        y: { type: 'number' },
        provider: {
          type: 'string',
          description:
            'Which model: "quiver:arrow-1.1" (default, a dedicated vector model), '
            + '"quiver:arrow-1.1-max", or "openai" / "kimi" / "gemini" to have a '
            + 'chat model write the markup. Only providers with a key configured '
            + 'are available.',
        },
      },
      required: ['prompt'],
    },
    execute: async (input: { prompt: string; id?: string; parentId?: string; ratio?: string; w?: number; h?: number; x?: number; y?: number; provider?: string }) => {
      const { prompt, ratio, provider } = input
      if (!prompt?.trim()) fail('prompt was empty.')
      if (!input.id && !input.parentId) fail('Pass either id or parentId.')
      if (input.id) nodeOr(input.id)
      if (input.parentId) nodeOr(input.parentId)

      const fan = await gen.svg({ prompt, ratio, ...(provider ? { provider } : {}) })
      const made = fan.made[0] ?? fail(gen.failNote(fan.failed) ?? 'The generator returned nothing.')
      // sanitised here as well as on the server, because this is the last gate
      // before the markup becomes DOM
      const markup = clean.svg(made.svg)

      if (input.id) {
        const target = input.id
        await act('generate_svg', `${target}: ${JSON.stringify(prompt.slice(0, 40))}`, [target], () =>
          S().setSvg(target, markup))
        return { ...describe(S().doc, target), generated: summary(made, markup) }
      }

      const parent = input.parentId as string
      const size = gen.ratioSize(ratio ?? '1:1', 240)
      const id = await act('generate_svg', `new svg in ${parent}`, [parent], () =>
        S().insertSvg(parent, markup, {
          x: input.x ?? 24, y: input.y ?? 24,
          w: input.w ?? size.w, h: input.h ?? size.h,
        }, prompt.slice(0, 28)) ?? fail('Could not create the vector.'))

      return { ...describe(S().doc, id), generated: summary(made, markup) }
    },
  },

  {
    name: 'generate_design',
    description:
      'The way to build. Give it what the person wants — "a payment app for '
      + 'mobile", "landing page for a note taking app", "the checkout screen", '
      + '"add a pricing section" — and Easel designs it: it picks a real '
      + 'reference site for structure, follows the file\'s existing brand and '
      + 'colours, keeps a mobile app as phone screens (one under another on the '
      + 'same board), and lands everything as editable nodes with a live cursor. '
      + 'Do not write the html yourself and do not create an artboard first: a '
      + 'new web page gets its own artboard automatically, and a phone screen '
      + 'stacks below the last one. Call it once per page or screen. Returns a '
      + 'summary and the boards with what is on them. Use write_html only for '
      + 'a small component whose exact markup you already have.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to design.' },
        artboardId: { type: 'string', description: 'Where it lands. Defaults to the first artboard.' },
        provider: {
          type: 'string',
          description:
            'Which model: "openai", "kimi", "gemini", or "variety" to run every '
            + 'configured one at once and stack the results for comparison. '
            + 'Defaults to the first one with a key.',
        },
        x: { type: 'number', description: 'Offset inside the artboard. Defaults to a free row below the existing design.' },
        y: { type: 'number' },
      },
      required: ['prompt'],
    },
    execute: async (input: { prompt: string; artboardId?: string; provider?: string; x?: number; y?: number }) => {
      const { prompt, provider } = input
      if (!prompt?.trim()) fail('prompt was empty.')
      const board = input.artboardId ?? S().doc.artboards[0]
      if (!board) fail('The file has no artboards yet — call create_artboard first.')
      nodeOr(board)

      // the same path the prompt bar takes, aimed at the board asked for:
      // reference landing, phone rule, page context, intent routing and the
      // cursor all come with it
      const before = new Set(Object.keys(S().doc.nodes))
      S().select([board])
      const summary = await landDesign(prompt, provider ?? null, '', {})
      const doc = S().doc
      const made = Object.keys(doc.nodes).filter(id => !before.has(id))
      const roots = made.filter(id => { const p = doc.nodes[id]?.parent; return p != null && doc.artboards.includes(p) })
      S().touch(made)
      return {
        summary,
        created: made.length,
        artboards: doc.artboards.map(id => describe(doc, id)),
        roots: roots.map(id => describe(doc, id)),
      }
    },
  },

  {
    name: 'generate_edits',
    description:
      'Ask a design model to change what is on an artboard, by description: '
      + '"make the CTA green and bigger", "add a testimonials row under the '
      + 'pricing", "rewrite the hero copy for a bakery". The model sees an '
      + 'outline of the artboard with every node id and answers with addressed '
      + 'operations (insert, replace, style, text, delete) that land through the '
      + 'same actions a person uses, as one undo step. Use this when the request '
      + 'refers to things already on the canvas; use generate_design for a new '
      + 'section from nothing, and set_style or set_text when you already know '
      + 'the exact change. Returns what was applied and the ids it touched.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The change, in words.' },
        artboardId: { type: 'string', description: 'Defaults to the artboard of the selection, then the first one.' },
        provider: { type: 'string', description: '"openai", "kimi" or "gemini". Defaults to the first one with a key.' },
      },
      required: ['prompt'],
    },
    execute: async ({ prompt, artboardId, provider }: { prompt: string; artboardId?: string; provider?: string }) => {
      if (!prompt?.trim()) fail('prompt was empty.')
      const st = S()
      let board = artboardId
      if (!board && st.sel[0]) board = artboardOf(st.doc, st.sel[0]) ?? undefined
      board ??= st.doc.artboards[0]
      if (!board) fail('The file has no artboards yet — call create_artboard first.')
      const node = nodeOr(board!)
      const box = st.boxes[board!]
      const o = edits.outline(st.doc, board!, st.boxes)
      const out = await edits.request({
        prompt, artboardId: board!, outline: o.text, ids: o.ids,
        width: Math.round(box?.w ?? 1280), tokens: tokensOf(node.style),
        ...(provider ? { provider } : {}),
      })
      const applied = await act('generate_edits', `${out.label}: ${out.summary ?? prompt.slice(0, 60)}`, [], () => edits.apply(out.ops))
      const touched = applied.flatMap(a => a.ids)
      if (touched.length) S().touch(touched)
      if (S().fitBoard(board!)) S().dropSnapshot()
      return {
        artboardId: board,
        by: { provider: out.provider, label: out.label, model: out.model },
        summary: out.summary,
        applied: applied.map(a => ({ op: a.op, target: a.target, ids: a.ids, ...(a.error && { error: a.error }) })),
        ...(out.dropped.length && { dropped: out.dropped }),
        nodes: touched.slice(0, 40).map(id => {
          const b = S().boxes[id]
          return { id, tag: S().doc.nodes[id]?.tag, box: b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } }
        }),
      }
    },
  },

  {
    name: 'list_comments',
    description:
      'The notes people have pinned to nodes, open ones first. Each carries the '
      + 'node id, that node\'s tag, name and text, and what was asked. This is '
      + 'the work queue: read a comment, look at its node with get_node, make '
      + 'the change with set_text, set_style, write_html or generate_edits, '
      + 'then call resolve_comment with a one line reply saying what you did.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { includeResolved: { type: 'boolean', description: 'Also return resolved ones. Default false.' } },
    },
    execute: ({ includeResolved }: { includeResolved?: boolean }) => {
      const { doc } = S()
      const all = (doc.comments ?? []).filter(c => includeResolved || !c.resolved)
      return {
        open: (doc.comments ?? []).filter(c => !c.resolved).length,
        comments: all.map(c => {
          const n = doc.nodes[c.node]
          return {
            id: c.id, node: c.node, text: c.text, by: c.by, resolved: !!c.resolved, ...(c.reply && { reply: c.reply }),
            target: n ? { tag: n.tag, name: n.name, text: n.text?.slice(0, 80), artboard: artboardOf(doc, c.node) } : null,
          }
        }),
      }
    },
  },

  {
    name: 'add_comment',
    description:
      'Pin a note to a node, as the agent: a question for the person, or a '
      + 'suggestion you did not act on. It shows as a pin on the canvas.',
    inputSchema: {
      type: 'object',
      properties: { node: { type: 'string' }, text: { type: 'string' } },
      required: ['node', 'text'],
    },
    execute: async ({ node, text }: { node: string; text: string }) => {
      nodeOr(node)
      const id = await act('add_comment', `${node}: ${text.slice(0, 60)}`, [node], () => S().addComment(node, text, 'agent'))
      return { id, node }
    },
  },

  {
    name: 'resolve_comment',
    description:
      'Mark a comment done, with a one line reply that appears under the pin '
      + '("Shortened to five words", "Set to #16a34a"). Call it after the change '
      + 'has landed, not before.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, reply: { type: 'string' } },
      required: ['id'],
    },
    execute: async ({ id, reply }: { id: string; reply?: string }) => {
      const c = (S().doc.comments ?? []).find(x => x.id === id)
      if (!c) fail(`No comment ${id}.`)
      await act('resolve_comment', `${id}${reply ? `: ${reply.slice(0, 60)}` : ''}`, [c!.node], () => S().resolveComment(id, reply))
      return { id, node: c!.node, resolved: true, open: (S().doc.comments ?? []).filter(x => !x.resolved).length }
    },
  },

  {
    name: 'set_tokens',
    description:
      'Read or write the design tokens on an artboard. Tokens are real CSS '
      + 'custom properties, so once --brand exists you can use var(--brand) in '
      + 'any style on that artboard and changing the token restyles everything '
      + 'at once. Names may be given with or without the leading dashes. Pass an '
      + 'empty value to remove one, or omit tokens entirely to just read them.',
    inputSchema: {
      type: 'object',
      properties: {
        artboardId: { type: 'string', description: 'Defaults to the first artboard.' },
        tokens: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'e.g. { "brand": "#ff5c38", "radius": "14px" }.',
        },
      },
    },
    execute: async ({ artboardId, tokens }: { artboardId?: string; tokens?: Record<string, string> }) => {
      const board = artboardId ?? S().doc.artboards[0]
      if (!board) fail('The file has no artboards yet.')
      nodeOr(board)

      if (tokens && Object.keys(tokens).length) {
        const patch: Style = {}
        for (const [k, v] of Object.entries(tokens)) {
          patch[k.startsWith('--') ? k : `--${k}`] = String(v)
        }
        await act('set_tokens', `${Object.keys(tokens).join(', ')} on ${board}`, [board], () =>
          S().patchStyle([board], patch))
      }
      return { artboardId: board, tokens: tokensOf(S().doc.nodes[board].style) }
    },
  },

  {
    name: 'set_attributes',
    description:
      "Change a node's HTML tag, its layer name, or its attributes (href, alt, "
      + 'placeholder, aria-label and so on). Changing the tag is how a div becomes '
      + 'an h1 without losing its style.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        tag: { type: 'string', description: 'e.g. h1, p, button, a, section.' },
        name: { type: 'string', description: 'What the layers panel shows.' },
        attributes: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Merged into the existing attributes. Empty string removes one.',
        },
      },
      required: ['id'],
    },
    execute: async ({ id, tag, name, attributes }: { id: string; tag?: string; name?: string; attributes?: Record<string, string> }) => {
      nodeOr(id)
      if (!tag && !name && !attributes) fail('Nothing to change.')
      await act('set_attributes', `${id}: ${[tag && `tag=${tag}`, name && 'name', attributes && 'attrs'].filter(Boolean).join(' ')}`, [id], () => {
        if (tag) S().setTag(id, tag.toLowerCase())
        if (name) S().rename(id, name)
        if (attributes) S().setProps(id, attributes)
      })
      return describe(S().doc, id)
    },
  },

  {
    name: 'delete_nodes',
    description: 'Remove nodes and everything inside them. Undoable.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
    },
    execute: async ({ ids }: { ids: string[] }) => {
      idsOr(ids)
      const names = ids.map(id => S().doc.nodes[id].name)
      await act('delete_nodes', names.join(', '), [], () => S().remove(ids))
      return { deleted: ids, remaining: Object.keys(S().doc.nodes).length }
    },
  },

  {
    name: 'duplicate_nodes',
    description: 'Copy nodes in place, alongside the originals. Returns the new ids.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
    },
    execute: async ({ ids }: { ids: string[] }) => {
      idsOr(ids)
      const before = new Set(Object.keys(S().doc.nodes))
      await act('duplicate_nodes', ids.join(', '), [], () => S().duplicate(ids))
      const made = Object.keys(S().doc.nodes).filter(id => !before.has(id))
      S().touch(made)
      return { created: made.map(id => describe(S().doc, id)) }
    },
  },

  {
    name: 'move_node',
    description:
      'Reparent a node, or change its paint order among its siblings. A later '
      + 'sibling draws on top.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        parentId: { type: 'string', description: 'New parent. Omit to keep the current one.' },
        before: { type: 'string', description: 'Insert ahead of this sibling. Omit for last.' },
        order: {
          type: 'string',
          enum: ['front', 'back', 'up', 'down'],
          description: 'Reorder within the current parent instead of reparenting.',
        },
      },
      required: ['id'],
    },
    execute: async ({ id, parentId, before, order }: { id: string; parentId?: string; before?: string; order?: ops.Reorder }) => {
      nodeOr(id)
      if (parentId) nodeOr(parentId)
      if (!parentId && !order) fail('Pass parentId, order, or both.')
      await act('move_node', `${id} → ${parentId ?? order}`, [id], () => {
        if (parentId) S().move(id, parentId, before ?? null)
        if (order) S().reorder([id], order)
      })
      return describe(S().doc, id)
    },
  },

  {
    name: 'group_nodes',
    description:
      'Wrap siblings in a frame, or unwrap a frame back into its parent. '
      + 'Grouping is how you get a container you can then make a flex row.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        ungroup: { type: 'boolean', description: 'Unwrap the given frames instead.' },
      },
      required: ['ids'],
    },
    execute: async ({ ids, ungroup }: { ids: string[]; ungroup?: boolean }) => {
      idsOr(ids)
      const before = new Set(Object.keys(S().doc.nodes))
      await act(ungroup ? 'ungroup' : 'group', ids.join(', '), ids, () =>
        ungroup ? S().ungroup(ids) : S().group(ids))
      const made = Object.keys(S().doc.nodes).filter(id => !before.has(id))
      if (made.length) S().touch(made)
      return {
        ...(made.length ? { group: describe(S().doc, made[0]) } : {}),
        selection: S().sel,
      }
    },
  },

  {
    name: 'select_nodes',
    description:
      'Select nodes in the editor, which moves the person\'s selection and shows '
      + 'them the handles. Use it to point at what you are talking about instead '
      + 'of describing where it is.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
    },
    execute: async ({ ids }: { ids: string[] }) => {
      idsOr(ids)
      await act('select_nodes', ids.join(', '), ids, () => S().select(ids))
      return { selection: ids.map(id => describe(S().doc, id)) }
    },
  },

  {
    name: 'apply_effect',
    description:
      'Apply a named visual effect, CSS gradient, or page texture — mesh, aurora, '
      + 'dawn, dusk, sunset, mint, ink, champagne, twilight, ember, ocean, bloom, '
      + 'haze, film grain, halftone, fluted and frosted glass, plus artboard fills '
      + 'like newsprint, kraft, linen, canvas_weave, fine_grain, coarse_grain, '
      + 'film_dust, grid, dot_grid, graph_paper, soft_wash, dawn_wash, marble, '
      + 'ascii_dither. Each one is plain CSS rather than a canvas, so it exports '
      + 'with the design and you can then tune any of its properties with set_style. '
      + 'Pass effect: null to clear. For a photograph as the fill, use set_background.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        effect: {
          type: ['string', 'null'],
          enum: [...effectNames, null],
          description: 'The effect to apply, or null to remove whatever is there.',
        },
      },
      required: ['ids'],
    },
    execute: async ({ ids, effect }: { ids: string[]; effect?: string | null }) => {
      idsOr(ids)
      if (effect != null && !effectOf(effect)) {
        fail(`No effect "${effect}". Have: ${effectNames.join(', ')}.`)
      }
      await act('apply_effect', `${effect ?? 'none'} on ${ids.join(', ')}`, ids, () =>
        S().patchStyle(ids, effectPatch(effect ?? null)))
      return { nodes: ids.map(id => describe(S().doc, id)) }
    },
  },

  {
    name: 'set_background',
    description:
      'Set an artboard or frame background image from a URL or a data URI. '
      + 'It lands as background-image at cover, the same write the inspector '
      + 'makes, so it undoes and it exports. Pass src: null to clear. Pass a '
      + 'prompt to generate one at the node\'s size instead. Named CSS textures '
      + '(newsprint, kraft, linen, …) go through apply_effect.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' } },
        src: {
          type: ['string', 'null'],
          description: 'https URL or data: URI, or null to clear.',
        },
        prompt: {
          type: 'string',
          description: 'Generate a background instead of passing src.',
        },
      },
      required: ['ids'],
    },
    execute: async ({ ids, src, prompt }: { ids: string[]; src?: string | null; prompt?: string }) => {
      idsOr(ids)
      if (prompt?.trim()) {
        const box = S().boxes[ids[0]]
        const n = S().doc.nodes[ids[0]]
        const w = box?.w ?? (Number.parseFloat(n?.style.width ?? '') || 1280)
        const h = box?.h ?? (Number.parseFloat(n?.style.height ?? '') || 832)
        const want = w / Math.max(1, h)
        const ratios: [string, number][] = [
          ['1:1', 1], ['3:2', 1.5], ['2:3', 2 / 3], ['16:9', 16 / 9],
          ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:4', 0.75],
        ]
        const ratio = ratios.reduce((best, o) =>
          Math.abs(o[1] - want) < Math.abs(best[1] - want) ? o : best)[0]
        const made = await gen.oneImage({ prompt, ratio })
        await act('set_background', `generated on ${ids.join(', ')}`, ids, () =>
          S().patchStyle(ids, imageBgPatch(made.src)))
        return {
          nodes: ids.map(id => describe(S().doc, id)),
          generated: { by: made.label, model: made.model, embedded: made.embedded },
          ...(made.note && { note: made.note }),
        }
      }
      if (src === undefined) fail('Pass src, src: null, or a prompt.')
      if (src && !/^(https?:|data:)/.test(src)) {
        fail('src must be an http(s) URL or a data: URI.')
      }
      await act('set_background', `${src ? src.slice(0, 60) : 'clear'} on ${ids.join(', ')}`, ids, () =>
        S().patchStyle(ids, imageBgPatch(src || null)))
      return { nodes: ids.map(id => describe(S().doc, id)) }
    },
  },

  {
    name: 'export_code',
    description:
      'Hand the design off as code. Inline HTML, a standalone page, React with '
      + 'inline styles, or React with Tailwind classes. What comes out is what is '
      + 'on the canvas, because the canvas was already this.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node or artboard. Omit for the first artboard.' },
        as: {
          type: 'string',
          enum: ['html', 'page', 'jsx', 'tailwind'],
          description: 'Defaults to html.',
        },
      },
    },
    execute: ({ id, as }: { id?: string; as?: string }) => {
      const { doc } = S()
      const target = id ?? doc.artboards[0]
      if (!target) fail('The file has no artboards yet.')
      nodeOr(target)
      const code = as === 'page' ? toPage(doc, target, doc.nodes[target].name)
        : as === 'jsx' ? toJsx(doc, target, 'inline')
          : as === 'tailwind' ? toJsx(doc, target, 'tailwind')
            : toHtml(doc, target)
      return { format: as ?? 'html', id: target, code }
    },
  },

  {
    name: 'extract_colours',
    description:
      'Every colour the design actually uses, with how many nodes use each and '
      + 'which property it came from. Useful before recolouring, so you change '
      + 'the palette rather than guessing at it.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        artboardId: { type: 'string', description: 'Limit to one artboard.' },
      },
    },
    execute: ({ artboardId }: { artboardId?: string }) => {
      if (artboardId) nodeOr(artboardId)
      return { colours: palette(S().doc, artboardId) }
    },
  },

  {
    name: 'undo',
    description:
      'Step the document back. The same stack the person\'s cmd-z uses, so this '
      + 'undoes whichever of you went last.',
    inputSchema: {
      type: 'object',
      properties: {
        times: { type: 'number', description: 'How many steps. Defaults to 1.' },
      },
    },
    execute: async ({ times }: { times?: number }) => {
      const n = Math.max(1, Math.min(20, times ?? 1))
      await act('undo', `${n} step${n > 1 ? 's' : ''}`, [], () => {
        for (let i = 0; i < n; i++) S().undo()
      })
      return { nodeCount: Object.keys(S().doc.nodes).length }
    },
  },
]

// ------------------------------------------------------------------- register

/**
 * Register everything, and hand back a teardown.
 *
 * Errors are turned into readable sentences rather than thrown stacks: a tool
 * result is something a model has to read and recover from, so "No node
 * frame9" plus a hint about `get_document` is worth more than a type error.
 */
export async function registerTools(): Promise<{ count: number; off: () => void }> {
  const mc = modelContext()
  if (!mc) return { count: 0, off: () => {} }

  const ac = new AbortController()
  for (const tool of TOOLS) {
    const bare = tool.execute
    await mc.registerTool({
      ...tool,
      execute: async (input: never, ctx: { signal?: AbortSignal }) => {
        try {
          return await bare(input ?? ({} as never), ctx)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return { error: message }
        }
      },
    }, { signal: ac.signal })
  }
  return { count: TOOLS.length, off: () => ac.abort() }
}

export const toolNames = TOOLS.map(t => t.name)

/**
 * Call a tool directly, by name.
 *
 * This is the same closure WebMCP invokes, so exercising it is a real test of
 * the tool and not of a copy. It is also the fallback demo path: a browser
 * without the WebMCP flag can still drive the whole agent surface from the
 * console, and DevTools becomes a usable client.
 */
// every execute notes its input on the way in, for `act` to log
for (const t of TOOLS) {
  const raw = t.execute
  t.execute = (input, ctx) => { calling = input; return raw(input, ctx) }
}

export async function callTool(name: string, input: unknown = {}): Promise<unknown> {
  const tool = TOOLS.find(t => t.name === name)
  if (!tool) return { error: `No tool "${name}". Have: ${toolNames.join(', ')}.` }
  try {
    return await tool.execute(input as never, {})
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** the tool manifest, for the panel that lists what the agent can do */
export const toolManifest = TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  readOnly: t.annotations?.readOnlyHint === true,
  params: Object.keys(
    (t.inputSchema as { properties?: object } | undefined)?.properties ?? {}),
  required: ((t.inputSchema as { required?: string[] } | undefined)?.required ?? []),
}))
