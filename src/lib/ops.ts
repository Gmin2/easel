// addressed edits: the model answers with ops aimed at node ids, and this is
// the one place they are turned into store actions. see api/_edits.ts for the
// other half and the envelope the server validates.

import * as auth from './auth'
import * as clean from './clean'
import { cssToStyle } from '../doc/html'
import { useEditor } from '../doc/store'
import type { Doc } from '../doc/types'

export type Op =
  | { op: 'insert'; target: string; code: string; name?: string; after?: string }
  | { op: 'replace'; target: string; code: string; name?: string }
  | { op: 'style'; target: string; css: string }
  | { op: 'text'; target: string; text: string }
  | { op: 'delete'; target: string }

export interface EditsOut {
  provider: string
  label: string
  model: string
  ops: Op[]
  summary?: string
  dropped: string[]
}

type Box = { x: number; y: number; w: number; h: number }

/**
 * The artboard as one line per node, which is how the model learns the ids it
 * may aim at. Boxes are included because "put it below the hero" needs a
 * number, and a few words of text because "the CTA" has to be findable.
 */
export function outline(doc: Doc, rootId: string, boxes: Record<string, Box | undefined>, max = 400): { text: string; ids: string[] } {
  const lines: string[] = []
  const ids: string[] = []
  const walk = (id: string, depth: number) => {
    const n = doc.nodes[id]
    if (!n || lines.length >= max) return
    const b = boxes[id]
    const box = b ? ` [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}]` : ''
    const text = n.text ? ` "${n.text.replace(/\s+/g, ' ').slice(0, 48)}${n.text.length > 48 ? '…' : ''}"` : ''
    const name = n.name && n.name !== n.tag ? ` (${n.name})` : ''
    lines.push(`${'  '.repeat(depth)}${id} <${n.tag}>${name}${box}${text}`)
    ids.push(id)
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(rootId, 0)
  if (lines.length >= max) lines.push(`… only the first ${max} nodes are shown`)
  return { text: lines.join('\n'), ids }
}

/**
 * The outline for an adaptation: only what has to change. Every text node
 * with its words, plus the ids that carry the page's accent colours, so the
 * model can retint without seeing the whole tree.
 */
export function textOutline(doc: Doc, rootId: string, max = 400): { text: string; ids: string[] } {
  const lines: string[] = []
  const ids: string[] = []
  const colours = new Map<string, string[]>()
  const walk = (id: string) => {
    const n = doc.nodes[id]
    if (!n || lines.length >= max) return
    if (n.text && n.text.trim()) {
      lines.push(`${id} <${n.tag}> "${n.text.replace(/\s+/g, ' ').slice(0, 90)}${n.text.length > 90 ? '…' : ''}"`)
      ids.push(id)
    }
    for (const k of ['background', 'backgroundColor', 'color', 'borderColor'] as const) {
      const v = n.style[k]
      if (v && accent(v)) { colours.set(v, [...(colours.get(v) ?? []), id]); if (!ids.includes(id)) ids.push(id) }
    }
    for (const c of n.children) walk(c)
  }
  walk(rootId)
  const accents = [...colours.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
    .map(([v, on]) => `${v} on ${on.slice(0, 12).join(', ')}${on.length > 12 ? ` and ${on.length - 12} more` : ''}`)
  const text = lines.join('\n') + (accents.length ? `\n\nACCENTS\n${accents.join('\n')}` : '')
  return { text, ids }
}

/** a colour worth calling an accent: saturated, not white, black or grey */
function accent(v: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim()) ?? /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(v.trim())
  let r: number, g: number, b: number
  if (!m) return false
  if (m[0].startsWith('#')) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16) }
  else { r = Number(m[1]); g = Number(m[2]); b = Number(m[3]) }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max - min > 60
}

export async function request(input: {
  prompt: string; artboardId: string; outline: string; ids: string[]; width: number
  tokens?: Record<string, string>; exemplar?: { title: string; html: string }; exemplarId?: string; provider?: string; fileId?: string
}): Promise<EditsOut> {
  if (!auth.guestCanGenerate()) {
    auth.requestSignIn()
    throw new Error('That was the free one. Sign in to keep generating; your files stay where they are.')
  }
  let res: Response
  try {
    res = await fetch('/api/edits', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await auth.headers()) },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Could not reach the edits endpoint. Is the dev server running?')
  }
  // a guest asked for something that spends a key: ask for the account instead of failing
  if (res.status === 401) {
    auth.requestSignIn()
    throw new Error('Sign in to generate. Your files stay where they are.')
  }
  const body = await res.json().catch(() => null) as (EditsOut & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? `The editor answered ${res.status}.`)
  auth.guestGenerated()
  return body
}

export interface Applied {
  op: Op['op']
  target: string
  ids: string[]
  error?: string
}

/**
 * Run ops through the same actions the buttons call, as one undo step.
 *
 * Each store action pushes its own history entry; every one after the first
 * is dropped again so that a whole answer, however many ops, is one ⌘Z.
 */
