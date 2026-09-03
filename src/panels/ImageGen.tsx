import { useState } from 'react'
import { Section } from './Inspector'
import { useEditor } from '../doc/store'
import { oneImage } from '../lib/generate'
import type { Node } from '../doc/types'

/**
 * Generate the picture that goes in this image node.
 *
 * The same backend call the prompt bar and the agent's `generate_image` make,
 * so the person is not on a lesser path than the model is. What comes back is
 * base64 rather than a link, which is the thing our own backend bought us: the
 * bytes live in the document, so an export renders anywhere with nothing of
 * ours still standing behind it.
 */
export default function ImageGen({ node }: { node: Node }) {
  const [prompt, setPrompt] = useState(node.props.alt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [by, setBy] = useState<string | null>(null)

  const box = useEditor(s => s.boxes[node.id])

  const run = async (seed?: number) => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const w = box ? Math.round(box.w) : 512
      const h = box ? Math.round(box.h) : 512
      const made = await oneImage({ prompt, ratio: nearestRatio(w, h), seed })
      useEditor.getState().setProps(node.id, { src: made.src, alt: prompt })
      setBy(made.note ? `${made.label} — ${made.note}` : made.label)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const src = node.props.src ?? ''
  const embedded = src.startsWith('data:')

  return (
    <Section label="Image">
      <textarea
        rows={2}
        value={prompt}
        placeholder="a ceramic mug on a pale background"
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run() }
        }}
        className="inset-control w-full resize-none px-2 py-1.5 outline-none
                   focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          disabled={busy || !prompt.trim()}
          onClick={() => void run()}
          className="inset-control h-[28px] flex-1 transition-colors
                     hover:bg-black/[0.02] disabled:opacity-40"
        >
          {busy ? 'Generating…' : node.props.src ? 'Regenerate' : 'Generate'}
        </button>
        {node.props.src && (
          <button
            disabled={busy}
            onClick={() => void run(Math.floor(Math.random() * 1e6))}
            title="same prompt, a different seed"
            className="inset-control h-[28px] px-2.5 transition-colors
                       hover:bg-black/[0.02] disabled:opacity-40"
          >
            Vary
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        {error
          ? <span className="text-[#dc4f70]">{error}</span>
          : by
            ? by
            : embedded
              ? 'Embedded in the document, so the export carries the picture itself.'
              : 'Generated at the ratio of this node. ⌘↵ to run.'}
      </p>
    </Section>
  )
}

/**
 * The node's own proportions, snapped to a ratio the model will accept.
 *
 * Gemini takes a ratio rather than a pixel size, so a node the person has
 * dragged to 517×298 asks for 16:9 and then gets object-fit to cover the
 * difference — which is what the image node already did with every other
 * picture.
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
