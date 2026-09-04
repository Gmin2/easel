/**
 * Addressed edits instead of one blob.
 *
 * The design route asks for a fragment and lands it under an artboard. That is
 * right for "give me a pricing section" and wrong for "make the CTA green",
 * because the model has no way to point at the button. Here the model is shown
 * an outline of the artboard (ids, tags, names, a few words of text) and
 * answers with a list of operations, each aimed at a node id: insert or replace
 * markup under it, restyle it, or change its text. The payload for markup is
 * still HTML with inline CSS, since that is the material the document is made
 * of and the thing models write best; the envelope around it is structured so
 * the client applies it with store actions and never has to guess.
 */

import { MECHANICS, TASTE } from './_prompt.js'
import { ProviderError, chatComplete, chats, stripFences } from './_providers.js'

export interface EditsBrief {
  prompt: string
  width: number
  /** the artboard as the model sees it, one node per line: id tag "name" text */
  outline: string
  artboardId: string
  page?: string
  tokens?: Record<string, string>
  exemplar?: { title: string; html: string }
  /** adapt: the page on the board is a reference to make the brief's own */
  mode?: 'edit' | 'adapt'
  /** the page this joins, when it already has content */
  context?: string
}

export type Op =
  | { op: 'insert'; target: string; code: string; name?: string; page?: string; after?: string }
  | { op: 'replace'; target: string; code: string; name?: string; page?: string }
  | { op: 'style'; target: string; css: string; page?: string }
  | { op: 'text'; target: string; text: string; page?: string }
  | { op: 'delete'; target: string; page?: string }

export interface EditsResult {
  kind: 'edits'
  provider: string
  label: string
  model: string
  ops: Op[]
  /** what the model said it did, one line, for the activity feed */
  summary?: string
}

const ENVELOPE = `
OUTPUT
Return one JSON object and nothing else, no prose, no fences:
{ "summary": "<one line, what you did>",
  "ops": [
    { "op": "insert",  "target": "<parent node id>", "after": "<sibling id, optional>", "name": "<layer name>", "code": "<html fragment>" },
    { "op": "replace", "target": "<node id>", "code": "<html fragment>" },
    { "op": "style",   "target": "<node id>", "css": "<css declarations, e.g. background:#16a34a;color:#fff>" },
    { "op": "text",    "target": "<node id>", "text": "<new text>" },
    { "op": "delete",  "target": "<node id>" }
  ] }

ADDRESSING
- Every target must be an id from the OUTLINE below. Never invent ids.
- insert adds new children under the target (use the artboard id to add a new
  section, a frame id to add inside it). Give "after" to place the new content
  right after an existing child of that target, so "a list under the intro
  paragraph" is an insert into the paragraph's parent with after set to the
  paragraph, never a replace of the paragraph. replace swaps the target's children
  for the fragment. style merges declarations into the target's own style.
  text replaces a leaf's text. delete removes the node and its children.
- Prefer the smallest op that does the job: a colour change is one style op,
  not a replace. A new section is one insert with the whole fragment.
- The fragment rules below apply to every "code" value. A fragment for insert
  under the artboard has one root, positioned absolute with left, top and an
  explicit width, placed below the existing content (the OUTLINE gives each
  node's box). A fragment inserted inside a frame is flow content: no position.
- Keep ops to what was asked. Do not restyle things nobody mentioned.
- Never write a real company, product or person name, a logo, a brand mark, a
  trademark symbol or an emoji. Wordmarks are plain text of an invented name.
`.trim()

