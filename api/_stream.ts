/**
 * A generation, as it lands.
 *
 * The model writes one fragment; the person should see it being built. This
 * reads the token stream and emits an event when the root element opens and
 * one for every direct child that closes, so the client can insert the
 * headline while the paragraph is still being written. Nothing is guessed
 * about structure: the tokenizer is a small quote aware tag scanner that
 * tracks depth, the same thing a browser would do, minus everything else.
 */

import { designSystem, designUser } from './_prompt.js'
import type { DesignBrief } from './_prompt.js'
import { chatStream, chats, ProviderError } from './_providers.js'
import type { Chat } from './_providers.js'
import { editsSystem, editsUser, parseOps } from './_edits.js'
import type { EditsBrief, Op } from './_edits.js'

export type StreamEvent =
  | { type: 'meta'; provider: string; label: string; model: string }
  | { type: 'open'; html: string }
  | { type: 'node'; html: string }
  | { type: 'close' }
  | { type: 'op'; op: Op }
  | { type: 'done'; html?: string; ops?: Op[]; dropped?: string[]; summary?: string }
  | { type: 'error'; message: string }

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use'])

/**
 * Feed text in, get element events out.
 *
 * Depth 0 is the artboard. A tag opening at depth 0 is a root: its opening
 * tag goes out at once so the client has a parent to fill. Elements that
 * close at depth 1 are the root's children and go out whole. Text directly
 * inside the root goes out as a node too, wrapped, so nothing is dropped.
 */
export class Tokenizer {
  private buf = ''
  private depth = 0
  private pos = 0        // where scanning resumes
  private start = 0      // where the depth-1 child being collected begins
  private textFrom = 0   // where loose root text not yet sent begins
  private out: StreamEvent[] = []
  private fenced = false

  push(text: string): StreamEvent[] {
    this.buf += text
    if (!this.fenced) {
      // a model that opens with a fence gets it stripped once, but only when
      // the whole fence line is in, so "```h" is not mistaken for "```html"
      const m = /^\s*```[a-z]*\r?\n/i.exec(this.buf)
      if (m) { this.buf = this.buf.slice(m[0].length); this.fenced = true }
      else if (/^\s*`/.test(this.buf) && this.buf.length < 20) return []
      else this.fenced = true
    }
    this.scan()
    const ev = this.out; this.out = []
    return ev
  }

  end(): StreamEvent[] {
    this.scan(true)
    if (this.depth > 0) this.out.push({ type: 'close' })
    const ev = this.out; this.out = []
    return ev
  }

  private scan(final = false): void {
    for (;;) {
      const lt = this.buf.indexOf('<', this.pos)
      if (lt < 0) {
        if (final && this.depth === 1) this.flushText(this.buf.length)
        return
      }
      if (this.buf.startsWith('<!--', lt)) {
        const e = this.buf.indexOf('-->', lt)
        if (e < 0) return
        this.buf = this.buf.slice(0, lt) + this.buf.slice(e + 3)
        continue
      }
      const gt = this.closeOf(lt)
      if (gt < 0) return
      const tag = this.buf.slice(lt, gt + 1)
      const closing = tag.startsWith('</')
      const name = (/^<\/?\s*([a-zA-Z][\w:-]*)/.exec(tag)?.[1] ?? '').toLowerCase()
      const selfClosed = tag.endsWith('/>') || VOID.has(name)

      if (!closing) {
        if (this.depth === 0) {
          // a root: its opening tag goes out alone so the client has a parent
          this.out.push({ type: 'open', html: tag })
          this.drop(gt + 1)
          if (selfClosed) this.out.push({ type: 'close' })
          else this.depth = 1
          continue
        }
        if (this.depth === 1) {
          this.flushText(lt)
          this.start = lt
          if (selfClosed) { this.emit(this.start, gt + 1); continue }
        }
        if (!selfClosed) this.depth++
        this.pos = gt + 1
        continue
      }

      this.depth--
      if (this.depth === 1) { this.emit(this.start, gt + 1); continue }
      if (this.depth <= 0) {
        this.depth = 0
        this.out.push({ type: 'close' })
        this.drop(gt + 1)
        continue
      }
      this.pos = gt + 1
    }
  }

  /**
   * Text sitting directly in the root, before `upTo`, as a node of its own.
   * Nothing is dropped here: the child that follows is sliced from `start`,
   * and its emit discards the text along with it.
   */
  private flushText(upTo: number): void {
    const t = this.buf.slice(this.textFrom, upTo).trim()
    if (t) this.out.push({ type: 'node', html: `<span>${t}</span>` })
    this.textFrom = upTo
  }

  private emit(from: number, to: number): void {
    this.out.push({ type: 'node', html: this.buf.slice(from, to) })
    this.drop(to)
  }

  /** forget everything before `n`; the depth-1 child, if any, starts fresh */
  private drop(n: number): void {
    this.buf = this.buf.slice(n)
    this.pos = 0
    this.start = 0
    this.textFrom = 0
  }

  private closeOf(lt: number): number {
    let q: string | null = null
    for (let i = lt + 1; i < this.buf.length; i++) {
      const c = this.buf[i]
      if (q) { if (c === q) q = null; continue }
      if (c === '"' || c === "'") { q = c; continue }
      if (c === '>') return i
    }
    return -1
  }
}

