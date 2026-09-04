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
import { chatComplete, chats, stripFences } from './_providers.js'
import { recentRefs } from './_generations.js'

export interface Ref {
  id: string
  title: string
  description?: string
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

/** the best reference and how strongly it matched; 0 when nothing fits */
/** verbs and filler that say nothing about what kind of page it is */
const NOISE = new Set(['design', 'make', 'build', 'create', 'generate', 'draw', 'write', 'add', 'new', 'the', 'and', 'for', 'with', 'page', 'site', 'website', 'him', 'her', 'them', 'me', 'my', 'our'])

export function score(prompt: string): { ref: Ref | null; top: number } {
  const words = (prompt.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => !NOISE.has(w))
  if (!words.length) return { ref: null, top: 0 }
  const docs = /\b(docs|documentation|reference|api docs)\b/i.test(prompt)
  let best: Ref | null = null
  let top = 0
  for (const t of list()) {
    let score = 0
    for (const w of words) {
      if (t.id === w) score += 3
      else if (t.keywords.includes(w)) score += 2
      else if (t.keywords.some(k => w.length > 4 && (k.startsWith(w) || w.startsWith(k)))) score += 1
    }
    // a docs request wants a docs page even when a landing shares its words
    if (docs && t.id.startsWith('docs-')) score += 3
    if (score > top) { top = score; best = t }
  }
  return { ref: best, top }
}

export function match(prompt: string): Ref | null {
  const { ref, top } = score(prompt)
  return top >= 2 ? ref : null
}

/** a request for one piece of a page, which a whole reference would swamp */
const SECTION = /\b(section|hero|header|nav|navbar|footer|banner|row|grid|card|cards|list|form|cta|testimonials?|faq|pricing table|feature|features|block|component|button|modal|sidebar|table)\b/i
/** words that say the person wants a whole thing */
const WHOLE = /\b(page|pages|landing|site|website|homepage|home page|docs|documentation|portfolio|dashboard|storefront|app|application|screen|product|platform|startup|company|studio|agency|store|shop)\b/i

/**
 * How a request should be served. A strong match lands the reference at once
 * and adapts it, unless the request is plainly for one section; a weak match
 * writes from scratch with the reference along for structure.
 */
export function decide(prompt: string): { mode: 'template' | 'generate'; ref: Ref | null } {
  const { ref, top } = score(prompt)
  const section = SECTION.test(prompt) && !WHOLE.test(prompt)
  if (ref && top >= 4 && !section) return { mode: 'template', ref }
  return { mode: 'generate', ref: top >= 2 ? ref : null }
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

export interface Choice {
  mode: 'template' | 'generate'
  ref: Ref | null
  confidence: number
  /** false when nothing on the list has this kind of layout: the pick then
   *  lends its finish, not its structure */
  fits?: boolean
  /** the request is a phone app or one of its screens, said or implied */
  mobile?: boolean
}

interface Ranked { ids: string[]; confidence: number; whole: boolean; fits: boolean; mobile: boolean }

const ranked = new Map<string, Ranked>()

/** the group a reference belongs to: docs, saas, fintech and so on */
const family = (id: string) => id.split('-')[0]

/**
 * The reference a request is closest to, chosen by a model and rotated per
 * person.
 *
 * Keywords miss anything said in other words, so the model reads the request
 * against the whole list and names the closest pages in order, how sure it is,
 * and whether the request is for a whole page or one section of one. A
 * confident whole page lands as a template; everything else generates with
 * the pick along for structure. Keyword scoring is the fallback when the call
 * fails.
 *
 * Among the pages that fit, the one this owner has not seen lately wins, so
 * three docs requests in a row land three different docs pages instead of
 * the same one three times. With every candidate already used, the one used
 * longest ago comes round again.
 */
export async function choose(prompt: string, owner?: string): Promise<Choice> {
  const key = prompt.trim().toLowerCase()
  let r = ranked.get(key)
  if (!r) {
    const usable = chats().filter(c => c.key)
    if (!usable.length) return { ...decide(prompt), confidence: 0 }
    const chat = { ...usable[0], model: process.env.OPENAI_PICK_MODEL || usable[0].model }
    const menu = list().map(t => `${t.id}: ${t.title}${t.description ? `. ${t.description}` : ''}`).join('\n')
    const system = `You route a design request to the closest reference pages from a fixed list.
Reply with one JSON object only: {"ids": ["<closest id>", "<next closest>", "<next>"], "fits": <true or false>, "mobile": <true or false>, "confidence": <0 to 1>, "whole": <true if the request is for a whole page, app, site or screen; false if it is one section, hero, row, footer or component>}.
"mobile" is true when the thing asked for is a phone app or a screen of one, whether or not the word mobile appears: a food delivery app, a fitness app, a banking app, an onboarding flow, a checkout screen, a chat screen. It is false for a website, landing page or docs site, even one about an app.
List up to three ids, closest first. Pick by what the page is for and how it is laid out, not by matching words: a fitness app belongs with the app landing, a clinic site with a services landing, a changelog with docs.
"fits" is true only when a listed page has the same kind of layout as the request. Every page on the list is a marketing site, portfolio or docs site, so a website, landing page or site for any product fits, including one for a mobile or fitness app. What does not fit is the inside of a product: a dashboard, admin panel, analytics view, app screen, editor, tool, table, inbox, chat, checkout or settings page. For those set fits false and confidence 0.2 or lower, and still list the pages whose visual finish would suit best. Confidence is how well the first page's structure serves the request.
REFERENCES
${menu}`
    try {
      const text = await chatComplete(chat, system, `REQUEST\n${prompt}`, 400)
      const raw = stripFences(text).trim()
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { ids?: unknown; id?: string; fits?: boolean; mobile?: boolean; confidence?: number; whole?: boolean }
      const known = new Set(list().map(t => t.id))
      const given = (Array.isArray(j.ids) ? j.ids : [j.id]).filter((x): x is string => typeof x === 'string' && known.has(x))
      if (!given.length) return { ...decide(prompt), confidence: 0 }
      const mobile = j.mobile === true
      const fits = j.fits !== false && !mobile
      r = { ids: [...new Set(given)], confidence: fits ? Math.max(0, Math.min(1, Number(j.confidence ?? 0))) : Math.min(0.2, Number(j.confidence ?? 0)), whole: !!j.whole, fits, mobile }
      ranked.set(key, r)
    } catch (e) {
      console.warn('refs: model pick failed, keywords instead:', e instanceof Error ? e.message : e)
      return { ...decide(prompt), confidence: 0 }
    }
  }
  // the model's picks, then the rest of the first pick's family, so a lone
  // answer still has something to rotate through
  const pool = [...r.ids]
  for (const t of list()) if (family(t.id) === family(r.ids[0]) && !pool.includes(t.id)) pool.push(t.id)
  const seen = owner ? await recentRefs(owner) : []
  const unseen = pool.filter(id => !seen.includes(id))
  const fresh = unseen.find(id => family(id) === family(r.ids[0])) ?? unseen[0]
  const id = fresh ?? pool.slice().sort((a, b) => seen.indexOf(b) - seen.indexOf(a))[0]
  const ref = list().find(t => t.id === id) ?? null
  return ref
    ? { mode: r.fits && r.whole && r.confidence >= 0.45 ? 'template' : 'generate', ref, confidence: r.confidence, fits: r.fits, mobile: r.mobile }
    : { ...decide(prompt), confidence: 0 }
}
