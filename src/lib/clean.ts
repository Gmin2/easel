/**
 * Markup from a stranger, made safe to put in the document.
 *
 * Generated HTML and generated SVG both end up as real DOM here — that is the
 * point of the app, and it is also the risk — so neither reaches the tree
 * without coming through this file. Both use the browser's *html* parser
 * rather than its xml one, deliberately: it is the parser that will read the
 * markup again when it is actually inserted, so sanitising with the same one
 * leaves no second reading for something to hide in. It also repairs `viewbox`
 * to `viewBox` on the way through, which strict xml parsing would simply have
 * refused.
 *
 * The server sanitises the same things with regexes before this ever runs. This
 * is the gate that matters, because it is the last one.
 */

/** elements with no business in a design */
const BANNED = new Set([
  'script', 'style', 'link', 'meta', 'base', 'iframe', 'object', 'embed',
  'foreignobject', 'audio', 'video', 'form', 'input', 'textarea', 'select',
  'animate', 'animatetransform', 'animatemotion', 'set', 'handler',
])

/** attributes that carry a url */
const URLISH = new Set([
  'href', 'xlink:href', 'src', 'srcset', 'action', 'formaction', 'poster',
  'xlink:show', 'xlink:actuate', 'ping',
])

/** an image we already hold the bytes of, or one over https */
const SAFE_IMAGE = /^(https:\/\/|data:image\/(png|jpeg|gif|webp|svg\+xml);)/i
/** a fragment id, or a link somewhere a browser will not run code */
const SAFE_LINK = /^(#|https?:\/\/|mailto:|tel:|\/)/i

function scrub(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const value = attr.value.trim()

    if (name.startsWith('on')) { el.removeAttribute(attr.name); continue }

    if (URLISH.has(name)) {
      const tag = el.tagName.toLowerCase()
      // <use> only ever wants a node in this same document. every browser
      // already refuses a cross-document one, but an exported drawing should
      // not be carrying the reference either
      const ok = tag === 'use'
        ? value.startsWith('#')
        : tag === 'img' || tag === 'image' || name === 'poster' || name === 'srcset'
          ? SAFE_IMAGE.test(value)
          : SAFE_LINK.test(value)
      if (!ok) el.removeAttribute(attr.name)
      continue
    }

    // url() in a style, a fill or a filter reaches out just as well as href
    if (/url\(\s*['"]?(?!#|data:image\/)/i.test(value)) el.removeAttribute(attr.name)
  }
}

function walk(root: Element): void {
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (el !== root && BANNED.has(el.tagName.toLowerCase())) {
      el.remove()
      continue
    }
    scrub(el)
  }
}

/**
 * An html fragment with nothing executable and nothing remote left in it.
 *
 * `parseHtml` already keeps only a whitelist of attributes, so an `onclick`
 * would never have survived into a node — but this runs first and on the whole
 * string, which means the fragment an agent or a model sees rejected is the
 * same one a person sees rejected, and neither depends on that whitelist
 * staying complete.
 */
export function fragment(html: string): string {
  const host = document.createElement('div')
  host.innerHTML = html
  walk(host)
  return host.innerHTML
}

/**
 * Pin a fragment's root where we want it, before it becomes nodes.
 *
 * A model positions its root wherever it likes, which is usually on top of
 * whatever is already on the artboard. Rewriting the style attribute here
 * rather than patching the node afterwards keeps the whole generation to a
 * single commit — so one `⌘Z` undoes it, rather than one `⌘Z` moving it back
 * to where the model had put it.
 */
export function place(
  html: string, at: { x: number; y: number; w?: number; name?: string },
): string {
  const host = document.createElement('div')
  host.innerHTML = html
  const root = host.firstElementChild
  if (!root) return html
  // read by parseHtml and then dropped, so the layer is named in the same
  // write that creates it and never reaches the export
  if (at.name) root.setAttribute('data-name', at.name)
  const style = root.getAttribute('style') ?? ''
  const kept = style
    .split(';')
    .filter(d => !/^\s*(position|left|top|right|bottom|transform)\s*:/i.test(d))
    .filter(d => d.trim())
  const pinned = [
    `position: absolute`,
    `left: ${Math.round(at.x)}px`,
    `top: ${Math.round(at.y)}px`,
    ...(at.w && !/(^|;)\s*width\s*:/i.test(style) ? [`width: ${Math.round(at.w)}px`] : []),
    ...kept,
  ]
  root.setAttribute('style', pinned.join('; '))
  return host.innerHTML
}

// ------------------------------------------------------------------------ svg

/** the outermost `<svg>…</svg>` in a string, prose and fences ignored */
export function firstSvg(markup: string): string | null {
  const at = markup.search(/<svg[\s>]/i)
  if (at < 0) return null
  const end = markup.toLowerCase().lastIndexOf('</svg>')
  if (end < at) return null
  return markup.slice(at, end + 6)
}

/**
 * Make a drawing fill the node it sits in.
 *
 * A model returns `width="24" height="24"`, which would draw a 24px icon in a
 * 400px box. Dropping those and leaning on the `viewBox` hands the scaling to
 * the browser — and it stays in the markup, so an exported document scales the
 * same way with no stylesheet of ours travelling alongside it.
 */
function size(el: SVGSVGElement): void {
  if (!el.getAttribute('viewBox')) {
    const w = Number(el.getAttribute('width')) || 24
    const h = Number(el.getAttribute('height')) || 24
    el.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  if (!el.getAttribute('preserveAspectRatio')) {
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  el.setAttribute('width', '100%')
  el.setAttribute('height', '100%')
  el.setAttribute('style', 'display:block')
}

/** the ratio the drawing was authored at, read off its viewBox */
export function ratioOf(markup: string): number | null {
  const box = /\bviewBox\s*=\s*["']?\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i
    .exec(markup)
  if (!box) return null
  const w = Number(box[3])
  const h = Number(box[4])
  return w > 0 && h > 0 ? w / h : null
}

/**
 * Markup ready for the document: one `<svg>` element, nothing executable left
 * in it, sized to whatever box it is dropped into.
 */
export function svg(markup: string): string {
  const found = firstSvg(markup.trim())
  if (!found) throw new Error('There was no <svg> element in what came back.')
  const host = document.createElement('div')
  host.innerHTML = found
  const el = host.querySelector('svg')
  if (!el) throw new Error('The generated SVG would not parse.')
  walk(el)
  if (!el.children.length) throw new Error('The generated SVG had nothing left in it once cleaned up.')
  size(el)
  return el.outerHTML
}
