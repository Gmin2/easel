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
  /** land this reference page instead of writing one; the client adapts it next */
  | { type: 'template'; id: string; title: string; width: number; height: number; mobile?: boolean }
  | { type: 'open'; html: string; depth: number }
  | { type: 'node'; html: string; depth: number }
  | { type: 'close'; depth: number }
  | { type: 'op'; op: Op }
  | { type: 'done'; html?: string; ops?: Op[]; dropped?: string[]; summary?: string }
  | { type: 'error'; message: string }

// html void elements only. svg shapes are not void: a model writes both
// <path d=".."/> and <path d=".."></path>, and only the slash form is closed
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** containers this deep open live; anything below lands as a whole element */
const LIVE = 2

/** only real containers open live; a heading or a button lands whole even at the top */
const CONTAINERS = new Set(['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside', 'ul', 'ol', 'form', 'figure'])

/**
 * Feed text in, get element events out.
 *
 * Depth 0 is the artboard. Containers at depth 0 and 1 are "live": their
 * opening tag goes out on its own so the client has a parent to fill, and
 * a close follows when they end. Elements at depth 2 go out whole as they
 * close, which is the grain a person can watch: a card, a heading, a button.
 * Loose text directly inside a live container goes out wrapped so nothing
 * is dropped. The events carry their depth, so the client keeps a stack of
 * parents and never has to guess.
 */
export class Tokenizer {
  private buf = ''
  private depth = 0
  /** open element names, so a stray close is ignored the way a browser ignores it */
  private stack: string[] = []
  private pos = 0        // where scanning resumes
  private start = 0      // where the element being collected begins
  private collectAt: number | null = null   // the depth the collected element sits at
  private textFrom = 0   // where loose text not yet sent begins
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
    if (this.collectAt !== null && this.buf.slice(this.start).trim()) { this.emit(this.start, this.buf.length, this.collectAt); this.collectAt = null }
    while (this.depth > 0) { this.depth--; this.stack.pop(); if (this.depth < LIVE) this.out.push({ type: 'close', depth: this.depth }) }
    const ev = this.out; this.out = []
    return ev
  }

  private scan(final = false): void {
    for (;;) {
      const lt = this.buf.indexOf('<', this.pos)
      if (lt < 0) {
        if (final && this.depth > 0 && this.inLive) this.flushText(this.buf.length)
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
        if (this.collectAt === null) {
          // not inside a collected element: this tag starts a live container
          // or begins collecting a whole element
          this.flushText(lt)
          if (this.depth < LIVE && CONTAINERS.has(name) && !selfClosed) {
            this.out.push({ type: 'open', html: tag, depth: this.depth })
            this.drop(gt + 1)
            this.stack.push(name); this.depth++
            continue
          }
          if (selfClosed) { this.out.push({ type: 'node', html: tag, depth: this.depth }); this.drop(gt + 1); continue }
          this.start = lt
          this.collectAt = this.depth
        }
        if (!selfClosed) { this.stack.push(name); this.depth++ }
        this.pos = gt + 1
        continue
      }

      // a closing tag: pops to the nearest open element of that name. one
      // that matches nothing open is ignored, as a browser would
      const at = this.stack.lastIndexOf(name)
      if (at < 0) {
        if (this.collectAt === null) { this.flushText(lt); this.drop(gt + 1) } else this.pos = gt + 1
        continue
      }
      this.stack.length = at
      this.depth = at
      if (this.collectAt !== null) {
        if (this.depth <= this.collectAt) { this.emit(this.start, gt + 1, this.collectAt); this.collectAt = null }
        else this.pos = gt + 1
        continue
      }
      // a live container closing
      this.flushText(lt)
      this.out.push({ type: 'close', depth: this.depth })
      this.drop(gt + 1)
    }
  }

  /** loose text inside a live container, before `upTo`, as a node of its own */
  private flushText(upTo: number): void {
    if (!this.inLive || this.depth === 0) { this.textFrom = upTo; return }
    const t = this.buf.slice(this.textFrom, upTo).trim()
    if (t) this.out.push({ type: 'node', html: `<span>${t}</span>`, depth: this.depth })
    this.textFrom = upTo
  }

  private emit(from: number, to: number, depth: number): void {
    this.out.push({ type: 'node', html: this.buf.slice(from, to), depth })
    this.drop(to)
  }

  /** forget everything before `n`; the next element starts fresh */
  private drop(n: number): void {
    this.buf = this.buf.slice(n)
    this.pos = 0
    this.start = 0
    this.textFrom = 0
  }

  /** loose text is only text sitting directly in a live container */
  private get inLive(): boolean { return this.collectAt === null }

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
        for await (const t of chatStream(chat, editsSystem(brief), editsUser(brief), 16000, { response_format: { type: 'json_object' } })) {
          full += t
          // every complete object inside the ops array that has not gone out yet
          const objs = topLevelObjects(full)
          for (let i = sent; i < objs.length; i++) {
            const { ops } = parseOps(`{"ops":[${objs[i]}]}`, known)
            for (const op of ops) if (!brief.strict || op.op === 'text') ctl.enqueue(sse({ type: 'op', op }))
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
