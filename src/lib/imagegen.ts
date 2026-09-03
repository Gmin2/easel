/**
 * Image generation, without a server of our own.
 *
 * The endpoint takes the prompt in the path and answers with the image, so a
 * generated image is a URL — no key to ship, no backend to keep alive for the
 * judges, and nothing to bill. It also means a generated image is just an
 * `<img src>` like any other, so it exports with the design and the person
 * looking at the file later does not need us to still exist.
 *
 * The agent has a second, better route: it can generate an image with whatever
 * model it already has and call `set_image` with the result. This is here so
 * that a person on their own is not stuck.
 */

const HOST = 'https://image.pollinations.ai/prompt'

export interface GenOptions {
  w?: number
  h?: number
  /** same prompt and same seed gives the same image, which makes retries honest */
  seed?: number
  model?: string
}

export function imageUrl(prompt: string, o: GenOptions = {}): string {
  const q = new URLSearchParams({
    width: String(Math.round(o.w ?? 768)),
    height: String(Math.round(o.h ?? 768)),
    seed: String(o.seed ?? Math.floor(Math.random() * 1e6)),
    nologo: 'true',
    ...(o.model && { model: o.model }),
  })
  return `${HOST}/${encodeURIComponent(prompt.trim())}?${q}`
}

/**
 * Generate, and wait for the picture to actually decode.
 *
 * Returning before it has loaded would put a broken image on the canvas and
 * call it a success, and generation takes seconds — long enough that the
 * difference is visible to whoever is watching.
 *
 * The result stays a URL. We measured two things that rule out inlining the
 * bytes: the endpoint answers `<img>` requests with 200 but `fetch` with 403,
 * so we cannot read them; and it sends no `access-control-allow-origin`, so
 * setting `crossOrigin` makes even the `<img>` fail to decode. Which leaves a
 * plain URL as the only form that works — fine for the canvas and for HTML
 * export, and the reason `set_image` takes a `data:` URI: an agent that
 * generates its own image can hand over bytes and get a self-contained
 * document, which this route cannot give.
 */
export async function generate(
  prompt: string, o: GenOptions = {},
): Promise<{ src: string; w: number; h: number }> {
  if (!prompt.trim()) throw new Error('The prompt was empty.')
  const src = imageUrl(prompt, o)
  const img = new Image()
  img.src = src
  try {
    await img.decode()
  } catch {
    throw new Error('The generator did not return an image. Try again, or reword the prompt.')
  }
  return { src, w: img.naturalWidth, h: img.naturalHeight }
}
