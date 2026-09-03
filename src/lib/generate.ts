/**
 * Generation, through our own backend.
 *
 * Three kinds, one client. The endpoints live in `api/` and run server side
 * because keys must not ship in frontend javascript — but the reason it is
 * worth a backend rather than a proxy is what comes back: base64, which the
 * browser is not allowed to read out of a cross-origin image. Bytes we hold
 * become a `data:` URI, and a document made of `data:` URIs is one that renders
 * wherever it is pasted with nothing of ours still running.
 *
 * The design path matters most. Easel's document is real HTML with real CSS, so
 * a model that writes HTML has written the document — not a picture of it, not
 * a layer to import. It arrives as nodes you can drag, an agent can read back
 * through `get_node`, and `Copy as React` hands over unchanged.
 */

import * as auth from './auth'

export type Kind = 'design' | 'image' | 'svg'

export interface Provider {
  id: string
  label: string
  model: string
}

export interface Catalogue {
  design: Provider[]
  image: Provider[]
  svg: Provider[]
  /** which keys the server found, never the keys */
  keys: { openai: boolean; kimi: boolean; gemini: boolean; quiver: boolean }
}

interface Made {
  provider: string
  label: string
  model: string
  note?: string
}

export interface DesignOut extends Made { html: string }
export interface ImageOut extends Made { src: string; w: number; h: number; embedded: boolean }
export interface SvgOut extends Made { svg: string; credits?: number }

export const RATIOS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'] as const
export type Ratio = typeof RATIOS[number]

/** a ratio as pixels, long edge fixed — what the node gets sized to */
export function ratioSize(ratio: string, long = 384): { w: number; h: number } {
  const [a, b] = ratio.split(':').map(Number)
  if (!a || !b) return { w: long, h: long }
  return a >= b
    ? { w: Math.round(long), h: Math.round((long * b) / a) }
    : { w: Math.round((long * a) / b), h: Math.round(long) }
}

export interface Fail { provider: string; error: string }

/**
 * What a fan-out came back with: the answers, and who could not answer.
 *
 * A variety pack that quietly returned two results when it fired at three
 * providers would be hiding the one fact worth knowing — that a key is dead —
 * so the failures travel alongside the successes rather than being dropped.
 */
export interface Fan<T> { made: T[]; failed: Fail[] }

/**
 * A provider's error is the message, verbatim.
 *
 * "Rate limit reached", "rejected the API key" and "would not make this image"
 * are three different things to do next about, and the version of this feature
 * that swallowed all three into one silent failure was a bug we had to chase.
 */
async function call<T>(kind: Kind, input: object): Promise<Fan<T>> {
  let res: Response
  try {
    res = await fetch(`/api/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await auth.headers()) },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Could not reach the generation endpoint. Is the dev server running?')
  }

  const body = await res.json().catch(() => null) as
    { error?: string; variety?: T[]; failed?: Fail[] } & T | null

  if (!res.ok || !body) {
    throw new Error(body?.error ?? `The generator answered ${res.status}.`)
  }
  return {
    made: body.variety ?? [body as T],
    failed: body.failed ?? [],
  }
}

/** the failures as one sentence, for the bar's error line or a tool's note */
export const failNote = (failed: Fail[]): string | null =>
  failed.length
    ? `${failed.length} provider${failed.length > 1 ? 's' : ''} failed — `
      + failed.map(f => `${f.provider}: ${f.error}`).join('; ')
    : null

/** which models this deployment can actually reach, for the model chip */
export async function catalogue(): Promise<Catalogue> {
  const res = await fetch('/api/providers')
  if (!res.ok) throw new Error(`Could not read the provider list (${res.status}).`)
  return res.json() as Promise<Catalogue>
}

export interface DesignInput {
  prompt: string
  /** the artboard's width, so the fragment is authored to fit it */
  width: number
  height?: number
  /** css custom properties on the artboard, for the model to reference */
  tokens?: Record<string, string>
  provider?: string
  /** a flattened template that is close to the ask, see lib/templates */
  exemplar?: { title: string; html: string }
}

export const design = (input: DesignInput) => call<DesignOut>('design', input)

export const image = (input: {
  prompt: string; ratio?: string; seed?: number; provider?: string
}) => call<ImageOut>('image', input)

export const svg = (input: {
  prompt: string; ratio?: string; provider?: string
}) => call<SvgOut>('svg', input)

/**
 * One image, for the callers that only ever want one.
 *
 * The inspector's per-node generator and the agent's `generate_image` both
 * fill a single node, so they take this rather than unpacking a list.
 */
export async function oneImage(input: {
  prompt: string; ratio?: string; seed?: number; provider?: string
}): Promise<ImageOut> {
  if (!input.prompt.trim()) throw new Error('The prompt was empty.')
  const { made, failed } = await image(input)
  if (!made.length) throw new Error(failNote(failed) ?? 'The generator returned nothing.')
  return made[0]
}
