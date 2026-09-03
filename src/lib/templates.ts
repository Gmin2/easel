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
  const r = await fetch(`/templates/${id}.html`)
  if (!r.ok) throw new Error(`template ${id}: ${r.status}`)
  return r.text()
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
  s = s.replace(/<svg[\s\S]*?<\/svg>/g, '<svg style="width:20px;height:20px"></svg>')
  return s.length > cap ? s.slice(0, cap) + '\n<!-- truncated -->' : s
}
