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
import { designStream, editsStream } from './_stream.js'
import { choose, excerpt } from './_refs.js'
import { sse } from './_stream.js'
import type { User } from './_auth.js'
import type { EditsBrief } from './_edits.js'

export type Kind = 'design' | 'image' | 'svg' | 'providers'

export interface Reply {
  status: number
  body: unknown
  /** an event stream instead of a body, for generations that land as they are written */
  stream?: ReadableStream<Uint8Array>
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
  /** a phone screen: no template ever lands, the phone layout is hardcoded */
  mobile?: boolean
}

const bad = (message: string, status = 400): Reply => ({ status, body: { error: message } })

/** the edits endpoint: prompt plus outline in, validated ops out */
async function edits(user: User | null, raw: unknown): Promise<Reply> {
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
    ...((input as { mode?: string }).mode === 'adapt' ? { mode: 'adapt' as const } : {}),
    ...((input as { strict?: boolean }).strict ? { strict: true } : {}),
    ...((input as { context?: string }).context ? { context: String((input as { context?: string }).context).slice(0, 1200) } : {}),
    ...(input.exemplar?.html && typeof input.exemplar.title === 'string'
      ? { exemplar: { title: input.exemplar.title.slice(0, 80), html: String(input.exemplar.html).slice(0, 30000) } }
      : {}),
  }
  if ((input as { stream?: boolean }).stream) {
    const t0 = Date.now()
    const known = new Set(input.ids.map(String))
    const stream = editsStream(brief, known, input.provider, (ops, summary, chat) => {
      void record({
        owner: user?.id ?? 'guest', fileId: input.fileId ?? null, kind: 'edits', prompt, provider: chat.id, model: chat.model,
        exemplar: input.exemplarId ?? null, request: { width: brief.width, outline: brief.outline.slice(0, 8000), stream: true },
        response: { summary, ops }, ms: Date.now() - t0,
      })
    })
    return { status: 200, body: null, stream }
  }
  try {
    const t0 = Date.now()
    const out = await generateEdits(brief, new Set(input.ids.map(String)), input.provider)
    void record({
      owner: user?.id ?? 'guest', fileId: input.fileId ?? null, kind: 'edits', prompt, provider: out.provider, model: out.model,
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
    if (kind === 'design' && (input as { stream?: boolean }).stream && input.provider !== 'variety') {
      const t0 = Date.now()
      // a whole page with a strong reference is not written, it is landed and
      // then adapted: the client fetches the page and runs the edits pass
      const plan = await choose(prompt, user?.id ?? 'guest')
      // mobile from the words on the client, or from the model reading
      // an app into the request: either way the phone ui gets built
      const mobile = !!input.mobile || !!plan.mobile
      if (plan.mode === 'template' && plan.ref && (!mobile || plan.ref.mobile) && !(input as { fresh?: boolean }).fresh) {
        const r = plan.ref
        void record({ owner: user?.id ?? 'guest', fileId: (input as { fileId?: string }).fileId ?? null, kind: 'design', prompt, provider: 'reference', model: r.id, exemplar: r.id, request: { width: input.width, mode: 'template' }, response: { template: r.id }, ms: 0 })
        const stream = new ReadableStream<Uint8Array>({
          start(ctl) {
            ctl.enqueue(sse({ type: 'template', id: r.id, title: r.title, width: r.width, height: r.height, ...(r.mobile ? { mobile: true } : {}) }))
            ctl.enqueue(sse({ type: 'done' }))
            ctl.close()
          },
        })
        return { status: 200, body: null, stream }
      }
      // the closest reference rides along unless the client sent its own
      const styleOnly = (mobile && !plan.ref?.mobile) || plan.fits === false
      const ref = input.exemplar ? null : (plan.ref ? { id: plan.ref.id, title: plan.ref.title, html: excerpt(plan.ref.id, styleOnly ? 12000 : undefined) } : null)
      const exemplar = input.exemplar ?? (ref?.html ? { title: ref.title, html: ref.html, ...(styleOnly ? { styleOnly: true } : {}) } : undefined)
      const brief = {
        prompt,
        width: clamp(input.width ?? 1280, 240, 4000),
        ...(input.height ? { height: clamp(input.height, 120, 8000) } : {}),
        tokens: input.tokens,
        ...(mobile ? { mobile: true } : {}),
        ...(exemplar ? { exemplar } : {}),
        ...((input as { context?: string }).context ? { context: String((input as { context?: string }).context).slice(0, 1200) } : {}),
      }
      const stream = designStream(brief, input.provider, (html, chat) => {
        void record({
          owner: user?.id ?? 'guest', fileId: (input as { fileId?: string }).fileId ?? null, kind: 'design', prompt,
          provider: chat.id, model: chat.model, exemplar: ref?.id ?? (input as { exemplarId?: string }).exemplarId ?? null,
          request: { width: brief.width, provider: input.provider, stream: true },
          response: { html }, ms: Date.now() - t0,
        })
      })
      return { status: 200, body: null, stream }
    }
    if (kind === 'design') {
      const t0 = Date.now()
      const body = await design(prompt, input, user?.id ?? 'guest')
      {
        const one = (body as { variety?: unknown[] }).variety ? null : body as { provider?: string; model?: string; html?: string }
        void record({
          owner: user?.id ?? 'guest', fileId: (input as { fileId?: string }).fileId ?? null, kind: 'design', prompt,
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

async function design(prompt: string, input: Body, owner?: string) {
  const plan = input.exemplar ? null : await choose(prompt, owner)
  const pick = plan?.ref ?? null
  // a request with no reference of its kind, a dashboard say, still borrows
  // a page's finish, but the layout has to be its own
  const mobile = !!input.mobile || !!plan?.mobile
  const styleOnly = (mobile && !plan?.ref?.mobile) || plan?.fits === false
  const ref = pick ? { id: pick.id, title: pick.title, html: excerpt(pick.id, styleOnly ? 12000 : undefined) } : null
  const exemplar = input.exemplar ?? (ref?.html ? { title: ref.title, html: ref.html, ...(styleOnly ? { styleOnly: true } : {}) } : undefined)
  const brief = {
    prompt,
    width: clamp(input.width ?? 1280, 240, 4000),
    ...(input.height ? { height: clamp(input.height, 120, 8000) } : {}),
    tokens: input.tokens,
    ...(mobile ? { mobile: true } : {}),
    ...(exemplar ? { exemplar } : {}),
    ...((input as { context?: string }).context ? { context: String((input as { context?: string }).context).slice(0, 1200) } : {}),
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

  // DEV_USER_ID makes the dev server act as a real account, so files and
  // generations made on localhost show up in production for that person
  const user = req.dev && process.env.VITE_DEV_AUTH !== '1'
    ? { id: process.env.DEV_USER_ID || 'local-dev' }
    : await userFrom(req.authorization)
  // generation is open to guests: the client allows one design before it asks
  // for an account, and the record is owned by "guest". files need a session
  if (kind) {
    if (req.method !== 'POST') return bad('POST a JSON body.', 405)
    return handle(kind, req.body, user ?? undefined)
  }

  if (path === '/api/edits') {
    if (req.method !== 'POST') return bad('POST a JSON body.', 405)
    return edits(user, req.body)
  }

  if (!user) return bad('Sign in first.', 401)

  if (path === '/api/files') {
    if (req.method === 'GET') return files.list(user)
    if (req.method === 'POST') return files.create(user, req.body)
    return bad('GET or POST.', 405)
  }
  const pic = /^\/api\/files\/([\w-]+)\/thumb$/.exec(path)?.[1]
  if (pic) return req.method === 'GET' ? files.thumb(user, pic) : bad('GET.', 405)
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
  if (reply.stream) {
    return new Response(reply.stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...cors },
    })
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
