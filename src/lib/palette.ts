import { descendants } from '../doc/ops'
import type { Doc } from '../doc/types'

export interface Swatch {
  value: string
  uses: number
  properties: string[]
}

const COLOURY = /color|background|border|outline|shadow|fill|stroke/i
const VALUE = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gi

/**
 * A theme token holds a colour under a name of its owner's choosing, so
 * `--brand: #0f766e` is real palette and no property-name filter will ever
 * catch it. Once a design is tokenised, most of its colour lives here — miss
 * these and the answer to "what is the palette" is a design's leftovers.
 *
 * Its own copy of the pattern, without the global flag: `test` on a sticky
 * regex moves `lastIndex`, and sharing one with the loop below would make
 * each call quietly change what the next one matches.
 */
const ONE = new RegExp(VALUE.source, 'i')
const tokenColour = (key: string, value: string) =>
  key.startsWith('--') && ONE.test(value.trim())

/**
 * Every colour the design actually uses.
 *
 * Read off the document's own css rather than from a swatch list someone
 * maintained by hand, so it cannot drift from what is on screen — and so an
 * agent asking "what is the palette" gets the truth even for a design it did
 * not make.
 */
export function palette(doc: Doc, artboardId?: string): Swatch[] {
  const scope = artboardId
    ? [artboardId, ...descendants(doc, artboardId)]
    : Object.keys(doc.nodes)

  const seen = new Map<string, { uses: number; where: Set<string> }>()
  for (const id of scope) {
    const node = doc.nodes[id]
    if (!node) continue
    for (const [k, v] of Object.entries(node.style)) {
      if (!COLOURY.test(k) && !tokenColour(k, v)) continue
      for (const m of v.matchAll(VALUE)) {
        const key = m[0].toLowerCase()
        const hit = seen.get(key) ?? { uses: 0, where: new Set<string>() }
        hit.uses++
        hit.where.add(k)
        seen.set(key, hit)
      }
    }
  }

  return [...seen.entries()]
    .sort((a, b) => b[1].uses - a[1].uses)
    .map(([value, v]) => ({ value, uses: v.uses, properties: [...v.where] }))
}
