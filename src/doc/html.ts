import { draft } from './ops'
import type { Doc, Node, NodeType, Style } from './types'
import { KEYFRAMES, usesKeyframes } from '../lib/effects'

/**
 * HTML in, HTML out.
 *
 * The canvas renders nodes as DOM, so serialising a node is close to a
 * formality: the tag, the attributes and the style object are already exactly
 * what the browser was given. That is what makes `get_html` honest — an agent
 * reads the page it is looking at rather than a description of it.
 */

const VOID = new Set(['img', 'br', 'hr', 'input', 'source'])

const kebab = (k: string) =>
  k.startsWith('--') ? k
    : k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`).replace(/^(webkit|moz|ms)-/, '-$1-')

export const camel = (k: string) =>
  k.startsWith('--') ? k
    : k.replace(/^-(webkit|moz|ms)-/, '$1-').replace(/-([a-z])/g, (_, c) => c.toUpperCase())

export const styleToCss = (style: Style) =>
  Object.entries(style).map(([k, v]) => `${kebab(k)}: ${v}`).join('; ')

export function cssToStyle(css: string): Style {
  const out: Style = {}
  for (const part of css.split(';')) {
    const at = part.indexOf(':')
    if (at < 0) continue
    const k = part.slice(0, at).trim()
    const v = part.slice(at + 1).trim()
    if (k && v) out[camel(k)] = v
  }
  return out
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// -------------------------------------------------------------------- export

export interface HtmlOptions {
  /** carry node ids through as data-easel, so a round trip keeps identity */
  ids?: boolean
  indent?: number
  /**
   * Summarise very long attribute values, for html an agent has to read.
   *
   * An embedded image is a data uri of a hundred kilobytes, and handing that
   * to a model spends its context on base64 it can do nothing with. Never set
   * this for html a person is going to paste somewhere.
   */
  brief?: boolean
}

const BRIEF = 180

const shorten = (v: string) =>
  v.length > BRIEF
    ? `${v.slice(0, 40)}... [${v.startsWith('data:') ? 'embedded image' : 'truncated'}, ${v.length} chars]`
    : v

/**
 * Svg markup gets a much longer leash than an attribute does, because unlike
 * base64 it is worth reading: the paths are the drawing, and an agent asked to
 * restyle one needs to see them. Only a genuinely large illustration is cut.
 */
const BRIEF_SVG = 1400

const shortenSvg = (v: string) =>
  v.length > BRIEF_SVG
    ? `${v.slice(0, 300)}\n<!-- ... ${v.length} chars of svg; export_code returns all of it -->`
    : v

export function toHtml(doc: Doc, id: string, opts: HtmlOptions = {}): string {
  const step = '  '

  const render = (nid: string, depth: number): string => {
    const n = doc.nodes[nid]
    if (!n) return ''
    const pad = step.repeat(depth)
    const attrs = [
      ...Object.entries(n.props)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => `${k}="${escapeAttr(opts.brief ? shorten(v) : v)}"`),
      ...(Object.keys(n.style).length ? [`style="${escapeAttr(styleToCss(n.style))}"`] : []),
      ...(opts.ids ? [`data-easel="${n.id}"`] : []),
    ].join(' ')
    const open = `<${n.tag}${attrs ? ' ' + attrs : ''}`

    if (VOID.has(n.tag)) return `${pad}${open} />`
    // markup, not text: escaping a generated vector would export a paragraph
    // of angle brackets instead of the drawing
    if (n.svg != null) {
      const markup = opts.brief ? shortenSvg(n.svg) : n.svg
      return `${pad}${open}>\n${pad}${step}${markup}\n${pad}</${n.tag}>`
    }
    if (n.children.length) {
      const inner = n.children.map(c => render(c, depth + 1)).filter(Boolean).join('\n')
      return `${pad}${open}>\n${inner}\n${pad}</${n.tag}>`
    }
    const text = n.text ? escapeText(n.text) : ''
    return `${pad}${open}>${text}</${n.tag}>`
  }

  return render(id, opts.indent ?? 0)
}

/** a whole artboard as a standalone page, which is what publish writes out */
export function toPage(doc: Doc, id: string, title = 'Easel'): string {
  const board = doc.nodes[id]
  const body = board
    ? board.children.map(c => toHtml(doc, c, { indent: 3 })).join('\n')
    : ''
  const style = board ? styleToCss({ ...board.style, margin: '0 auto' }) : ''
  // an animated effect is not really exported if its keyframes stay behind
  const frames = usesKeyframes(body) ? `\n${KEYFRAMES}` : ''
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeText(title)}</title>
    <style>
      body { margin: 0; background: #f2f2f2; }${frames}
    </style>
  </head>
  <body>
    <div style="${escapeAttr(style)}">
${body}
    </div>
  </body>
</html>
`
}

