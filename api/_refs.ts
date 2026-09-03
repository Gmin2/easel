/**
 * Reference pages for generation.
 *
 * Twenty four real pages, flattened to this document's html and stripped of
 * their brands, live next to this file. They are never shown to anyone: a
 * request is matched against them by keyword and the closest one rides along
 * in the prompt as the reference for structure, spacing and type scale. That
 * is the difference between a model's idea of a docs page and a docs page
 * someone shipped.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Ref {
  id: string
  title: string
  keywords: string[]
  width: number
  height: number
}

const dir = fileURLToPath(new URL('./refs/', import.meta.url))
let manifest: Ref[] | null = null

function list(): Ref[] {
  manifest ??= JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as Ref[]
  return manifest
}

export function match(prompt: string): Ref | null {
  const words = prompt.toLowerCase().match(/[a-z]+/g) ?? []
  if (!words.length) return null
  let best: Ref | null = null
  let top = 0
  for (const t of list()) {
    let score = 0
    for (const w of words) {
      if (t.id === w) score += 3
      else if (t.keywords.includes(w)) score += 2
      else if (t.keywords.some(k => w.length > 4 && (k.startsWith(w) || w.startsWith(k)))) score += 1
    }
    if (score > top) { top = score; best = t }
  }
  return top >= 2 ? best : null
}

/** the page's html, already stripped of images and icons, cut to a prompt sized excerpt */
export function excerpt(id: string, cap = 28000): string {
  let s: string
  try { s = readFileSync(`${dir}${id}.html`, 'utf8') } catch { return '' }
  return s.length > cap ? s.slice(0, cap) + '\n<!-- truncated -->' : s
}

/** what a request should carry, when something fits */
export function exemplarFor(prompt: string): { id: string; title: string; html: string } | null {
  const t = match(prompt)
  if (!t) return null
  const html = excerpt(t.id)
  return html ? { id: t.id, title: t.title, html } : null
}
