import { useState } from 'react'
import { Section } from './Inspector'
import { useEditor } from '../doc/store'
import { generate } from '../lib/imagegen'
import type { Node } from '../doc/types'

/**
 * Generate the picture that goes in this image node.
 *
 * The same call the agent's `generate_image` makes, so the person is not on a
 * lesser path than the model is. Seeds are shown because a retry with the same
 * prompt and seed gives the same picture — which makes "try again" mean
 * something rather than being a slot machine.
 */
export default function ImageGen({ node }: { node: Node }) {
  const [prompt, setPrompt] = useState(node.props.alt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const box = useEditor(s => s.boxes[node.id])

  const run = async (seed?: number) => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const made = await generate(prompt, {
        w: box ? Math.round(box.w) : 512,
        h: box ? Math.round(box.h) : 512,
        seed,
      })
      useEditor.getState().setProps(node.id, { src: made.src, alt: prompt })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const src = node.props.src ?? ''
  const embedded = src.startsWith('data:')
  const seed = embedded ? null
    : src.startsWith('http') ? new URL(src).searchParams.get('seed') : null

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
          : embedded
            ? 'Embedded in the document, so the export carries the picture itself.'
            : seed
              ? `seed ${seed} — the same prompt and seed gives the same image`
              : 'Generated at the size of this node. ⌘↵ to run.'}
      </p>
    </Section>
  )
}
