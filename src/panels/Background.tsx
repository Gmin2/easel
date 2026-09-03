import { useEffect, useState } from 'react'
import ColorRow from './ColorRow'
import { useEditor } from '../doc/store'
import { effectOn, effectPatch, imageBgPatch } from '../lib/effects'
import { oneImage } from '../lib/generate'
import { TEXTURES, imageUrl, textureOn } from '../lib/textures'
import { readColour, writeColour } from '../lib/css'
import type { Node, Style } from '../doc/types'

/**
 * Background of an artboard or a frame: a named texture, or a picture.
 *
 * Both writes go through `patchStyle`, so they undo and they attribute like
 * every other inspector edit. The textures are the same CSS the agent applies
 * with `apply_effect`; the picture is `background-image: url(...)` at cover,
 * which is what `toHtml` already serialises.
 */
export default function Background({
  node,
  patch,
  showColor,
}: {
  node: Node
  patch: (s: Style) => void
  /** artboards keep their colour row here; frames already have Appearance */
  showColor?: boolean
}) {
  const active = textureOn(node.style)
  const current = effectOn(node.style) ? null : imageUrl(node.style)
  const [url, setUrl] = useState(fieldValue(current))
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useEditor(s => s.boxes[node.id])

  // the document is the source of truth; a generate or an undo rewrites it
  useEffect(() => {
    setUrl(fieldValue(current))
  }, [current, node.id])

  const applyUrl = (raw: string) => {
    const next = raw.trim()
    if (!next) {
      if (current) patch(imageBgPatch(null))
      return
    }
    if (!/^(https?:|data:)/i.test(next)) {
      setError('Need an http(s) URL or a data URI.')
      return
    }
    setError(null)
    patch(imageBgPatch(next))
  }

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const w = box ? Math.round(box.w) : 1280
      const h = box ? Math.round(box.h) : 832
      const made = await oneImage({ prompt, ratio: nearestRatio(w, h) })
      patch(imageBgPatch(made.src))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const fill = readColour(node.style.background ?? node.style.backgroundColor, '#FFFFFF')
  const layered = active != null || current != null

  return (
    <section className="border-b border-hair px-3 py-3">
      <p className="mb-2 font-medium">Background</p>
      {showColor && (
        <div className="mb-2">
          <ColorRow
            hex={fill.hex} alpha={fill.alpha}
            onChange={(hex, alpha) => {
              // a shorthand `background` would wipe the texture's image, so
              // once a fill is layered we only touch the colour
              if (layered) patch({ backgroundColor: writeColour(hex, alpha) })
              else patch({ background: writeColour(hex, alpha) })
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {TEXTURES.map(t => (
          <button
            key={t.name}
            title={t.label}
            onClick={() => patch(effectPatch(active === t.name ? null : t.name))}
            className={`h-[34px] overflow-hidden rounded-[6px] border transition-all
                        ${active === t.name
                          ? 'border-[#2d52f0] ring-2 ring-[#2d52f0]/25'
                          : 'border-black/10 hover:border-black/25'}`}
            style={t.preview}
          />
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        <input
          value={url}
          placeholder={current?.startsWith('data:') ? 'embedded image' : 'https://'}
          onChange={e => setUrl(e.target.value)}
          onBlur={() => applyUrl(url)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); applyUrl(url) }
          }}
          className="inset-control h-[26px] min-w-0 flex-1 px-2 font-mono text-[11px] outline-none
                     focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
        />
        {(active || current) && (
          <button
            title="clear background fill"
            onClick={() => { setUrl(''); setError(null); patch(imageBgPatch(null)) }}
            className="inset-control grid h-[26px] w-[26px] shrink-0 place-items-center
                       text-dim transition-colors hover:text-ink"
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <input
          value={prompt}
          placeholder="generate a background…"
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate() }
          }}
          className="inset-control h-[26px] min-w-0 flex-1 px-2 outline-none
                     focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
        />
        <button
          disabled={busy || !prompt.trim()}
          onClick={() => void generate()}
          className="inset-control h-[26px] shrink-0 px-2 transition-colors
                     hover:bg-black/[0.02] disabled:opacity-40"
        >
          {busy ? '…' : 'Generate'}
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        {error
          ? <span className="text-[#dc4f70]">{error}</span>
          : active
            ? `${TEXTURES.find(t => t.name === active)?.label ?? active} — click again to clear.`
            : current
              ? 'Image at cover. Clear or pick a texture to replace it.'
              : 'Textures are CSS, so they export. A generated picture embeds in the file.'}
      </p>
    </section>
  )
}

/** hide a data uri in the field — it is tens of kilobytes and not editable */
const fieldValue = (src: string | null) =>
  !src || src.startsWith('data:') ? '' : src

/**
 * Snap the node's proportions to a ratio the image models accept.
 *
 * Same table as the image-node generator: Gemini takes a ratio, then cover
 * absorbs the leftover pixels.
 */
function nearestRatio(w: number, h: number): string {
  const want = w / Math.max(1, h)
  const options: [string, number][] = [
    ['1:1', 1], ['3:2', 1.5], ['2:3', 2 / 3], ['16:9', 16 / 9],
    ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:4', 0.75],
  ]
  return options.reduce((best, o) =>
    Math.abs(o[1] - want) < Math.abs(best[1] - want) ? o : best)[0]
}
