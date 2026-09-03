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
} from './_providers.ts'
import type { DesignResult, ImageResult, SvgResult } from './_providers.ts'

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

export async function handle(kind: Kind, raw: unknown): Promise<Reply> {
  if (kind === 'providers') return { status: 200, body: catalogue() }

  const input = (raw ?? {}) as Body
  const prompt = input.prompt?.trim()
  if (!prompt) return bad('Say what to generate.')
  if (prompt.length > 4000) return bad('That prompt is too long.', 413)

  try {
    if (kind === 'design') return { status: 200, body: await design(prompt, input) }
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

/**
 * The web-standard adapter the route files use.
 *
 * Vercel's node runtime accepts a `Request`-in, `Response`-out handler, and so
 * does anything else built on fetch, which keeps the deployment target open.
 */
export async function serve(kind: Kind, req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (kind !== 'providers' && req.method !== 'POST') {
    return json({ error: 'POST a JSON body.' }, 405)
  }
  let body: unknown = null
  if (req.method === 'POST') {
    try { body = await req.json() } catch { return json({ error: 'The body was not JSON.' }, 400) }
  }
  const reply = await handle(kind, body)
  return json(reply.body, reply.status)
}

const cors: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors },
  })