const JSX_ATTR: Record<string, string> = { class: 'className', for: 'htmlFor' }

export function toJsx(doc: Doc, id: string, mode: 'inline' | 'tailwind' = 'inline'): string {
  const step = '  '

  const render = (nid: string, depth: number): string => {
    const n = doc.nodes[nid]
    if (!n) return ''
    const pad = step.repeat(depth)
    const attrs = [
      ...Object.entries(n.props)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => `${JSX_ATTR[k] ?? k}="${escapeAttr(v)}"`),
      ...(Object.keys(n.style).length
        ? [mode === 'tailwind'
          ? `className="${escapeAttr(tailwindish(n.style))}"`
          : `style={{ ${Object.entries(n.style)
            .map(([k, v]) => `${/^[a-zA-Z][\w]*$/.test(k) ? k : `'${k}'`}: '${v.replace(/'/g, "\\'")}'`)
            .join(', ')} }}`]
        : []),
    ].join(' ')
    const open = `<${n.tag}${attrs ? ' ' + attrs : ''}`

    if (VOID.has(n.tag)) return `${pad}${open} />`
    // react will not take svg markup as a child, and hand-converting it to jsx
    // would mean renaming every namespaced attribute and hoping. the markup
    // travels as a string, which is what it is
    if (n.svg != null) {
      return `${pad}${open} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(n.svg)} }} />`
    }
    if (n.children.length) {
      const inner = n.children.map(c => render(c, depth + 1)).filter(Boolean).join('\n')
      return `${pad}${open}>\n${inner}\n${pad}</${n.tag}>`
    }
    return `${pad}${open}>${n.text ?? ''}</${n.tag}>`
  }

  return render(id, 0)
}

/**
 * Arbitrary values, not a guess at the nearest scale step. A design made of
 * measured pixels does not round to `p-4` without changing, and silently
 * changing it would be the worst kind of export.
 */
function tailwindish(style: Style): string {
  const map: Record<string, (v: string) => string> = {
    left: v => `left-[${v}]`,
    top: v => `top-[${v}]`,
    width: v => `w-[${v}]`,
    height: v => `h-[${v}]`,
    position: v => (v === 'absolute' ? 'absolute' : v === 'relative' ? 'relative' : ''),
    background: v => `bg-[${v}]`,
    backgroundColor: v => `bg-[${v}]`,
    color: v => `text-[${v}]`,
    borderRadius: v => `rounded-[${v}]`,
    fontSize: v => `text-[${v}]`,
    fontWeight: v => `font-[${v}]`,
    lineHeight: v => `leading-[${v}]`,
    letterSpacing: v => `tracking-[${v}]`,
    padding: v => `p-[${v}]`,
    display: v => (v === 'flex' ? 'flex' : v === 'block' ? 'block' : v === 'inline-flex' ? 'inline-flex' : ''),
    alignItems: v => (v === 'center' ? 'items-center' : ''),
    justifyContent: v => (v === 'center' ? 'justify-center' : ''),
    gap: v => `gap-[${v}]`,
    opacity: v => `opacity-[${v}]`,
    objectFit: v => (v === 'cover' ? 'object-cover' : ''),
    textDecoration: v => (v === 'underline' ? 'underline' : ''),
  }
  const out: string[] = []
  const rest: string[] = []
  for (const [k, v] of Object.entries(style)) {
    const f = map[k]
    if (f) {
      const cls = f(v)
      if (cls) out.push(cls)
    } else {
      rest.push(`${kebab(k)}:${v.replace(/\s+/g, '_')}`)
    }
  }
  return [...out, ...rest.map(r => `[${r}]`)].join(' ')
}

// -------------------------------------------------------------------- import

const TEXTISH = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'small',
  'label', 'li', 'blockquote', 'code', 'pre', 'figcaption',
])

function typeOf(tag: string): NodeType {
  if (tag === 'img') return 'image'
  if (tag === 'button') return 'button'
  if (tag === 'a') return 'link'
  if (TEXTISH.has(tag)) return 'text'
  return 'frame'
}

const KEEP_ATTRS = new Set([
  'src', 'alt', 'href', 'target', 'rel', 'placeholder', 'type', 'value',
  'title', 'aria-label', 'loading',
])

/**
 * Parse an html fragment into nodes. This is what an agent's `write_html`
 * lands through, so it is deliberately forgiving: unknown tags become frames,
 * inline styles are kept as written, and anything without a style attribute
 * simply inherits from its parent the way html does.
 *
 * Nothing is inserted here — the caller decides where the roots go, so the
 * whole write can be one undo step.
 */
export function parseHtml(doc: Doc, html: string): { nodes: Node[]; roots: string[] } {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const made: Node[] = []
  // a scratch document so freshId keeps counting past ids we have just minted
  let scratch: Doc = { ...doc, nodes: { ...doc.nodes } }

  const walk = (el: Element, parent: string | null): string | null => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') return null

    /**
     * An svg is taken whole rather than walked into.
     *
     * Its children are namespaced and their attributes are case sensitive, so
     * `<path fill-rule>` would come back out of our camelCase style object as
     * something the browser ignores. Held as markup it stays exactly as
     * authored — which also means a model told to use inline svg for icons,
     * as the design prompt tells it to, gets icons rather than a pile of
     * empty frames.
     */
    if (tag === 'svg') {
      const node = draft(scratch, {
        type: 'svg', tag: 'div', bare: true,
        svg: el.outerHTML,
        style: cssToStyle(el.getAttribute('style') ?? ''),
        name: el.getAttribute('aria-label') ?? 'Icon',
      })
      node.parent = parent
      scratch = { ...scratch, nodes: { ...scratch.nodes, [node.id]: node } }
      made.push(node)
      return node.id
    }

    const type = typeOf(tag)

    const props: Record<string, string> = {}
    for (const a of Array.from(el.attributes)) {
      if (KEEP_ATTRS.has(a.name)) props[a.name] = a.value
    }
    const style = cssToStyle(el.getAttribute('style') ?? '')

    const kids = Array.from(el.children)
    const own = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

    const node = draft(scratch, {
      type, tag, props, style, bare: true,
      text: own || undefined,
      // a readable name, because the layers panel is how a person finds what
      // an agent just wrote. `data-name` lets a caller label the root of a
      // fragment as part of the same write, rather than renaming it afterwards
      // and costing the person a second undo step for one intent
      name: el.getAttribute('data-name') ?? (own ? own.slice(0, 28) : tag),
    })
    node.parent = parent
    scratch = { ...scratch, nodes: { ...scratch.nodes, [node.id]: node } }
    made.push(node)
    node.children = kids
      .map(k => walk(k, node.id))
      .filter((v): v is string => v != null)
    return node.id
  }

  const roots = Array.from(parsed.body.children)
    .map(el => walk(el, null))
    .filter((v): v is string => v != null)

  return { nodes: made, roots }
}
