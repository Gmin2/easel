// real sites, flattened to the inline-styled html this document is made of.
// served from /templates so the editor bundle stays small; fetched on demand.

import type { Style } from '../doc/types'

export interface Template {
  id: string
  title: string
  description: string
  keywords: string[]
  width: number
  height: number
  bytes: number
  /** the template ships its own @font-face rules at /templates/<id>/fonts.css */
  fonts?: number
  /** fidelity against the original, 1 to 5, from a review of the flattened copy */
  review?: number | null
}

let manifest: Promise<Template[]> | null = null

export function list(): Promise<Template[]> {
  manifest ??= fetch('/templates/manifest.json').then(r => {
    if (!r.ok) throw new Error(`templates: ${r.status}`)
    return r.json() as Promise<Template[]>
  })
  return manifest
}

export async function html(id: string): Promise<string> {
  const r = await fetch(`/templates/${id}/index.html`)
  if (!r.ok) throw new Error(`template ${id}: ${r.status}`)
  void fonts(id)
  return r.text()
}

const loaded = new Set<string>()

/**
 * A flattened site keeps its typefaces: the flattener copied the font files
 * and wrote the @font-face rules next to the html. One stylesheet per template,
 * added once, so the nodes that reference "Matter" or "BureauSerif" render in
 * them instead of falling back to the system stack.
 */
export function fonts(id: string): void {
  if (loaded.has(id)) return
  loaded.add(id)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `/templates/${id}/fonts.css`
  link.dataset.template = id
  document.head.appendChild(link)
}

/**
 * A flattened page arrives inside one or more wrapper divs: the flattener's
 * own absolute root, then whatever the site had around `<body>`. Landed as is,
 * the artboard holds a single node and every click on the canvas lands on it,
 * so the page is not really editable until you step inside two or three
 * times. This peels those layers off, so the header, main and footer sit
 * directly on the board, and hands back what the wrappers were painting
 * (background, text colour, typeface) for the caller to put on the board
 * itself.
 *
 * Only a wrapper with nothing of its own to show is peeled. One that lays its
 * children out (flex centering, padding) or has a look (border, shadow, an
 * image) stays, since hoisting its children would move them; it is named
 * "Page" so the layers panel at least says what it is.
 */
export function unwrap(markup: string, width?: number): { html: string; board: Style } {
  const host = document.createElement('div')
  host.innerHTML = markup
  const board: Style = {}
  for (let depth = 0; depth < 4; depth++) {
    const root = host.children.length === 1 ? host.children[0] as HTMLElement : null
    if (!root || !passive(root, width)) break
    for (const [from, to] of INHERIT) {
      const v = root.style.getPropertyValue(from)
      if (v) board[to] = v
    }
    root.replaceWith(...Array.from(root.childNodes))
  }
  const left = host.children.length === 1 ? host.children[0] : null
  if (left && left.tagName === 'DIV' && !left.getAttribute('data-name')) left.setAttribute('data-name', 'Page')
  return { html: host.innerHTML, board }
}

/** wrapper css to artboard css. the board's fill is `background`, which is
 *  what its panel reads */
const INHERIT: [string, string][] = [
  ['background-color', 'background'], ['color', 'color'], ['font-family', 'fontFamily'],
  ['line-height', 'lineHeight'], ['letter-spacing', 'letterSpacing'],
]

/** properties that do not give a box a look or move what is inside it */
const PASSIVE = new Set([
  'position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'min-height',
  'display', 'flex-direction', 'overflow', 'overflow-x', 'overflow-y', 'box-sizing',
  ...INHERIT.map(([k]) => k), '-webkit-text-fill-color', 'text-decoration-color',
])

const ZERO = /^(0(px)?|auto)?$/

function passive(el: HTMLElement, width?: number): boolean {
  if (!['DIV', 'MAIN', 'SECTION', 'ARTICLE'].includes(el.tagName)) return false
  if (Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? '').trim())) return false
  if (Array.from(el.attributes).some(a => a.name !== 'style' && a.name !== 'data-name')) return false
  const st = el.style
  for (let i = 0; i < st.length; i++) if (!PASSIVE.has(st[i])) return false
  for (const k of ['left', 'top', 'right', 'bottom']) if (!ZERO.test(st.getPropertyValue(k))) return false
  const w = st.width
  if (w && w !== '100%' && !(width && w === `${width}px`)) return false
  const display = st.display
  if (display && display !== 'block' && !(display === 'flex' && st.flexDirection === 'column')) return false
  return true
}

/** best template for a prompt, or null when nothing scores */
export async function match(prompt: string): Promise<Template | null> {
  const words = prompt.toLowerCase().match(/[a-z]+/g) ?? []
  if (!words.length) return null
  let best: Template | null = null
  let top = 0
  for (const t of await list()) {
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

/** the template with images swapped for short placeholders, so it fits in a prompt */
export function excerpt(markup: string, cap = 24000): string {
  let s = markup.replace(/url\(data:[^)]*\)/g, 'url(IMAGE)').replace(/src="data:[^"]*"/g, 'src="IMAGE"')
  s = s.replace(/url\(\/templates\/[^)]*\)/g, 'url(IMAGE)').replace(/src="\/templates\/[^"]*"/g, 'src="IMAGE"')
  s = s.replace(/<svg[\s\S]*?<\/svg>/g, '<svg style="width:20px;height:20px"></svg>')
  return s.length > cap ? s.slice(0, cap) + '\n<!-- truncated -->' : s
}
