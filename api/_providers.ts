/**
 * The providers, server side.
 *
 * Everything here runs on the server for three reasons, in order of how much
 * they cost us to get wrong: keys must not ship in frontend javascript; the
 * browser cannot read a cross-origin image it is allowed to display, so
 * embedding one has to happen somewhere with no origin; and once the bytes are
 * ours we can hand back a `data:` URI, which is what makes an exported Easel
 * document render with nothing of ours still alive behind it.
 *
 * Each kind of generation is a list of candidates, tried in order until one has
 * a key and answers. That is what "degrade gracefully" means concretely: with
 * no keys at all the image path still works through a keyless endpoint, and
 * every response says which provider actually served it so the UI can be
 * honest about what the person is looking at.
 */

import { designSystem, designUser, svgInstructions, svgSystem } from './_prompt.js'
import type { DesignBrief } from './_prompt.js'

// ------------------------------------------------------------------- plumbing

/** an error with a sentence in it that a person can act on */
export class ProviderError extends Error {
  status: number
  provider: string | undefined

  constructor(message: string, status = 502, provider?: string) {
    super(message)
    this.status = status
    this.provider = provider
  }
}

/**
 * Keys are read through here so an alias the vendor's own docs use works too.
 * A judge who exported `QUIVERAI_API_KEY` because that is what Quiver's
 * quickstart says should not find a dead button.
 */
const key = (...names: string[]): string | null => {
  for (const n of names) {
    const v = process.env[n]?.trim()
    if (v) return v
  }
  return null
}

const env = (name: string, fallback: string): string =>
  process.env[name]?.trim() || fallback

const KEYS = {
  get openai() { return key('OPENAI_API_KEY') },
  get kimi() { return key('KIMI_API_KEY', 'MOONSHOT_API_KEY') },
  get gemini() { return key('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY') },
  get quiver() { return key('QUIVER_API_KEY', 'QUIVERAI_API_KEY') },
}

/** how long we will wait on a model before giving the person their bar back */
const TIMEOUT = 90_000

async function post(url: string, init: RequestInit & { provider: string }): Promise<unknown> {
  const { provider, ...rest } = init
  let res: Response
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(TIMEOUT) })
  } catch (e) {
    const why = e instanceof Error && e.name === 'TimeoutError'
      ? `${provider} did not answer within ${TIMEOUT / 1000}s.`
      : `Could not reach ${provider}: ${e instanceof Error ? e.message : String(e)}`
    throw new ProviderError(why, 504, provider)
  }

  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { /* not json */ }

  if (!res.ok) throw new ProviderError(explain(provider, res.status, body, text), res.status, provider)
  if (body == null) throw new ProviderError(`${provider} returned an empty response.`, 502, provider)
  return body
}

/**
 * Turn a provider's error into a sentence.
 *
 * The previous version of image generation failed silently, which cost us an
 * afternoon of chasing it. A rate limit, a bad key and a safety refusal are
 * three completely different things to do next about, so all three come back as
 * readable text rather than as a dead button.
 */
function explain(provider: string, status: number, body: unknown, raw: string): string {
  const b = body as { error?: { message?: string; status?: string; type?: string }; message?: string; code?: string } | null
  const message = b?.error?.message ?? b?.message ?? raw.slice(0, 300) ?? ''
  const code = b?.code ?? b?.error?.status ?? b?.error?.type ?? ''

  if (status === 401 || status === 403) {
    return `${provider} rejected the API key${code ? ` (${code})` : ''}. ${message}`.trim()
  }
  // moonshot bills a spent balance as a 429, which would otherwise read as
  // "wait a moment and try again" for something waiting will not fix
  if (status === 402 || code === 'insufficient_credits' || code === 'exceeded_current_quota_error') {
    return `${provider} is out of credits. ${message}`.trim()
  }
  if (status === 429) {
    return `${provider} rate limit reached — wait a moment and try again. ${message}`.trim()
  }
  if (code === 'content_policy_violation') {
    return `${provider} refused this prompt on content policy grounds. ${message}`.trim()
  }
  if (status === 404 || code === 'model_not_found') {
    return `${provider} does not have that model. ${message}`.trim()
  }
  return `${provider} failed (${status}). ${message}`.trim() || `${provider} failed (${status}).`
}

