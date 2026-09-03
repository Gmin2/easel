import { GRADIENTS, effectOn, effectPatch } from '../lib/effects'
import type { Node, Style } from '../doc/types'

/**
 * Named CSS gradients, as a proper picker rather than four mystery boxes.
 *
 * Each swatch is the preview Style — colour plus image, not a shorthand dumped
 * onto backgroundImage — so the thumb is the gradient, just smaller. Clicks
 * go through effectPatch, the same write apply_effect uses.
 */
export default function Gradients({
  node,
  patch,
}: {
  node: Node
  patch: (s: Style) => void
}) {
  const active = effectOn(node.style)
  const current = GRADIENTS.find(g => g.name === active)

  return (
    <section className="border-b border-hair px-3 py-3">
      <p className="mb-2 font-medium">Gradients</p>
      <div className="grid grid-cols-2 gap-1.5">
        {GRADIENTS.map(g => (
          <button
            key={g.name}
            title={g.label}
            onClick={() => patch(effectPatch(active === g.name ? null : g.name))}
            className={`group flex flex-col overflow-hidden rounded-[7px] border text-left transition-all
                        ${active === g.name
                          ? 'border-[#2d52f0] ring-2 ring-[#2d52f0]/25'
                          : 'border-black/10 hover:border-black/25'}`}
          >
            <span className="h-[42px] w-full" style={g.preview} />
            <span className="px-1.5 py-[3px] text-[10px] leading-none text-dim group-hover:text-ink">
              {g.label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        {current
          ? `${current.label} — click again to clear.`
          : 'Named CSS gradients. They export with the design.'}
      </p>
    </section>
  )
}
