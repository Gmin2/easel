// a design landing as it is written, shared by the canvas prompt bar and the
// home prompt. see api/_stream.ts for the other half

import * as clean from './clean'
import * as stream from './stream'
import * as refs from './refs'
import * as edits from './ops'
import * as gen from './generate'
import { tokensOf } from './tokens'
import { useEditor } from '../doc/store'

const num = (v: string | undefined) => Number(/^(-?[\d.]+)/.exec((v ?? '').trim())?.[1] ?? 0)
const settle = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** what the cursor says it is doing, from the tag of the piece in flight */
export function verbFor(html: string): string {
  const tag = /^<\s*([a-zA-Z][\w:-]*)/.exec(html)?.[1]?.toLowerCase() ?? 'div'
  if (/^h[1-6]$/.test(tag)) return 'writing headline'
  if (tag === 'p' || tag === 'span' || tag === 'li') return 'writing copy'
  if (tag === 'button' || tag === 'a') return 'placing button'
  if (tag === 'img' || tag === 'svg' || tag === 'figure') return 'placing image'
  if (tag === 'nav' || tag === 'header') return 'building nav'
  if (tag === 'footer') return 'building footer'
  if (tag === 'ul' || tag === 'ol') return 'listing'
  if (tag === 'input' || tag === 'form') return 'adding a field'
  return 'laying out'
}