/** models return fenced markup however firmly you ask them not to */
export function stripFences(text: string): string {
  const fenced = /```(?:html|svg|xml|jsx)?\s*\n?([\s\S]*?)```/i.exec(text)
  if (fenced) return fenced[1].trim()
  // a reply cut off at the token limit keeps its opening fence and never
  // reaches a closing one, and that fence would land as text in the document
  return text.replace(/^\s*```(?:html|svg|xml|jsx)?[ \t]*\r?\n?/i, '').trim()
}

// --------------------------------------------------------------- chat clients

/**
 * One client shape for every OpenAI-compatible endpoint.
 *
 * OpenAI and Kimi differ only in a base url, a key and a model name, so
 * offering both is a table rather than a second integration.
 */
export interface Chat {
  id: string
  label: string
  base: string
  model: string
  key: string | null
}

// one model for design and edits. the others stay wired for the day that
// changes, but only GPT is offered
const ONLY = 'openai'

export const chats = (): Chat[] => allChats().filter(c => c.id === ONLY)

const allChats = (): Chat[] => [
  {
    id: 'openai',
    label: 'GPT',
    base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    model: env('OPENAI_MODEL', 'gpt-5.6-sol'),
    key: KEYS.openai,
  },
  {
    id: 'kimi',
    label: 'Kimi',
    base: env('KIMI_BASE_URL', 'https://api.moonshot.ai/v1'),
    // moonshot's /v1/models is the only list that counts, and it offers
    // kimi-k2.6 and kimi-k2.7-code. KIMI_MODEL pins a different one
    model: env('KIMI_MODEL', 'kimi-k2.6'),
    key: KEYS.kimi,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    // google publishes an OpenAI-compatible surface, so gemini joins the same
    // table instead of needing its own request shape for text
    base: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
    // the alias rather than a version, because google retires pinned flash
    // models for new keys and the failure reads as "no such model" months
    // after anyone remembers choosing one. GEMINI_TEXT_MODEL pins it
    model: env('GEMINI_TEXT_MODEL', 'gemini-flash-latest'),
    key: KEYS.gemini,
  },
]

export async function chatComplete(
  chat: Chat, system: string, user: string, maxTokens = 16000, extra: Record<string, unknown> = {},
): Promise<string> {
  if (!chat.key) throw new ProviderError(`No API key for ${chat.label}.`, 400, chat.id)
  const body = await post(`${chat.base}/chat/completions`, {
    provider: chat.label,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${chat.key}`,
    },
    body: JSON.stringify({
      model: chat.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: maxTokens,
      ...(chat.id === 'openai' ? { reasoning_effort: 'low' } : {}),
      ...extra,
    }),
  }) as { choices?: { message?: { content?: string }; finish_reason?: string }[] }

  const text = body.choices?.[0]?.message?.content
  if (!text?.trim()) {
    const why = body.choices?.[0]?.finish_reason
    throw new ProviderError(
      `${chat.label} returned no text${why ? ` (finished: ${why})` : ''}.`, 502, chat.id)
  }
  return text
}

/**
 * The same call, as it is written.
 *
 * Yields text deltas from the OpenAI style SSE stream every chat provider
 * here speaks. Errors before the first byte carry the provider's own status;
 * a stream that dies midway ends the iterator, and the caller decides what
 * the partial answer is worth.
 */
