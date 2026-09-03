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

export async function request(input: {
  prompt: string; artboardId: string; outline: string; ids: string[]; width: number
  tokens?: Record<string, string>; exemplar?: { title: string; html: string }; exemplarId?: string; provider?: string; fileId?: string
}): Promise<EditsOut> {
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
  const s = useEditor.getState
  const out: Applied[] = []
  let first = true
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