export function apply(ops: Op[]): Applied[] {
  return applyOne(ops, false)
}

/**
 * The same ops, one at a time with a beat between them and the agent's
 * cursor visiting each target, so an edit reads as someone moving through
 * the page. Still one undo step.
 */
export async function applyPaced(ops: Op[], label: string, gap = 260, fold = false): Promise<Applied[]> {
  const s = useEditor.getState
  const out: Applied[] = []
  let first = !fold
  for (const o of ops) {
    const b = s().boxes[o.target]
    if (b) s().setCursor({ x: b.x + Math.min(24, b.w / 2), y: b.y + Math.min(18, b.h / 2), label, busy: true })
    await new Promise(r => setTimeout(r, gap))
    const [a] = applyOne([o], !first)
    first = false
    out.push(a)
    if (a.ids[0]) s().touch(a.ids)
    await settled()
  }
  const last = out.at(-1)?.ids[0] ?? ops.at(-1)?.target
  const b = last ? s().boxes[last] : undefined
  if (b) s().setCursor({ x: b.x + b.w, y: b.y + b.h, label, busy: false })
  setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
  void s().refreshThumb()
  return out
}

const settled = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/**
 * Ops applied as they arrive, one at a time under the cursor.
 *
 * `push` queues an op from any stream; the consumer drains the queue with a
 * beat between ops and the cursor on each target. `done` waits for the queue
 * to empty and returns everything applied. One undo step: the first op folds
 * into whatever landed before, and the rest fold into the first.
 */
export function progressive(label: string, gap = 140, onProgress?: (n: number) => void) {
  const s = useEditor.getState
  const queue: Op[] = []
  const out: Applied[] = []
  let running: Promise<void> | null = null
  let name = label
  const drain = async () => {
    while (queue.length) {
      const o = queue.shift()!
      const b = s().boxes[o.target]
      const verb = o.op === 'text' ? 'rewriting' : o.op === 'style' ? 'recolouring' : o.op === 'delete' ? 'removing' : 'adding'
      if (b) s().setCursor({ x: b.x + Math.min(24, b.w / 2), y: b.y + Math.min(18, b.h / 2), label: `${name} · ${verb}`, busy: true })
      await new Promise(r => setTimeout(r, gap))
      const [a] = applyOne([o], true)
      out.push(a)
      onProgress?.(out.length)
      s().unveil([o.target, ...a.ids])
      if (a.ids[0]) {
        s().touch(a.ids)
        const el = document.querySelector<HTMLElement>(`[data-easel="${a.ids[0]}"]`)
        el?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' })
      }
      await settled()
    }
    running = null
  }
  return {
    label(l: string) { name = l },
    push(op: Op) { queue.push(op); running ??= drain() },
    async done(): Promise<Applied[]> {
      while (running) await running
      const last = out.at(-1)?.ids[0]
      const b = last ? s().boxes[last] : undefined
      if (b) s().setCursor({ x: b.x + b.w, y: b.y + b.h, label: name, busy: false })
      setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
      return out
    },
  }
}