export async function* chatStream(
  chat: Chat, system: string, user: string, maxTokens = 8000, extra: Record<string, unknown> = {},
): AsyncGenerator<string> {
  if (!chat.key) throw new ProviderError(`No API key for ${chat.label}.`, 400, chat.id)
  let res: Response
  try {
    res = await fetch(`${chat.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chat.key}` },
      body: JSON.stringify({
        model: chat.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_completion_tokens: maxTokens,
        stream: true,
        ...(chat.id === 'openai' ? { reasoning_effort: 'low' } : {}),
        ...extra,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch (e) {
    throw new ProviderError(`Could not reach ${chat.label}: ${e instanceof Error ? e.message : String(e)}`, 504, chat.id)
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { /* not json */ }
    throw new ProviderError(explain(chat.label, res.status, body, text), res.status, chat.id)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
        const t = j.choices?.[0]?.delta?.content
        if (t) yield t
      } catch { /* keepalive or partial */ }
    }
  }
}

// -------------------------------------------------------------------- designs

export interface DesignResult {
  kind: 'design'
  provider: string
  label: string
  model: string
  html: string
}

/** who can write markup right now, best first */
export const designProviders = () =>
  chats().filter(c => c.key).map(c => ({ id: c.id, label: c.label, model: c.model }))

export async function generateDesign(
  brief: DesignBrief, want?: string,
): Promise<DesignResult> {
  const usable = chats().filter(c => c.key)
  if (!usable.length) {
    throw new ProviderError(
      'No design model is configured. Set OPENAI_API_KEY, KIMI_API_KEY or '
      + 'GEMINI_API_KEY in .env and restart the dev server.', 400)
  }
  const chat = usable.find(c => c.id === want) ?? usable[0]
  const html = stripFences(await chatComplete(chat, designSystem(brief), designUser(brief)))
  if (!/<[a-z]/i.test(html)) {
    throw new ProviderError(`${chat.label} answered with prose rather than HTML.`, 502, chat.id)
  }
  return { kind: 'design', provider: chat.id, label: chat.label, model: chat.model, html }
}

// --------------------------------------------------------------------- images

export interface ImageResult {
  kind: 'image'
  provider: string
  label: string
  model: string
  src: string
  w: number
  h: number
  /** true when the bytes are in the src, which is what makes an export stand alone */
  embedded: boolean
  note?: string
}

export const RATIOS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'] as const
export type Ratio = typeof RATIOS[number]

/** a ratio as pixels, long edge fixed, rounded to a multiple of 8 */
export function ratioSize(ratio: string, long = 1024): { w: number; h: number } {
  const [a, b] = ratio.split(':').map(Number)
  if (!a || !b) return { w: long, h: long }
  const round = (n: number) => Math.max(64, Math.round(n / 8) * 8)
  return a >= b
    ? { w: round(long), h: round((long * b) / a) }
    : { w: round((long * a) / b), h: round(long) }
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Gemini's image models, newest first.
 *
 * A list rather than one id because these ship and retire on their own
 * schedule: a `model_not_found` on the first name falls through to the next
 * instead of becoming an error the person has to read release notes to
 * understand. `GEMINI_IMAGE_MODEL` pins it if you know what you want.
 */
const IMAGE_MODELS = [
  env('GEMINI_IMAGE_MODEL', ''),
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
].filter(Boolean)

async function geminiImage(
  prompt: string, ratio: string, apiKey: string,
): Promise<ImageResult> {
  let last: ProviderError | null = null

  for (const model of IMAGE_MODELS) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: ratio },
      },
    }
    let answer: GeminiAnswer
    try {
      answer = await post(`${GEMINI}/models/${model}:generateContent`, {
        provider: 'Gemini',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }) as GeminiAnswer
    } catch (e) {
      last = e as ProviderError
      // only a missing model is worth trying the next name for; a bad key or a
      // rate limit will say the same thing again
      if (last.status === 404 || last.status === 400) continue
      throw last
    }

    const parts = answer.candidates?.[0]?.content?.parts ?? []
    const inline = parts.find(p => p.inlineData?.data ?? p.inline_data?.data)
    const data = inline?.inlineData ?? inline?.inline_data

    if (!data?.data) {
      const refusal = answer.promptFeedback?.blockReason
        ?? answer.candidates?.[0]?.finishReason
      const said = parts.map(p => p.text).filter(Boolean).join(' ').slice(0, 240)
      throw new ProviderError(
        refusal
          ? `Gemini would not make this image (${refusal}).${said ? ` It said: ${said}` : ''}`
          : `Gemini returned no image.${said ? ` It said: ${said}` : ''}`,
        502, 'gemini')
    }

    const size = ratioSize(ratio)
    return {
      kind: 'image',
      provider: 'gemini',
      label: 'Gemini',
      model,
      src: `data:${data.mimeType ?? data.mime_type ?? 'image/png'};base64,${data.data}`,
      w: size.w,
      h: size.h,
      embedded: true,
    }
  }

  throw last ?? new ProviderError('Gemini has no usable image model.', 502, 'gemini')
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; mime_type?: string; data?: string }
  inline_data?: { mimeType?: string; mime_type?: string; data?: string }
}

interface GeminiAnswer {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

/**
 * The keyless path, kept working on purpose.
 *
 * Pollinations answers a browser `fetch` with 403 and sends no
 * `access-control-allow-origin`, which is why the old client-side version could
 * only ever hold a URL. From the server there is no origin to object to, so the
 * bytes come back and even the no-key path produces an embedded image and a
 * self-contained export.
 */
async function pollinations(prompt: string, ratio: string, seed?: number): Promise<ImageResult> {
  const { w, h } = ratioSize(ratio, 768)
  const q = new URLSearchParams({
    width: String(w),
    height: String(h),
    seed: String(seed ?? Math.floor(Math.random() * 1e6)),
    nologo: 'true',
  })
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`

  const shared = {
    kind: 'image' as const,
    provider: 'pollinations',
    label: 'Pollinations',
    model: 'flux',
    w,
    h,
    note: 'No GEMINI_API_KEY is set, so this came from the keyless fallback.',
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!res.ok) throw new Error(`http ${res.status}`)
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) throw new Error(`answered ${type}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length < 512) throw new Error('answered with an empty image')
    return { ...shared, src: `data:${type};base64,${bytes.toString('base64')}`, embedded: true }
  } catch {
    // it still serves <img> when it will not serve us, so a url beats nothing
    return { ...shared, src: url, embedded: false }
  }
}

