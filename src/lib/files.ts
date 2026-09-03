import { api } from './auth'
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

export const list = () => api<FileMeta[]>('/api/files')

export const load = (id: string) => api<{ meta: FileMeta; doc: Doc | Record<string, never> }>(`/api/files/${id}`)

export const create = (name: string, doc: Doc) =>
  api<FileMeta>('/api/files', { method: 'POST', json: { name, doc } })

export const save = (id: string, patch: { doc?: Doc; name?: string; thumb?: string }) =>
  api<FileMeta>(`/api/files/${id}`, { method: 'PUT', json: patch })

export const remove = (id: string) => api<{ ok: true }>(`/api/files/${id}`, { method: 'DELETE' })

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
