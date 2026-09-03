import type { Style } from '../doc/types'

/**
 * Design tokens are CSS custom properties, and nothing else.
 *
 * There is no token registry, no id, no separate resolution step. A token is
 * `--brand: #ff5c38` sitting in the artboard's own style, which means the
 * cascade does the work: every node inside the artboard can say
 * `var(--brand)`, changing the token restyles all of them at once, and the
 * whole thing exports as the CSS it already was.
 *
 * The consequence worth noticing is that an agent needs no token API. It
 * writes `var(--brand)` in a style string like it would in any stylesheet, and
 * `set_tokens` exists only to save it from spelling out a `--` key by hand.
 */

export interface Token {
  /** the property, dashes included */
  name: string
  value: string
  /** how many nodes reference it through var() */
  uses: number
}

export const isToken = (key: string) => key.startsWith('--')

export function tokensOf(style: Style): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(style)) if (isToken(k)) out[k] = v
  return out
}

/** a token name from whatever the person typed */
export function tokenName(raw: string): string {
  const clean = raw.trim().toLowerCase()
    .replace(/^-+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
  return clean ? `--${clean}` : ''
}

/** does this look like a colour, so the panel knows to show a swatch */
export const looksColour = (v: string) =>
  /^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\()/i.test(v.trim())