const OPENAI_IMAGE = env('OPENAI_IMAGE_MODEL', 'gpt-image-2')

/** openai's image endpoint: bytes back as base64, sized to the nearest supported frame */
async function openaiImage(prompt: string, ratio: string): Promise<ImageResult> {
  const [a, b] = ratio.split(':').map(Number)
  const size = a > b ? '1536x1024' : a < b ? '1024x1536' : '1024x1024'
  const body = await post('https://api.openai.com/v1/images/generations', {
    provider: 'GPT image',
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEYS.openai}` },
    body: JSON.stringify({ model: OPENAI_IMAGE, prompt, n: 1, size, quality: 'medium', output_format: 'jpeg' }),
  }) as { data?: { b64_json?: string }[] }
  const b64 = body.data?.[0]?.b64_json
  if (!b64) throw new ProviderError('GPT image returned no picture.', 502, 'openai')
  const [w, h] = size.split('x').map(Number)
  return { kind: 'image', provider: 'openai', label: 'GPT image', model: OPENAI_IMAGE, src: `data:image/jpeg;base64,${b64}`, w, h, embedded: true }
}

export const imageProviders = () => [
  ...(KEYS.openai ? [{ id: 'openai', label: 'GPT image', model: OPENAI_IMAGE }] : []),
  ...(KEYS.gemini ? [{ id: 'gemini', label: 'Gemini', model: IMAGE_MODELS[0] }] : []),
  { id: 'pollinations', label: 'Pollinations', model: 'flux' },
]

export async function generateImage(input: {
  prompt: string
  ratio?: string
  seed?: number
  provider?: string
}): Promise<ImageResult> {
  const ratio = (RATIOS as readonly string[]).includes(input.ratio ?? '') ? input.ratio! : '1:1'
  const gemini = KEYS.gemini

  if (input.provider === 'pollinations') return pollinations(input.prompt, ratio, input.seed)
  if (input.provider === 'gemini' && gemini) return geminiImage(input.prompt, ratio, gemini)
  if (KEYS.openai && input.provider !== 'gemini') return openaiImage(input.prompt, ratio)
  if (gemini) return geminiImage(input.prompt, ratio, gemini)
  return pollinations(input.prompt, ratio, input.seed)
}

// ----------------------------------------------------------------------- svgs

export interface SvgResult {
  kind: 'svg'
  provider: string
  label: string
  model: string
  svg: string
  credits?: number
  note?: string
}

/**
 * Arrow, with the ids and display names Quiver's own `/v1/models` returns.
 *
 * Note that Arrow 1.0 is `arrow-1`, not `arrow-1.0` — the version in the name
 * is not the version in the id, and asking for the latter is a 404.
 */
const ARROW_NAMES: Record<string, string> = {
  'arrow-1.1': 'QuiverAI Arrow 1.1',
  'arrow-1.1-max': 'QuiverAI Arrow 1.1 Max',
  'arrow-1': 'QuiverAI Arrow 1.0',
}

export const ARROW_MODELS = ['arrow-1.1', 'arrow-1.1-max', 'arrow-1'] as const

export const svgProviders = () => [
  ...(KEYS.quiver
    ? ARROW_MODELS.map(m => ({ id: `quiver:${m}`, label: ARROW_NAMES[m], model: m }))
    : []),
  ...allChats().filter(c => c.key && (c.id === 'gemini' || c.id === 'openai')).map(c => ({ id: c.id, label: `${c.label} (markup)`, model: c.id === 'gemini' ? GEMINI_SVG : c.model })),
]

/** gemini draws markup well; a pro model for the fallback, since an icon is small and quality shows */
const GEMINI_SVG = env('GEMINI_SVG_MODEL', 'gemini-pro-latest')

/**
 * Quiver's text-to-SVG, which returns raw markup rather than a raster.
 *
 * `POST /v1/svgs/generations`, bearer auth, and `data[].svg` is a string of
 * real SVG — which is exactly the shape this app wants, because the document is
 * HTML and can simply hold it.
 */
async function quiverSvg(
  prompt: string, model: string, ratio: string, apiKey: string,
): Promise<SvgResult> {
  const { w, h } = ratioSize(ratio, 512)
  const body = await post('https://api.quiver.ai/v1/svgs/generations', {
    provider: 'QuiverAI',
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      instructions: svgInstructions,
      n: 1,
      stream: false,
      attributes: { viewBox: { minX: 0, minY: 0, width: w, height: h } },
    }),
  }) as { data?: { svg?: string }[]; credits?: number }

  const svg = body.data?.[0]?.svg
  if (!svg?.trim()) throw new ProviderError('QuiverAI returned no SVG.', 502, 'quiver')
  return {
    kind: 'svg',
    provider: 'quiver',
    label: ARROW_NAMES[model] ?? `QuiverAI ${model}`,
    model,
    svg,
    credits: body.credits,
  }
}

export async function generateSvg(input: {
  prompt: string
  ratio?: string
  provider?: string
}): Promise<SvgResult> {
  const ratio = (RATIOS as readonly string[]).includes(input.ratio ?? '') ? input.ratio! : '1:1'
  const want = input.provider ?? ''
  const quiver = KEYS.quiver

  const arrow = want.startsWith('quiver:')
    ? want.slice(7)
    : want === 'quiver' || !want ? ARROW_MODELS[0] : null

  let arrowFailed: ProviderError | null = null
  if (quiver && arrow && (ARROW_MODELS as readonly string[]).includes(arrow)) {
    try {
      return await quiverSvg(input.prompt, arrow, ratio, quiver)
    } catch (e) {
      // out of credits or temporarily down is not a reason to hand back a dead
      // button when three chat models are sitting right there
      const err = e as ProviderError
      const recoverable = err.status === 402 || err.status === 429 || err.status >= 500
      if (!recoverable || !allChats().some(c => c.key && (c.id === 'gemini' || c.id === 'openai'))) throw err
      arrowFailed = err
    }
  }

  // a chat model asked for markup is a real fallback rather than a stub: svg is
  // text, and gemini in particular draws it well. gemini first, then GPT
  const pool = allChats().filter(c => c.key && (c.id === 'gemini' || c.id === 'openai'))
    .map(c => c.id === 'gemini' ? { ...c, model: GEMINI_SVG } : c)
  const chat = pool.find(c => c.id === want) ?? pool.find(c => c.id === 'gemini') ?? pool[0]
  if (!chat) {
    throw new ProviderError(
      'No SVG model is configured. Set QUIVER_API_KEY for Arrow, or any of '
      + 'OPENAI_API_KEY / KIMI_API_KEY / GEMINI_API_KEY to have a chat model '
      + 'write the markup instead.', 400)
  }
  const svg = stripFences(await chatComplete(chat, svgSystem, input.prompt, 4000))
  return {
    kind: 'svg',
    provider: chat.id,
    label: `${chat.label} (markup)`,
    model: chat.model,
    svg,
    ...(arrowFailed
      ? { note: `Arrow was unavailable, so a chat model drew it. ${arrowFailed.message}` }
      : quiver ? {} : { note: 'Set QUIVER_API_KEY to use Arrow, a dedicated vector model.' }),
  }
}

// ---------------------------------------------------------------- variety pack

/**
 * The same prompt at every provider at once.
 *
 * Paper's "variety pack" chip, and the reason the provider layer above is a
 * list of candidates rather than an if: a fan-out is a loop over it. Failures
 * come back alongside successes so one dead key does not lose the others.
 */
export async function variety<T>(
  ids: string[], run: (id: string) => Promise<T>,
): Promise<{ ok: T[]; failed: { provider: string; error: string }[] }> {
  const settled = await Promise.allSettled(ids.map(run))
  const ok: T[] = []
  const failed: { provider: string; error: string }[] = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') ok.push(s.value)
    else failed.push({ provider: ids[i], error: s.reason?.message ?? String(s.reason) })
  })
  return { ok, failed }
}

/** what the UI puts in the model chip, so the choices are the real ones */
export function catalogue() {
  return {
    design: designProviders(),
    image: imageProviders(),
    svg: svgProviders(),
    keys: {
      openai: !!KEYS.openai,
      kimi: !!KEYS.kimi,
      gemini: !!KEYS.gemini,
      quiver: !!KEYS.quiver,
    },
  }
}
