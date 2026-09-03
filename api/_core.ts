/**
 * One request handler, two hosts.
 *
 * The functions in `api/` are Vercel serverless functions, and the Vite dev
 * server mounts this same `handle` as middleware — so `pnpm dev` exercises the
 * exact code that ships and nobody has to run a second process. Keeping the
 * logic here rather than in the route files is what makes that possible: the
 * route files are adapters and nothing else.
 */

import {
  ProviderError, catalogue, generateDesign, generateImage, generateSvg, variety,
} from './_providers.js'
import type { DesignResult, ImageResult, SvgResult } from './_providers.js'
import { userFrom } from './_auth.js'
import * as files from './_files.js'
import { generateEdits } from './_edits.js'
import { record } from './_generations.js'
import type { User } from './_auth.js'
import type { EditsBrief } from './_edits.js'

export type Kind = 'design' | 'image' | 'svg' | 'providers'

export interface Reply {
  status: number
  body: unknown
}

interface Body {
  prompt?: string
  provider?: string
  ratio?: string
  seed?: number
  width?: number
  height?: number
  tokens?: Record<string, string>
  exemplar?: { title: string; html: string }
}

const bad = (message: string, status = 400): Reply => ({ status, body: { error: message } })

/** the edits endpoint: prompt plus outline in, validated ops out */
async function edits(user: User, raw: unknown): Promise<Reply> {
  const input = (raw ?? {}) as Partial<EditsBrief> & { ids?: string[]; provider?: string; fileId?: string; exemplarId?: string }
  const prompt = input.prompt?.trim()
  if (!prompt) return bad('Say what to change.')
  if (prompt.length > 4000) return bad('That prompt is too long.', 413)
  if (!input.artboardId || !input.outline || !Array.isArray(input.ids)) return bad('Send artboardId, outline and ids.')
  const brief: EditsBrief = {
    prompt,
    width: clamp(input.width ?? 1280, 240, 4000),
    outline: String(input.outline).slice(0, 40000),
    artboardId: String(input.artboardId),
    tokens: input.tokens,
    ...(input.exemplar?.html && typeof input.exemplar.title === 'string'
      ? { exemplar: { title: input.exemplar.title.slice(0, 80), html: String(input.exemplar.html).slice(0, 30000) } }
      : {}),
  }
  try {
    const t0 = Date.now()
    const out = await generateEdits(brief, new Set(input.ids.map(String)), input.provider)
    void record({
      owner: user.id, fileId: input.fileId ?? null, kind: 'edits', prompt, provider: out.provider, model: out.model,
      exemplar: input.exemplarId ?? null, request: { width: brief.width, outline: brief.outline.slice(0, 8000) },
      response: { summary: out.summary, ops: out.ops, dropped: out.dropped }, ms: Date.now() - t0,
    })
    return { status: 200, body: out }
  } catch (e) {
    if (e instanceof ProviderError) return { status: e.status >= 400 && e.status < 600 ? e.status : 502, body: { error: e.message } }
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}

export async function handle(kind: Kind, raw: unknown, user?: User): Promise<Reply> {
  if (kind === 'providers') return { status: 200, body: catalogue() }

  const input = (raw ?? {}) as Body
  const prompt = input.prompt?.trim()
  if (!prompt) return bad('Say what to generate.')
  if (prompt.length > 4000) return bad('That prompt is too long.', 413)

  try {
    if (kind === 'design') {
      const t0 = Date.now()
      const body = await design(prompt, input)
      if (user) {
        const one = (body as { variety?: unknown[] }).variety ? null : body as { provider?: string; model?: string; html?: string }
        void record({
          owner: user.id, fileId: (input as { fileId?: string }).fileId ?? null, kind: 'design', prompt,
          provider: one?.provider, model: one?.model, exemplar: (input as { exemplarId?: string }).exemplarId ?? null,
          request: { width: input.width, provider: input.provider }, response: body, ms: Date.now() - t0,
        })
      }
      return { status: 200, body }
    }
    if (kind === 'image') return { status: 200, body: await image(prompt, input) }
    if (kind === 'svg') return { status: 200, body: await svg(prompt, input) }
    return bad(`No such endpoint "${kind}".`, 404)
  } catch (e) {
    if (e instanceof ProviderError) {
      // a provider's own status travels with the message: a 429 stays a 429 so
      // the client can tell "try again" from "fix your key"
      return { status: e.status >= 400 && e.status < 600 ? e.status : 502, body: { error: e.message } }
    }
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
}

async function design(prompt: string, input: Body) {
  const brief = {
    prompt,
    width: clamp(input.width ?? 1280, 240, 4000),
    ...(input.height ? { height: clamp(input.height, 120, 8000) } : {}),
    tokens: input.tokens,
    // capped so a stray full template cannot blow the context
    ...(input.exemplar?.html && typeof input.exemplar.title === 'string'
      ? { exemplar: { title: input.exemplar.title.slice(0, 80), html: String(input.exemplar.html).slice(0, 30000) } }
      : {}),
  }

  if (input.provider === 'variety') {
    const ids = catalogue().design.map(p => p.id)
    if (!ids.length) return await generateDesign(brief) // let it raise the real reason
    const out = await variety<DesignResult>(ids, id => generateDesign(brief, id))
    if (!out.ok.length) throw new ProviderError(summarise(out.failed), 502)
    return { variety: out.ok, failed: out.failed }
  }
  return await generateDesign(brief, input.provider)
}

async function image(prompt: string, input: Body) {
  if (input.provider === 'variety') {
    const ids = catalogue().image.map(p => p.id)
    const out = await variety<ImageResult>(ids, id =>
      generateImage({ prompt, ratio: input.ratio, seed: input.seed, provider: id }))
    if (!out.ok.length) throw new ProviderError(summarise(out.failed), 502)
    return { variety: out.ok, failed: out.failed }
  }
  return await generateImage({ prompt, ratio: input.ratio, seed: input.seed, provider: input.provider })
}

async function svg(prompt: string, input: Body) {
  if (input.provider === 'variety') {
    const ids = catalogue().svg.map(p => p.id)
    const out = await variety<SvgResult>(ids, id =>
      generateSvg({ prompt, ratio: input.ratio, provider: id }))
    if (!out.ok.length) throw new ProviderError(summarise(out.failed), 502)
    return { variety: out.ok, failed: out.failed }
  }
  return await generateSvg({ prompt, ratio: input.ratio, provider: input.provider })
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.round(Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo)))

const summarise = (failed: { provider: string; error: string }[]) =>
  `Every provider failed. ${failed.map(f => `${f.provider}: ${f.error}`).join(' | ')}`

/** a request as both hosts see it: the method, the path, who, and the body */
export interface Req {
  method: string
  path: string
  authorization: string | null
  body: unknown
  /** set only by the vite dev middleware: requests run as a local user so
   *  nobody has to sign in to work on the editor, unless VITE_DEV_AUTH=1 */
  dev?: boolean
}

export const KINDS: Kind[] = ['design', 'image', 'svg', 'providers']

/**
 * Every endpoint, from one place.
 *
 * The provider list is public, since it says only what this deployment can
 * do. Everything else spends a key or touches a user's files, so it needs a
 * session: a bearer token from Clerk, checked here, and nowhere else.
 */
export async function route(req: Req): Promise<Reply> {
  const path = req.path.replace(/\/+$/, '')
  const kind = KINDS.find(k => path === `/api/${k}`)

  if (kind === 'providers') return handle(kind, null)

  const user = req.dev && process.env.VITE_DEV_AUTH !== '1'
    ? { id: 'local-dev' }
    : await userFrom(req.authorization)
  if (!user) return bad('Sign in first.', 401)

  if (kind) {
    if (req.method !== 'POST') return bad('POST a JSON body.', 405)
    return handle(kind, req.body, user)
  }

  if (path === '/api/edits') {
    if (req.method !== 'POST') return bad('POST a JSON body.', 405)
    return edits(user, req.body)
  }

  if (path === '/api/files') {
    if (req.method === 'GET') return files.list(user)
    if (req.method === 'POST') return files.create(user, req.body)
    return bad('GET or POST.', 405)
  }
  const id = /^\/api\/files\/([\w-]+)$/.exec(path)?.[1]
  if (id) {
    if (req.method === 'GET') return files.load(user, id)
    if (req.method === 'PUT') return files.save(user, id, req.body)
    if (req.method === 'DELETE') return files.remove(user, id)
    return bad('GET, PUT or DELETE.', 405)
  }
  return bad(`No such endpoint "${path}".`, 404)
}

/**
 * The web-standard adapter the route files use.
 *
 * Vercel's node runtime accepts a `Request`-in, `Response`-out handler, and so
 * does anything else built on fetch, which keeps the deployment target open.
 */
export async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  let body: unknown = null
  if (req.method === 'POST' || req.method === 'PUT') {
    try { body = await req.json() } catch { return json({ error: 'The body was not JSON.' }, 400) }
  }
  let reply: Reply
  try {
    reply = await route({
      method: req.method,
      path: new URL(req.url).pathname,
      authorization: req.headers.get('authorization'),
      body,
    })
  } catch (e) {
    reply = { status: 500, body: { error: e instanceof Error ? e.message : String(e) } }
  }
  return json(reply.body, reply.status)
}

const cors: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'POST, GET, PUT, DELETE, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  })
