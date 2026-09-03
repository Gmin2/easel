import { neon } from '@neondatabase/serverless'

/**
 * One table, over http.
 *
 * Neon's http driver needs no connection pool, which is what a serverless
 * function wants, and the same call works from the vite dev middleware. The
 * schema is made on first use so there is no migration step to forget.
 */
let client: ReturnType<typeof neon> | null = null
let ready: Promise<void> | null = null

export function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set on this deployment.')
    client = neon(url)
  }
  return client
}

export function ensure(): Promise<void> {
  ready ??= (async () => {
    const q = sql()
    await q`create table if not exists files (
      id text primary key,
      owner text not null,
      name text not null,
      doc jsonb not null,
      thumb text,
      scratch boolean not null default false,
      created bigint not null,
      edited bigint not null
    )`
    await q`create index if not exists files_owner on files (owner, edited desc)`
    // every model call, kept: what was asked, what came back, what it cost.
    // regenerate, history and a cost view all read from here
    await q`create table if not exists generations (
      id text primary key,
      owner text not null,
      file_id text,
      kind text not null,
      prompt text not null,
      provider text,
      model text,
      exemplar text,
      request jsonb,
      response jsonb,
      ms integer,
      created bigint not null
    )`
    await q`create index if not exists generations_owner on generations (owner, created desc)`
  })().catch(e => { ready = null; throw e })
  return ready
}
