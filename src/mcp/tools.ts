import { DEVICES } from '../doc/devices'
import { camel, cssToStyle, toHtml, toJsx, toPage } from '../doc/html'
import * as ops from '../doc/ops'
import { useEditor } from '../doc/store'
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
    ...(Object.keys(n.props).length && { attributes: n.props }),
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
  try {
    const value = run()
    if (ids.length) S().touch(ids)
    S().note({ by: 'agent', tool, detail })
    await settle()
    return value
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    S().note({ by: 'agent', tool, detail, error })
    throw e
  }
}

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
            size: box ? { w: Math.round(box.w), h: Math.round(box.h) } : null,
            html: toHtml(doc, id, { ids: true }),
          }
        }),
        nodeCount: Object.keys(doc.nodes).length,
        devices: DEVICES.map(d => d.name),
      }
    },
  },

  {
    name: 'get_node',
    description:
      'One node in full: its tag, text, attributes, the CSS the document holds, '
      + 'and the box the browser actually laid it out at. Use this after a write '
      + 'to check what the layout really did.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The data-easel id.' } },
      required: ['id'],
    },
    execute: ({ id }: { id: string }) => {
      nodeOr(id)
      const { doc } = S()
      return {
        ...describe(doc, id),
        html: toHtml(doc, id, { ids: true }),
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
      'Add an artboard, which is one page or screen of the design. Give either a '
      + 'device name or an explicit size.',
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
      },
    },
    execute: async (input: { name?: string; device?: string; w?: number; h?: number; background?: string }) => {
      const preset = DEVICES.find(d => d.name === input.device)
      const w = input.w ?? preset?.w ?? 1280
      const h = input.h ?? preset?.h ?? 832
      const id = await act('create_artboard', `${input.name ?? input.device ?? 'Artboard'} ${w}×${h}`, [], () =>
        S().createArtboard({
          name: input.name ?? preset?.name, w, h, background: input.background,
        }))
      return { id, ...describe(S().doc, id) }
    },
  },

  {
    name: 'write_html',
    description:
      'The main way to build. Write an HTML fragment into a parent and it becomes '
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
      const { doc } = S()
      const scope = artboardId
        ? [nodeOr(artboardId).id, ...ops.descendants(doc, artboardId)]
        : Object.keys(doc.nodes)
      const seen = new Map<string, { uses: number; where: Set<string> }>()
      const COLOURY = /color|background|border|outline|shadow|fill|stroke/i
      for (const id of scope) {
        for (const [k, v] of Object.entries(doc.nodes[id].style)) {
          if (!COLOURY.test(k)) continue
          for (const m of v.matchAll(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|color)\([^)]*\)/gi)) {
            const key = m[0].toLowerCase()
            const hit = seen.get(key) ?? { uses: 0, where: new Set() }
            hit.uses++
            hit.where.add(k)
            seen.set(key, hit)
          }
        }
      }
      return {
        colours: [...seen.entries()]
          .sort((a, b) => b[1].uses - a[1].uses)
          .map(([value, v]) => ({ value, uses: v.uses, properties: [...v.where] })),
      }
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
export async function registerTools(): Promise<() => void> {
  const mc = modelContext()
  if (!mc) return () => {}

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
  return () => ac.abort()
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