const enc = new TextEncoder()
export const sse = (e: StreamEvent) => enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)

function pick(want?: string): Chat {
  const usable = chats().filter(c => c.key)
  if (!usable.length) throw new ProviderError('No design model is configured.', 400)
  return usable.find(c => c.id === want) ?? usable[0]
}

/** the design route, streamed: open, node..., close, done */
export function designStream(brief: DesignBrief, want: string | undefined, after: (html: string, chat: Chat) => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(ctl) {
      try {
        const chat = pick(want)
        ctl.enqueue(sse({ type: 'meta', provider: chat.id, label: chat.label, model: chat.model }))
        const tk = new Tokenizer()
        let full = ''
        for await (const t of chatStream(chat, designSystem(brief), designUser(brief))) {
          full += t
          for (const e of tk.push(t)) ctl.enqueue(sse(e))
        }
        for (const e of tk.end()) ctl.enqueue(sse(e))
        if (!/<[a-z]/i.test(full)) throw new ProviderError(`${chat.label} answered with prose rather than HTML.`, 502, chat.id)
        ctl.enqueue(sse({ type: 'done', html: full }))
        after(full, chat)
      } catch (e) {
        ctl.enqueue(sse({ type: 'error', message: e instanceof Error ? e.message : String(e) }))
      } finally {
        ctl.close()
      }
    },
  })
}

/**
 * The edits route, streamed: each op goes out as its JSON object closes.
 * The final parse is the one that counts; ops sent early are the same ones
 * it will validate, and a dropped one is reported in the done event.
 */
export function editsStream(brief: EditsBrief, known: Set<string>, want: string | undefined, after: (ops: Op[], summary: string | undefined, chat: Chat) => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(ctl) {
      try {
        const chat = pick(want)
        ctl.enqueue(sse({ type: 'meta', provider: chat.id, label: chat.label, model: chat.model }))
        let full = ''
        let sent = 0
        for await (const t of chatStream(chat, editsSystem(brief), editsUser(brief), 12000, { response_format: { type: 'json_object' } })) {
          full += t
          // every complete object inside the ops array that has not gone out yet
          const objs = topLevelObjects(full)
          for (let i = sent; i < objs.length; i++) {
            const { ops } = parseOps(`{"ops":[${objs[i]}]}`, known)
            for (const op of ops) ctl.enqueue(sse({ type: 'op', op }))
            sent = i + 1
          }
        }
        const { ops, summary, dropped } = parseOps(full, known)
        ctl.enqueue(sse({ type: 'done', ops, dropped, summary }))
        after(ops, summary, chat)
      } catch (e) {
        ctl.enqueue(sse({ type: 'error', message: e instanceof Error ? e.message : String(e) }))
      } finally {
        ctl.close()
      }
    },
  })
}

/** the complete objects inside the "ops" array so far, as raw json strings */
export function topLevelObjects(text: string): string[] {
  const at = text.indexOf('"ops"')
  if (at < 0) return []
  const arr = text.indexOf('[', at)
  if (arr < 0) return []
  const out: string[] = []
  let depth = 0, q = false, esc = false, from = -1
  for (let i = arr + 1; i < text.length; i++) {
    const c = text[i]
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue }
    if (c === '"') { q = true; continue }
    if (c === '{') { if (depth === 0) from = i; depth++ }
    else if (c === '}') { depth--; if (depth === 0 && from >= 0) { out.push(text.slice(from, i + 1)); from = -1 } }
    else if (c === ']' && depth === 0) break
  }
  return out
}