/** a landed node rises in over a beat instead of popping */
export function rise(id: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-easel="${id}"]`)
    el?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
  })
}

export interface LandOptions {
  signal?: AbortSignal
  onProgress?(count: number): void
  /** the board whose brand and voice this continues, when it is a new board */
  contextFrom?: string
  /** a phone screen: the server hardcodes the phone layout and never lands a template */
  mobile?: boolean
}

/**
 * A design landing as it is written.
 *
 * The root arrives first and goes on the board empty; every child is
 * inserted under it as its markup completes, and the agent's cursor moves to
 * each one. The whole thing stays one undo step: the first insert is the
 * step and every later one drops its own history entry.
 */
export async function landStream(prompt: string, provider: string | null, board: string, at: { x: number; y: number; w: number }, fit: (board: string) => void, opts: LandOptions = {}) {
  const s = useEditor.getState
  const node = s().doc.nodes[board]
  let root: string | null = null
  let model = 'agent'
  let label = 'agent'
  let count = 0
  const say = (verb: string) => { label = `${model} · ${verb}` }
  // parents[d] is where an element at depth d lands; the board is depth 0
  const parents: string[] = [board]
  const place = (b: { x: number; y: number; w: number; h: number }, busy: boolean) =>
    s().setCursor({ x: b.x + Math.min(24, b.w / 2), y: b.y + Math.min(18, b.h / 2), label, busy })
  // the box is measured in a layout effect after the commit, which can be a
  // few frames out; wait for it rather than guess
  const follow = (id: string) => {
    let tries = 0
    const tick = () => {
      const b = s().boxes[id]
      if (b) place(b, true)
      else if (tries++ < 12) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  s().setCursor({ x: at.x + 24, y: at.y + 24, label, busy: true })
  let landed: { id: string; title: string } | null = null
  // a board with content is a page in progress: what lands next belongs to
  // it. a new board beside one continues that one
  const context = edits.pageContext(s().doc, opts.contextFrom ?? board)
  try {
    await stream.design({
      prompt, width: at.w,
      height: Math.round(num(node.style.height)) || undefined,
      tokens: tokensOf(node.style),
      ...(context ? { context } : {}),
      ...(opts.mobile ? { mobile: true } : {}),
      ...(provider ? { provider } : {}),
      ...(s().file ? { fileId: s().file!.id } : {}),
    }, {
      meta: m => { model = m.label; label = `${model} · thinking`; s().setCursor({ x: at.x + 24, y: at.y + 24, label, busy: true }) },
      template: t => { landed = t },
      open: (html, depth) => {
        const tag = /^<\s*([a-zA-Z][\w:-]*)/.exec(html)?.[1] ?? 'div'
        // the opening tag closed by hand makes a valid, empty container
        let markup = clean.fragment(`${html}</${tag}>`)
        if (depth === 0) markup = clean.place(markup, { x: at.x, y: at.y, w: at.w, name: `${label} — ${prompt.slice(0, 24)}` })
        const parent = parents[depth] ?? board
        say(verbFor(html))
        const ids = s().insertHtml(parent, markup)
        if (count++) s().dropSnapshot()
        opts.onProgress?.(count)
        const id = ids.find(i => s().doc.nodes[i]?.parent === parent) ?? ids[0] ?? null
        if (!id) return
        parents[depth + 1] = id
        parents.length = depth + 2
        if (depth === 0) root = id
        s().setSkeleton(id)
        rise(id)
        follow(id)
      },
      node: (html, depth) => {
        const parent = parents[depth] ?? root
        if (!parent) return
        say(verbFor(html))
        const ids = s().insertHtml(parent, clean.fragment(html))
        if (count++) s().dropSnapshot()
        opts.onProgress?.(count)
        s().setSkeleton(parent)
        if (ids[0]) { s().touch(ids); rise(ids[0]); follow(ids[0]) }
      },
      close: depth => { s().setSkeleton(parents[depth] ?? null) },
    }, opts.signal)
  } catch (e) {
    // a stop keeps what landed; the piece in flight is simply not finished
    if (!(e instanceof DOMException && e.name === 'AbortError') && !opts.signal?.aborted) throw e
    s().setSkeleton(null)
    s().unveil('all')
    if (root) { await settle(); fit(board); s().select([root]) }
    label = `${model} · stopped`
    const b = root ? s().boxes[root] : undefined
    if (b) s().setCursor({ x: b.x + b.w - 8, y: b.y + b.h - 8, label, busy: false })
    setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
    return `Stopped. ${count} piece${count === 1 ? '' : 's'} kept. ⌘Z undoes it.`
  } finally {
    s().setSkeleton(null)
    const b = root ? s().boxes[root] : undefined
    if (b && !opts.signal?.aborted) s().setCursor({ x: b.x + b.w - 8, y: b.y + b.h - 8, label: `${model} · done`, busy: false })
    setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
  }
  if (landed) return adapt(prompt, provider, board, at, landed, fit, opts, context)
  if (!root) throw new Error(`${label} returned markup with no elements in it.`)
  await settle()
  fit(board)
  s().select([root])
  void s().refreshThumb()
  const made = s().doc.nodes[root]?.children.length ?? 0
  return `${made + 1} nodes from ${label}, as they were written. ⌘Z undoes it.`
}

/**
 * A reference page, landed whole and then made the brief's own.
 *
 * The page arrives in one insert, hundreds of nodes in its own typefaces.
 * Then the edits pass runs in adapt mode over a text only outline: every
 * string rewritten, the accent retinted, ops landing one by one under the
 * cursor. The two steps are one undo: the landing is the step, the edits
 * fold into it.
 */
async function adapt(prompt: string, provider: string | null, board: string, at: { x: number; y: number; w: number }, ref: { id: string; title: string; width: number; height: number }, fit: (board: string) => void, opts: LandOptions = {}, context: string | null = null): Promise<string> {
  const s = useEditor.getState
  const markup = await refs.html(ref.id)
  const { html, board: theme } = refs.unwrap(markup, at.w)
  const boardNode = s().doc.nodes[board]
  // a fresh board takes the page's own paint and size; a board with content
  // gets the page placed below it
  const empty = boardNode.children.length === 0
  if (empty) s().patchStyle([board], { ...theme, width: `${ref.width}px`, height: `${ref.height}px` })
  const ids = s().insertHtml(board, empty ? html : clean.place(html, { x: at.x, y: at.y, w: at.w, name: ref.title }))
  if (empty) s().dropSnapshot()
  if (!ids.length) throw new Error(`${ref.title} produced no nodes.`)
  await settle()
  fit(board)

  // the reference's own words are never shown: every text node is a block
  // until its rewrite lands, so what appears is a skeleton of a real layout
  const o = edits.textOutline(s().doc, board)
  s().veil(o.ids.filter(id => s().doc.nodes[id]?.text))
  let label = 'agent'
  const first = s().boxes[board]
  if (first) s().setCursor({ x: first.x + 24, y: first.y + 24, label, busy: true })

  // the outline is split in two and both halves stream at once, and every op
  // lands the moment it arrives, paced under the cursor, so the page starts
  // changing at the top while the model is still writing the bottom
  const lines = o.text.split('\n\nACCENTS\n')
  const body = lines[0].split('\n')
  const accents = lines[1] ? `\n\nACCENTS\n${lines[1]}` : ''
  const cut = Math.ceil(body.length / 2)
  const halves = body.length > 40 ? [body.slice(0, cut), body.slice(cut)] : [body]
  const landing = edits.progressive(label, 120, opts.onProgress)
  const runs = halves.map((part, i) => stream.edits({
    prompt, artboardId: board, outline: part.join('\n') + (i === 0 ? accents : ''), ids: o.ids,
    width: Math.round(first?.w ?? at.w), mode: 'adapt',
    ...(context ? { context } : {}),
    ...(provider ? { provider } : {}),
    ...(s().file ? { fileId: s().file!.id } : {}),
  }, {
    meta: m => { label = m.label; landing.label(label) },
    op: op => landing.push(op),
  }, opts.signal))
  const results = await Promise.allSettled(runs)
  const applied = await landing.done()
  s().unveil('all')
  await settle()
  await illustrate(prompt, board, label, opts)
  fit(board)
  void s().refreshThumb()
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length === results.length) throw new Error((failed[0] as PromiseRejectedResult).reason?.message ?? 'The adaptation failed.')
  const ok = applied.filter(a => !a.error).length
  return `${ref.title}, adapted by ${label}: ${ok} changes${failed.length ? ', one half failed' : ''}. ⌘Z undoes it.`
}

/** the neutral frames a reference page carries, largest first, with their size */
function placeholders(board: string): { id: string; w: number; h: number }[] {
  const s = useEditor.getState()
  const out: { id: string; w: number; h: number; area: number }[] = []
  const walk = (id: string) => {
    const n = s.doc.nodes[id]
    if (!n) return
    const bg = n.style.background ?? ''
    if (bg.includes('rgba(0,0,0,0.05)') && bg.includes('rgba(0,0,0,0.10)') && n.children.length === 0) {
      const b = s.boxes[id]
      if (b && b.w >= 24 && b.h >= 24) out.push({ id, w: b.w, h: b.h, area: b.w * b.h })
    }
    for (const c of n.children) walk(c)
  }
  walk(board)
  return out.sort((a, b) => b.area - a.area)
}

/**
 * Vectors for the frames the reference left empty.
 *
 * Every frame gets a vector from Arrow, largest first, up to six at once:
 * an illustration for a big frame, a mark for a small one. No raster images
 * here; a picture is something a person asks for with the image tool. A
 * frame Arrow cannot draw for keeps its soft grey.
 */
async function illustrate(prompt: string, board: string, label: string, opts: LandOptions): Promise<void> {
  const s = useEditor.getState
  const frames = placeholders(board).slice(0, 6)
  if (!frames.length || opts.signal?.aborted) return
  s().setLoading(l => [...l, ...frames.map(f => f.id)])
  const done = (id: string) => s().setLoading(l => l.filter(x => x !== id))
  const ratioOf = (w: number, h: number) => w / h > 1.4 ? '16:9' : w / h > 1.15 ? '3:2' : w / h < 0.7 ? '2:3' : w / h < 0.87 ? '3:4' : '1:1'

  // the drawing should look like it was made for this page, so its accent
  // colours ride along; Arrow has no palette field, only the words
  const hint = edits.paletteHint(s().doc, board)
  const jobs = frames.map(async (f, i) => {
    const b = s().boxes[f.id]
    if (!b) return done(f.id)
    const big = Math.min(b.w, b.h) >= 160
    if (i === 0) s().setCursor({ x: b.x + 24, y: b.y + 18, label: `${label} · drawing`, busy: true })
    try {
      const out = await gen.svg({
        prompt: big
          ? `${i === 0 ? 'Hero illustration' : 'Editorial illustration'} for: ${prompt}. Flat vector, two or three colours, clean shapes, no text, no letters, no logos, transparent background with no backdrop rectangle. Composed for a ${Math.round(b.w)} by ${Math.round(b.h)} frame.${hint ? ` ${hint}` : ''}`
          : `${i === 0 ? 'A simple brand mark' : 'A simple line icon'} for: ${prompt}. Strokes only in currentColor, 1.5px, rounded, no fills, no background rectangle, no text, no letters.`,
        ratio: ratioOf(b.w, b.h),
      })
      const first = out.made[0]
      if (!first?.svg || opts.signal?.aborted) return
      const svg = prepSvg(clean.svg(first.svg))
      // a filled slab standing in for a drawing is worse than the grey frame
      if (!svg || blob(svg)) return
      // the vector flows inside its frame at full size, so it can only ever be
      // where the frame is; an absolute box would resolve against an ancestor
      const made = s().insertHtml(f.id, svg)
      s().dropSnapshot()
      const id = made[0]
      if (id) {
        s().rename(id, big ? 'Illustration' : 'Mark'); s().dropSnapshot()
        s().patchStyle([f.id], { background: 'transparent' }); s().dropSnapshot()
        s().touch([id]); rise(id)
      }
    } catch { /* the frame keeps its grey */ }
    finally { done(f.id) }
  })
  await Promise.allSettled(jobs)
  const rest = s().boxes[frames[0].id]
  if (rest) s().setCursor({ x: rest.x + rest.w - 8, y: rest.y + rest.h - 8, label: `${label} · done`, busy: false })
  else s().setCursor(null)
  setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
}

/** a vector that is one filled shape covering its whole box: a slab, not a drawing */
function blob(svg: string): boolean {
  const shapes = (svg.match(/<(path|rect|circle|ellipse|polygon|line|polyline)\b/g) ?? []).length
  if (shapes === 0) return true
  const box = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number)
  const full = /<rect\b[^>]*width="(\d+(?:\.\d+)?)(?:px)?"[^>]*height="(\d+(?:\.\d+)?)(?:px)?"/.exec(svg)
  if (shapes === 1 && full && box && Number(full[1]) >= box[2] * 0.9 && Number(full[2]) >= box[3] * 0.9) return true
  return shapes === 1 && /fill="(?!none)[^"]+"/.test(svg) && !/stroke=/.test(svg)
}

/**
 * Markup from a vector engine, made to sit in a frame.
 *
 * The root keeps its viewBox and gets a style that fills the frame; fixed
 * width and height attributes go, comments go, and a rectangle painted over
 * the whole canvas goes too, since that is a background the page already has
 * and it is what shows up as a black slab.
 */
function prepSvg(svg: string): string | null {
  let out = svg.replace(/<!--[\s\S]*?-->/g, '').trim()
  const open = /<svg\b[^>]*>/.exec(out)
  if (!open) return null
  const box = /viewBox="([\d.\s-]+)"/.exec(open[0])?.[1]?.split(/\s+/).map(Number)
  const vw = box?.[2] ?? Number(/width="(\d+(?:\.\d+)?)/.exec(open[0])?.[1] ?? 0)
  const vh = box?.[3] ?? Number(/height="(\d+(?:\.\d+)?)/.exec(open[0])?.[1] ?? 0)
  if (vw && vh) {
    out = out.replace(/<rect\b[^>]*\/?>(?:\s*<\/rect>)?/g, m => {
      const w = Number(/\bwidth="(\d+(?:\.\d+)?)(?:%|px)?"/.exec(m)?.[1] ?? 0)
      const h = Number(/\bheight="(\d+(?:\.\d+)?)(?:%|px)?"/.exec(m)?.[1] ?? 0)
      const pct = /width="100%"/.test(m) && /height="100%"/.test(m)
      return pct || (w >= vw * 0.85 && h >= vh * 0.85) ? '' : m
    })
  }
  let root = open[0]
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/, '')
  if (!/viewBox=/.test(root) && vw && vh) root = root.replace('<svg', `<svg viewBox="0 0 ${vw} ${vh}"`)
  root = root.replace('<svg', '<svg style="display:block;width:100%;height:100%" preserveAspectRatio="xMidYMid meet"')
  out = out.replace(open[0], root)
  return /<(path|circle|ellipse|polygon|polyline|line|rect|g|text)\b/.test(out) ? out : null
}
