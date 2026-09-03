import ColorRow from './ColorRow'
import ImageGen from './ImageGen'
import NumField from './NumField'
import { num, readColour, withNum, writeColour } from '../lib/css'
import { EFFECTS, effectOn, effectPatch } from '../lib/effects'
import { useEditor } from '../doc/store'
import type { Node, Style } from '../doc/types'

/**
 * The properties of the selected node.
 *
 * Every control writes a css property, and nothing else. There is no editor
 * model sitting between the field and the style, which is why an agent's
 * `update_styles` and a human turning this dial are the same edit.
 */

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hair px-3 py-3">
      <p className="mb-2 font-medium">{label}</p>
      {children}
    </section>
  )
}

/**
 * The effects picker.
 *
 * Every swatch is the css it will apply, drawn by the same browser that will
 * draw the node — so the preview is not an approximation of the effect, it is
 * the effect at swatch size.
 */
function Effects({ node, patch }: { node: Node; patch: (s: Style) => void }) {
  const active = effectOn(node.style)
  const groups = [...new Set(EFFECTS.map(e => e.group))]

  return (
    <Section label="Effect">
      {groups.map(group => (
        <div key={group} className="mb-2 last:mb-0">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-faint">{group}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {EFFECTS.filter(e => e.group === group).map(e => (
              <button
                key={e.name}
                title={e.label}
                onClick={() => patch(effectPatch(active === e.name ? null : e.name))}
                className={`h-[34px] overflow-hidden rounded-[6px] border transition-all
                            ${active === e.name
                              ? 'border-[#2d52f0] ring-2 ring-[#2d52f0]/25'
                              : 'border-black/10 hover:border-black/25'}`}
                style={{ backgroundImage: e.preview, backgroundSize: 'cover' }}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        {active
          ? 'Click again to clear. This is plain CSS, so it copies out with the design.'
          : 'Gradients, textures and glass, all as CSS — no canvas, so they export.'}
      </p>
    </Section>
  )
}

/**
 * A generated vector, which is real markup in the document.
 *
 * Which is why there is a colour picker here and not an opacity slider over a
 * bitmap: the drawing paints with `currentColor`, so `color` on this wrapper
 * recolours every path in it — the same one property an agent patches with
 * `set_style`. Paper renders its vectors into a canvas and can only hand back
 * pixels; this exports as the paths it is.
 */
function VectorInfo({ node, patch }: { node: Node; patch: (s: Style) => void }) {
  const ink = readColour(node.style.color, '#111111')
  const paths = (node.svg?.match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b/g) ?? []).length

  return (
    <Section label="Vector">
      <ColorRow hex={ink.hex} alpha={ink.alpha}
                onChange={(hex, alpha) => patch({ color: writeColour(hex, alpha) })} />
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Readout label="shapes" value={String(paths)} />
        <Readout label="markup" value={`${node.svg?.length ?? 0} ch`} />
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
        Inline SVG in the document. It exports as markup, and this colour reaches
        every path drawn with currentColor.
      </p>
    </Section>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="inset-control flex h-[26px] items-center gap-1.5 px-2 opacity-70">
      <span className="shrink-0 text-faint">{label}</span>
      <span className="ml-auto truncate tabular-nums">{value}</span>
    </div>
  )
}

const TAGS: Record<string, string[]> = {
  text: ['p', 'h1', 'h2', 'h3', 'h4', 'span', 'label', 'li', 'blockquote'],
  frame: ['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'ul'],
  button: ['button', 'a'],
  link: ['a', 'span'],
  image: ['img'],
  svg: ['div', 'span', 'figure'],
  artboard: ['div', 'body', 'main'],
}

const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900']

const select = `inset-control h-[26px] w-full appearance-none px-2 outline-none
  focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25`

export default function Inspector({ node }: { node: Node }) {
  const box = useEditor(s => s.boxes[node.id])
  const parent = useEditor(s => (node.parent ? s.boxes[node.parent] : undefined))
  const id = node.id

  const patch = (style: Style) => useEditor.getState().patchStyle([id], style)
  const typeish = node.type === 'text' || node.type === 'button' || node.type === 'link'

  /** the node's offset inside its parent, whichever way it is positioned */
  const at = {
    x: node.style.left != null ? num(node.style.left) : (box && parent ? box.x - parent.x : 0),
    y: node.style.top != null ? num(node.style.top) : (box && parent ? box.y - parent.y : 0),
  }
  const w = node.style.width != null ? num(node.style.width) : box?.w ?? 0
  const h = node.style.height != null ? num(node.style.height) : box?.h ?? 0

  type Side = 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom'

  /** snap the node to an edge or the middle of whatever contains it */
  const place = (side: Side) => {
    if (!parent || !box) return
    switch (side) {
      case 'left': return patch({ position: 'absolute', left: '0px' })
      case 'cx': return patch({ position: 'absolute', left: `${Math.round((parent.w - box.w) / 2)}px` })
      case 'right': return patch({ position: 'absolute', left: `${Math.round(parent.w - box.w)}px` })
      case 'top': return patch({ position: 'absolute', top: '0px' })
      case 'cy': return patch({ position: 'absolute', top: `${Math.round((parent.h - box.h) / 2)}px` })
      case 'bottom': return patch({ position: 'absolute', top: `${Math.round(parent.h - box.h)}px` })
    }
  }

  const fill = readColour(node.style.background ?? node.style.backgroundColor, '#FFFFFF')
  const ink = readColour(node.style.color, '#111111')

  return (
    <>
      <Section label="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="X" value={Math.round(at.x)}
                    onChange={v => patch({ position: 'absolute', left: `${Math.round(v)}px` })} />
          <NumField label="Y" value={Math.round(at.y)}
                    onChange={v => patch({ position: 'absolute', top: `${Math.round(v)}px` })} />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <NumField label="W" value={Math.round(w)} min={1} auto={node.style.width == null}
                    onChange={v => patch({ width: withNum(node.style.width, v) })}
                    onAuto={() => patch({ width: '' })} />
          <NumField label="H" value={Math.round(h)} min={1} auto={node.style.height == null}
                    onChange={v => patch({ height: withNum(node.style.height, v) })}
                    onAuto={() => patch({ height: '' })} />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {([
            ['left', 'align left'], ['cx', 'centre across'], ['right', 'align right'],
            ['top', 'align top'], ['cy', 'centre down'], ['bottom', 'align bottom'],
          ] as const).map(([side, title]) => (
            <button
              key={side}
              title={title}
              disabled={!parent || !box}
              onClick={() => place(side)}
              className="inset-control grid h-[26px] flex-1 place-items-center text-dim
                         transition-colors hover:text-ink disabled:opacity-40"
            >
              <Bar side={side} />
            </button>
          ))}
        </div>
      </Section>

      <Section label="Appearance">
        <ColorRow
          hex={fill.hex} alpha={fill.alpha}
          onChange={(hex, alpha) => patch({
            background: writeColour(hex, alpha),
            ...(node.style.backgroundColor != null && { backgroundColor: '' }),
          })}
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <NumField label="R" value={num(node.style.borderRadius)} min={0}
                    onChange={v => patch({ borderRadius: withNum(node.style.borderRadius, v) })} />
          <NumField label="O" suffix=" %" value={Math.round(num(node.style.opacity, 1) * 100)}
                    min={0} max={100}
                    onChange={v => patch({ opacity: String(Math.round(v) / 100) })} />
        </div>
        {node.style.boxShadow ? (
          <div className="mt-1.5">
            <input
              value={node.style.boxShadow}
              onChange={e => patch({ boxShadow: e.target.value })}
              className="inset-control h-[26px] w-full px-2 font-mono text-[11px] outline-none
                         focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
            />
          </div>
        ) : (
          <button
            className="mt-1.5 flex h-[26px] w-full items-center gap-1.5 rounded-[6px] px-2
                       text-dim transition-colors hover:bg-black/[0.04] hover:text-ink"
            onClick={() => patch({ boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)' })}
          >
            Shadow<span className="ml-auto">+</span>
          </button>
        )}
      </Section>

      {node.type === 'image' && <ImageGen node={node} />}

      {node.type === 'svg' && <VectorInfo node={node} patch={patch} />}

      <Effects node={node} patch={patch} />

      {typeish && (
        <Section label="Type">
          <textarea
            rows={2}
            value={node.text ?? ''}
            onChange={e => useEditor.getState().setText(id, e.target.value, true)}
            onFocus={() => useEditor.getState().snapshot()}
            className="inset-control w-full resize-none px-2 py-1.5 outline-none
                       focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
          />
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <NumField label="S" value={num(node.style.fontSize, 16)} min={4}
                      onChange={v => patch({ fontSize: withNum(node.style.fontSize, v) })} />
            <select
              className={select}
              value={node.style.fontWeight ?? '400'}
              onChange={e => patch({ fontWeight: e.target.value })}
            >
              {WEIGHTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <NumField label="LH" precision={2} step={0.05}
                      value={num(node.style.lineHeight, 1.2)}
                      onChange={v => patch({ lineHeight: String(Math.round(v * 100) / 100) })} />
            <NumField label="LS" precision={3} step={0.005}
                      value={num(node.style.letterSpacing)}
                      onChange={v => patch({ letterSpacing: `${Math.round(v * 1000) / 1000}em` })} />
          </div>
          <div className="mt-1.5">
            <ColorRow hex={ink.hex} alpha={ink.alpha}
                      onChange={(hex, alpha) => patch({ color: writeColour(hex, alpha) })} />
          </div>
          <div className="mt-1.5 flex rounded-[7px] bg-black/[0.05] p-[2px]">
            {(['left', 'center', 'right'] as const).map(a => (
              <button
                key={a}
                onClick={() => patch({ textAlign: a })}
                className={`h-[22px] flex-1 rounded-[5px] transition-colors
                            ${(node.style.textAlign ?? 'left') === a
                              ? 'bg-surface font-medium shadow-[0_1px_2px_rgba(0,0,0,0.07)]'
                              : 'text-dim hover:text-ink'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section label="Element">
        <div className="grid grid-cols-2 gap-1.5">
          <select
            className={select}
            value={node.tag}
            onChange={e => useEditor.getState().setTag(id, e.target.value)}
          >
            {(TAGS[node.type] ?? [node.tag]).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Readout label="id" value={node.id} />
        </div>
        <input
          value={node.name}
          onChange={e => useEditor.getState().rename(id, e.target.value)}
          className="inset-control mt-1.5 h-[26px] w-full px-2 outline-none
                     focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
        />
        {(node.type === 'link' || node.tag === 'a') && (
          <input
            value={node.props.href ?? ''}
            placeholder="https://"
            onChange={e => useEditor.getState().setProps(id, { href: e.target.value })}
            className="inset-control mt-1.5 h-[26px] w-full px-2 font-mono text-[11px] outline-none
                       focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
          />
        )}
        {node.type === 'image' && (
          <>
            <input
              value={node.props.src ?? ''}
              placeholder="image url"
              onChange={e => useEditor.getState().setProps(id, { src: e.target.value })}
              className="inset-control mt-1.5 h-[26px] w-full px-2 font-mono text-[11px] outline-none
                         focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
            />
            <input
              value={node.props.alt ?? ''}
              placeholder="alt text"
              onChange={e => useEditor.getState().setProps(id, { alt: e.target.value })}
              className="inset-control mt-1.5 h-[26px] w-full px-2 outline-none
                         focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
            />
          </>
        )}
      </Section>

      {box && (
        <Section label="On screen">
          <div className="grid grid-cols-2 gap-1.5">
            <Readout label="W" value={String(Math.round(box.w))} />
            <Readout label="H" value={String(Math.round(box.h))} />
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            what the browser laid out, which is what publish will ship
          </p>
        </Section>
      )}
    </>
  )
}

/** the little alignment glyph: a bar and the edge it goes to */
function Bar({ side }: { side: 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom' }) {
  const vertical = side === 'left' || side === 'cx' || side === 'right'
  const at = side === 'left' || side === 'top' ? 2
    : side === 'right' || side === 'bottom' ? 12 : 7
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor">
      {vertical
        ? <>
          <line x1={at} y1="2" x2={at} y2="13" strokeWidth="1.5" />
          <rect x={side === 'right' ? 5 : at} y="5" width="6" height="5" rx="1" />
        </>
        : <>
          <line x1="2" y1={at} x2="13" y2={at} strokeWidth="1.5" />
          <rect x="5" y={side === 'bottom' ? 5 : at} width="5" height="6" rx="1" />
        </>}
    </svg>
  )
}
