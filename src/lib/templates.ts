// real sites, flattened to the inline-styled html this document is made of.
// served from /templates so the editor bundle stays small; fetched on demand.

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