export function editsSystem(brief: EditsBrief): string {
  const tokens = Object.entries(brief.tokens ?? {})
  const tokenRules = tokens.length
    ? `DESIGN TOKENS\nThe artboard defines these CSS custom properties; reference them as var(--name):\n${tokens.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    : 'DESIGN TOKENS\nNone defined; use literal values.'
  return `You edit a design document for Easel, a canvas whose document is real HTML
with real inline CSS. A person is looking at the artboard right now and will
keep editing after you. You answer with a list of addressed operations.

The artboard is ${brief.width}px wide. Its id is ${brief.artboardId}.

${ENVELOPE}

FRAGMENT RULES
${MECHANICS}

${tokenRules}

${TASTE}`
}

export function editsUser(brief: EditsBrief): string {
  const ctx = brief.context ? `\n\nPAGE CONTEXT\nThis page continues an existing one. Keep its brand, names, fonts, colours and voice:\n${brief.context}` : ''
  let s = brief.mode === 'adapt'
    ? `BRIEF\n${brief.prompt}${ctx}\n\nThe artboard holds a finished reference page. Make it the brief's own page:
- rewrite every text node in the OUTLINE with a text op: brand and product
  names, nav labels, headlines, copy, button labels, footer lines, all of it,
  in the brief's voice and subject. Keep each about the same length so the
  layout holds. Do not skip nodes; every id in the outline gets a text op
  unless it is a number, a date or a price that still fits.
- change the accent colour to one that suits the brief with style ops on the
  ids listed under ACCENTS, and the same colour everywhere it appears.
- never invent ids, never insert or delete, never restyle layout.
- names, products, people and places are invented; nothing may point at a
  real business, and no logos or emoji.\n\nOUTLINE\n${brief.outline}`
    : `REQUEST\n${brief.prompt}${ctx}\n\nOUTLINE\n${brief.outline}`
  if (brief.exemplar) {
    s += `\n\nREFERENCE\nA published site of the same kind ("${brief.exemplar.title}"), already in this
document's html. Match its structure, spacing and type scale for anything new
you insert, but change the look: other accent colour, other copy, invented
names, no logos, brand marks or symbols. IMAGE marks a picture, put a plain
coloured frame there. It may be cut off.\n<exemplar>\n${brief.exemplar.html}\n</exemplar>`
  }
  return s
}

const OPS = new Set(['insert', 'replace', 'style', 'text', 'delete'])

/** the model's answer as ops, or a clear reason it is not */
export function parseOps(text: string, known: Set<string>): { ops: Op[]; summary?: string; dropped: string[] } {
  let raw = stripFences(text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0) throw new ProviderError(`The model answered with prose rather than JSON: ${raw.slice(0, 120).replace(/\s+/g, ' ')}`, 502)
  raw = raw.slice(start, end + 1)
  let obj: { ops?: unknown; summary?: unknown }
  try { obj = JSON.parse(raw) } catch {
    throw new ProviderError('The model returned JSON that does not parse.', 502)
  }
  if (!Array.isArray(obj.ops)) throw new ProviderError('The model returned no ops array.', 502)

  const ops: Op[] = []
  const dropped: string[] = []
  for (const o of obj.ops as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object') { dropped.push('not an object'); continue }
    const op = String(o.op ?? '')
    const target = String(o.target ?? '')
    if (!OPS.has(op)) { dropped.push(`unknown op "${op}"`); continue }
    if (!known.has(target)) { dropped.push(`${op} aimed at unknown id "${target}"`); continue }
    if (op === 'insert' || op === 'replace') {
      const code = typeof o.code === 'string' ? scrub(o.code) : ''
      if (!/<[a-z]/i.test(code)) { dropped.push(`${op} on ${target} had no markup`); continue }
      const after = op === 'insert' && typeof o.after === 'string' && known.has(o.after) ? o.after : undefined
      ops.push({ op, target, code, ...(typeof o.name === 'string' && { name: o.name.slice(0, 60) }), ...(after && { after }) })
    } else if (op === 'style') {
      const css = typeof o.css === 'string' ? o.css.replace(/[{}<>]/g, '').slice(0, 4000) : ''
      if (!css.includes(':')) { dropped.push(`style on ${target} had no declarations`); continue }
      ops.push({ op, target, css })
    } else if (op === 'text') {
      if (typeof o.text !== 'string') { dropped.push(`text on ${target} had no text`); continue }
      ops.push({ op, target, text: o.text.slice(0, 4000) })
    } else {
      ops.push({ op: 'delete', target })
    }
  }
  return { ops, dropped, ...(typeof obj.summary === 'string' && { summary: obj.summary.slice(0, 200) }) }
}

/** what must never reach a document, removed before the client sees it */
function scrub(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|link|meta|iframe|object|embed|base|form)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1=$2#$2')
    .slice(0, 200000)
}

export async function generateEdits(brief: EditsBrief, known: Set<string>, want?: string): Promise<EditsResult & { dropped: string[] }> {
  const usable = chats().filter(c => c.key)
  if (!usable.length) {
    throw new ProviderError('No design model is configured. Set OPENAI_API_KEY, KIMI_API_KEY or GEMINI_API_KEY.', 400)
  }
  const chat = usable.find(c => c.id === want) ?? usable[0]
  // json mode on the openai compatible surface, which gemini and kimi both honour
  const text = await chatComplete(chat, editsSystem(brief), editsUser(brief), 12000, { response_format: { type: 'json_object' } })
  const { ops, summary, dropped } = parseOps(text, known)
  if (!ops.length) {
    throw new ProviderError(`${chat.label} produced no usable ops${dropped.length ? ` (${dropped[0]})` : ''}.`, 502, chat.id)
  }
  return { kind: 'edits', provider: chat.id, label: chat.label, model: chat.model, ops, dropped, ...(summary && { summary }) }
}
