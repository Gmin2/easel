import { ensure, sql } from './_db'
import type { User } from './_auth'

/**
 * Files, per user.
 *
 * A file is a document plus a name and two clocks. The list carries the
 * metadata only, since a document with pictures in it can run to megabytes,
 * and the scratchpad is made the first time a user asks for their list so
 * there is always somewhere to draw.
 */
export interface FileMeta {
  id: string
  name: string
  created: number
  edited: number
  thumb?: string
  scratch?: boolean
}

export interface Reply { status: number; body: unknown }

interface Row {
  id: string; name: string; created: string | number; edited: string | number
  thumb: string | null; scratch: boolean; doc?: unknown
}

const meta = (r: Row): FileMeta => ({
  id: r.id, name: r.name, created: Number(r.created), edited: Number(r.edited),
  ...(r.thumb ? { thumb: r.thumb } : {}),
  ...(r.scratch ? { scratch: true } : {}),
})

const reply = (status: number, body: unknown): Reply => ({ status, body })
const bad = (message: string, status = 400) => reply(status, { error: message })

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** an object with nodes in it; the scratchpad starts as {} and the client seeds it */
const isDoc = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** one scratchpad per owner, keyed on the owner so two first loads cannot make two */
const scratchId = (owner: string) => `scratch-${owner.replace(/[^\w-]/g, '_').slice(0, 80)}`

export async function list(user: User): Promise<Reply> {
  await ensure()
  const q = sql()
  let rows = await q`select id, name, created, edited, thumb, scratch from files
    where owner = ${user.id} order by scratch desc, edited desc` as Row[]
  if (!rows.some(r => r.scratch)) {
    const now = Date.now()
    // the id is deterministic and the insert is a no-op on conflict, so the
    // second of two parallel first loads finds the row the first one made
    await q`insert into files (id, owner, name, doc, scratch, created, edited)
      values (${scratchId(user.id)}, ${user.id}, 'Scratchpad', '{}'::jsonb, true, ${now}, ${now})
      on conflict (id) do nothing`
    rows = await q`select id, name, created, edited, thumb, scratch from files
      where owner = ${user.id} order by scratch desc, edited desc` as Row[]
  }
  return reply(200, rows.map(meta))
}

export async function create(user: User, body: unknown): Promise<Reply> {
  const input = (body ?? {}) as { name?: unknown; doc?: unknown }
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : 'Untitled'
  if (!isDoc(input.doc)) return bad('A file needs a doc.')
  await ensure()
  const now = Date.now()
  const id = newId()
  await sql()`insert into files (id, owner, name, doc, created, edited)
    values (${id}, ${user.id}, ${name}, ${JSON.stringify(input.doc)}::jsonb, ${now}, ${now})`
  return reply(201, { id, name, created: now, edited: now } satisfies FileMeta)
}

export async function load(user: User, id: string): Promise<Reply> {
  await ensure()
  const rows = await sql()`select id, name, created, edited, thumb, scratch, doc from files
    where id = ${id} and owner = ${user.id}` as Row[]
  const r = rows[0]
  if (!r) return bad('No such file.', 404)
  return reply(200, { meta: meta(r), doc: r.doc })
}

export async function save(user: User, id: string, body: unknown): Promise<Reply> {
  const input = (body ?? {}) as { name?: unknown; doc?: unknown; thumb?: unknown }
  await ensure()
  const q = sql()
  const have = await q`select id from files where id = ${id} and owner = ${user.id}` as Row[]
  if (!have.length) return bad('No such file.', 404)

  const now = Date.now()
  if (isDoc(input.doc)) {
    await q`update files set doc = ${JSON.stringify(input.doc)}::jsonb, edited = ${now} where id = ${id}`
  }
  if (typeof input.name === 'string' && input.name.trim()) {
    await q`update files set name = ${input.name.trim().slice(0, 120)} where id = ${id}`
  }
  if (typeof input.thumb === 'string' && input.thumb.startsWith('data:image/') && input.thumb.length < 400_000) {
    await q`update files set thumb = ${input.thumb} where id = ${id}`
  }
  const rows = await q`select id, name, created, edited, thumb, scratch from files where id = ${id}` as Row[]
  return reply(200, meta(rows[0]))
}

export async function remove(user: User, id: string): Promise<Reply> {
  await ensure()
  const rows = await sql()`delete from files where id = ${id} and owner = ${user.id} and scratch = false
    returning id` as Row[]
  if (!rows.length) return bad('No such file, or it is the scratchpad.', 404)
  return reply(200, { ok: true })
}
