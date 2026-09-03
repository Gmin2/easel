import { hexToRgb, rgbToHex } from './color'

/**
 * Reading css back out of a style object.
 *
 * The document stores what was written, not a normalised form, so a colour
 * might be `#fff`, `#ffffff`, `rgb(255 255 255)` or `rgba(0,0,0,.5)`. The
 * inspector needs one shape to edit and has to hand back something a browser
 * will accept, without rewriting properties the user never touched.
 */

export interface Colour { hex: string; alpha: number }

const NAMED: Record<string, Colour> = {
  transparent: { hex: '#000000', alpha: 0 },
  white: { hex: '#FFFFFF', alpha: 1 },
  black: { hex: '#000000', alpha: 1 },
}

export function readColour(v: string | undefined, fallback = '#000000'): Colour {
  const raw = (v ?? '').trim()
  if (!raw) return { hex: fallback.toUpperCase(), alpha: v === undefined ? 0 : 1 }
  const named = NAMED[raw.toLowerCase()]
  if (named) return named

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(raw)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    const [r, g, b] = parts
    const a = parts.length > 3 ? parts[3] : 1
    if ([r, g, b].every(n => !Number.isNaN(n))) {
      return { hex: '#' + rgbToHex({ r, g, b }), alpha: Number.isNaN(a) ? 1 : a }
    }
  }

  const hex = hexToRgb(raw)
  if (hex) return { hex: '#' + rgbToHex(hex), alpha: 1 }
  // a gradient or a keyword we do not model: show it as opaque and leave the
  // original string alone until something actually edits it
  return { hex: fallback.toUpperCase(), alpha: 1 }
}

export function writeColour(hex: string, alpha: number): string {
  if (alpha >= 1) return hex.toUpperCase()
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const a = Math.round(alpha * 1000) / 1000
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`
}

/** a css length as a number, whatever unit it was written in */
export function num(v: string | undefined, fallback = 0): number {
  const m = /^(-?[\d.]+)/.exec((v ?? '').trim())
  return m ? Number(m[1]) : fallback
}

export const unitOf = (v: string | undefined, fallback = 'px') => {
  const m = /^-?[\d.]+([a-z%]*)$/i.exec((v ?? '').trim())
  return m && m[1] ? m[1] : fallback
}

/** rewrite a length, keeping whatever unit was already there */
export const withNum = (v: string | undefined, n: number, fallback = 'px') =>
  `${Math.round(n * 100) / 100}${unitOf(v, fallback)}`
