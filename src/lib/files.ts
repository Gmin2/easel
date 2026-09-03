import { api, guest } from './auth'
import type { Doc } from '../doc/types'

/**
 * Files, on the server.
 *
 * A file is a document plus a name and a clock. The list is metadata only,
 * and a document comes down when it is opened. The scratchpad is a file like
 * any other except that the server makes it, it cannot be removed, and it is
 * always listed first.
 */
export interface FileMeta {
  id: string
  name: string
  created: number
  edited: number
  /** a small jpeg of the first artboard, taken when the file is left */
  thumb?: string
  scratch?: boolean
}

export const list = () => guest() ? local.list() : api<FileMeta[]>('/api/files')

export const load = (id: string) => guest() ? local.load(id) : api<{ meta: FileMeta; doc: Doc | Record<string, never> }>(`/api/files/${id}`)

export const create = (name: string, doc: Doc) =>
  guest() ? local.create(name, doc) : api<FileMeta>('/api/files', { method: 'POST', json: { name, doc } })

export const save = (id: string, patch: { doc?: Doc; name?: string; thumb?: string }) =>
  guest() ? local.save(id, patch) : api<FileMeta>(`/api/files/${id}`, { method: 'PUT', json: patch })

export const remove = (id: string) => guest() ? local.remove(id) : api<{ ok: true }>(`/api/files/${id}`, { method: 'DELETE' })

/**
 * The same five calls against localStorage, for a visitor with no account.
 *
 * Shaped exactly like the server so the store cannot tell the difference: a
 * scratchpad is made on the first list, ids are opaque, and a doc comes down
 * only when a file is opened. Everything lives under one key so signing in
 * can lift it into the account in one go and clear it.
 */
const KEY = 'easel:guest'
interface Shelf { files: FileMeta[]; docs: Record<string, Doc | Record<string, never>> }

function shelf(): Shelf {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.files) return s } catch { /* fresh */ }
  return { files: [], docs: {} }
}
function put(s: Shelf): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota or private mode: the session still works */ }
}
const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const local = {
  async list(): Promise<FileMeta[]> {
    const s = shelf()
    if (!s.files.some(f => f.scratch)) {
      const now = Date.now()
      const id = newId()
      s.files.unshift({ id, name: 'Scratchpad', created: now, edited: now, scratch: true })
      s.docs[id] = {}
      put(s)
    }
    return [...s.files].sort((a, b) => Number(b.scratch ?? false) - Number(a.scratch ?? false) || b.edited - a.edited)
  },
  async load(id: string) {
    const s = shelf()
    const meta = s.files.find(f => f.id === id)
    if (!meta) throw new Error('That file is not in this browser.')
    return { meta, doc: s.docs[id] ?? {} }
  },
  async create(name: string, doc: Doc): Promise<FileMeta> {
    const s = shelf()
    const now = Date.now()
    const meta: FileMeta = { id: newId(), name, created: now, edited: now }
    s.files.push(meta); s.docs[meta.id] = doc; put(s)
    return meta
  },
  async save(id: string, patch: { doc?: Doc; name?: string; thumb?: string }): Promise<FileMeta> {
    const s = shelf()
    const meta = s.files.find(f => f.id === id)
    if (!meta) throw new Error('That file is not in this browser.')
    if (patch.doc) s.docs[id] = patch.doc
    if (patch.name) meta.name = patch.name
    if (patch.thumb) meta.thumb = patch.thumb
    meta.edited = Date.now()
    put(s)
    return meta
  },
  async remove(id: string): Promise<{ ok: true }> {
    const s = shelf()
    s.files = s.files.filter(f => f.id !== id); delete s.docs[id]; put(s)
    return { ok: true }
  },
}

/** what a guest made, lifted into the account they just signed in to, then cleared */
export async function adopt(): Promise<number> {
  const s = shelf()
  const keep = s.files.filter(f => !f.scratch && s.docs[f.id] && 'nodes' in s.docs[f.id])
  let n = 0
  for (const f of keep) {
    try { await api<FileMeta>('/api/files', { method: 'POST', json: { name: f.name, doc: s.docs[f.id] } }); n++ } catch { /* leave it in the shelf for next time */ }
  }
  if (n === keep.length) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
  return n
}

/** "Edited 14 hours ago", the way a file list says it */
export function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)} minute${Math.floor(m) === 1 ? '' : 's'} ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)} hour${Math.floor(h) === 1 ? '' : 's'} ago`
  const d = h / 24
  if (d < 30) return `${Math.floor(d)} day${Math.floor(d) === 1 ? '' : 's'} ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