function applyOne(ops: Op[], fold: boolean): Applied[] {
  const s = useEditor.getState
  const out: Applied[] = []
  let first = !fold
  const step = (run: () => string[]): string[] => {
    const ids = run()
    if (first) first = false
    else s().dropSnapshot()
    return ids
  }
  for (const o of ops) {
    try {
      if (!s().doc.nodes[o.target]) throw new Error(`no node ${o.target}`)
      let ids: string[] = []
      if (o.op === 'insert' || o.op === 'replace') {
        const html = clean.fragment(o.code)
        ids = step(() => s().insertHtml(o.target, html, o.op === 'insert' ? 'insert' : 'replace'))
        if (o.name && ids[0]) { s().rename(ids[0], o.name); s().dropSnapshot() }
        // "after" places the new roots right behind a sibling instead of at the end
        if (o.op === 'insert' && o.after) {
          const parent = s().doc.nodes[o.target]
          const roots = ids.filter(id => s().doc.nodes[id]?.parent === o.target)
          const i = parent?.children.indexOf(o.after) ?? -1
          if (parent && i >= 0) {
            const before = parent.children.find((c, k) => k > i && !roots.includes(c)) ?? null
            for (const r of roots) { s().move(r, o.target, before); s().dropSnapshot() }
          }
        }
      } else if (o.op === 'style') {
        ids = step(() => { s().patchStyle([o.target], cssToStyle(o.css)); return [o.target] })
      } else if (o.op === 'text') {
        ids = step(() => { s().setText(o.target, o.text); return [o.target] })
      } else {
        ids = step(() => { s().remove([o.target]); return [] })
      }
      out.push({ op: o.op, target: o.target, ids })
    } catch (e) {
      out.push({ op: o.op, target: o.target, ids: [], error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/**
 * The page as a short brief, for anything generated onto a board that already
 * has content. Brand, names and facts already on the page, the fonts, the
 * accent colours and a line of copy for the voice. Under 700 characters, so
 * it rides along with every request without crowding it.
 */
/**
 * Whether a board is a phone screen: narrow itself, or holding a phone
 * frame (a tall node a few hundred px wide with rounded corners).
 *
 * Once a file is a mobile ui, every screen that follows has to stay one, so
 * this is what the prompt bar and the context line key off.
 */
export function isMobile(doc: Doc, boardId: string, boxes?: Record<string, { w: number; h: number }>): boolean {
  const px = (v: string | undefined) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0 }
  const board = doc.nodes[boardId]
  if (!board) return false
  const bw = boxes?.[boardId]?.w || px(board.style.width)
  if (bw && bw <= 520) return true
  let found = false
  const walk = (id: string, depth: number) => {
    if (found || depth > 5) return
    const n = doc.nodes[id]
    if (!n) return
    const st = n.style
    const w = boxes?.[id]?.w || px(st.width)
    const h = boxes?.[id]?.h || px(st.height) || px(st.minHeight)
    const r = Math.max(px(st.borderRadius), px(st.borderTopLeftRadius), px(st.borderTopRightRadius))
    const bezel = Math.max(px(st.borderWidth), px(st.borderTopWidth), px(st.borderLeftWidth))
    // a phone: a few hundred px wide with rounded corners, and either tall
    // or wearing a thick bezel border when its height is left to its content
    if (w >= 300 && w <= 480 && r >= 24 && (h >= 560 || (!h && bezel >= 6))) { found = true; return }
    for (const c of n.children) walk(c, depth + 1)
  }
  for (const c of board.children) walk(c, 1)
  return found
}

export function pageContext(doc: Doc, boardId: string): string | null {
  const board = doc.nodes[boardId]
  if (!board || !board.children.length) return null
  const heads: string[] = [], links: string[] = [], paras: string[] = []
  const fonts = new Map<string, number>(), colours = new Map<string, number>()
  let brand: string | null = null
  const walk = (id: string, depth: number) => {
    const n = doc.nodes[id]
    if (!n) return
    const t = (n.text ?? '').replace(/\s+/g, ' ').trim()
    if (t) {
      if (/^h[1-3]$/.test(n.tag) && heads.length < 4) heads.push(t.slice(0, 80))
      else if (n.tag === 'p' && paras.length < 2 && t.length > 40) paras.push(t.slice(0, 160))
      else if ((n.tag === 'a' || n.tag === 'button') && links.length < 8 && t.length < 24) links.push(t)
      if (!brand && depth <= 3 && t.length <= 18 && (n.tag === 'a' || n.tag === 'span' || n.tag === 'div') && /^[A-Z][\w.&-]*( [A-Z][\w.&-]*)?$/.test(t)) brand = t
    }
    const f = n.style.fontFamily
    if (f) fonts.set(f, (fonts.get(f) ?? 0) + 1)
    for (const k of ['background', 'backgroundColor', 'color'] as const) {
      const v = n.style[k]
      if (v && accent(v)) colours.set(v, (colours.get(v) ?? 0) + 1)
    }
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(boardId, 0)
  const top = (m: Map<string, number>, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v]) => v)
  const parts: string[] = []
  if (isMobile(doc, boardId)) parts.push('Format: mobile app screen inside a phone frame. Every screen in this file is one.')
  if (brand) parts.push(`Brand: ${brand}`)
  if (heads.length) parts.push(`Headlines on the page: ${heads.map(h => `"${h}"`).join('; ')}`)
  if (links.length) parts.push(`Nav and button labels: ${links.join(', ')}`)
  const fl = top(fonts, 2)
  if (fl.length) parts.push(`Fonts: ${fl.map(f => f.split(',')[0].replace(/["']/g, '')).join(', ')}`)
  const cl = top(colours, 4)
  if (cl.length) parts.push(`Accent colours: ${cl.join(', ')}`)
  const bg = board.style.background ?? board.style.backgroundColor
  if (bg) parts.push(`Page background: ${bg}`)
  if (paras.length) parts.push(`Voice, from the page: "${paras[0]}"`)
  return parts.join('\n').slice(0, 700)
}

/** the page's accent colours and mood as one line for a picture or vector prompt */
export function paletteHint(doc: Doc, board: string): string | null {
  const ctx = pageContext(doc, board)
  if (!ctx) return null
  const colours = /Accent colours: ([^\n]+)/.exec(ctx)?.[1]
  const bg = /Page background: ([^\n]+)/.exec(ctx)?.[1]
  const brand = /Brand: ([^\n]+)/.exec(ctx)?.[1]
  const bits = [colours ? `Palette: ${colours}` : null, bg ? `on ${bg}` : null, brand ? `for the brand ${brand}` : null].filter(Boolean)
  return bits.length ? `Match the page it sits on. ${bits.join(', ')}. No text, no logos.` : null
}
