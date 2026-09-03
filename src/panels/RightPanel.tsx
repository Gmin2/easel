import { useState } from 'react'
import Background from './Background'
import Inspector, { Section } from './Inspector'
import NumField from './NumField'
import Tokens from './Tokens'
import { PanelIcon } from '../icons'
import { palette } from '../lib/palette'
import { copyPng } from '../lib/png'
import { toHtml, toJsx } from '../doc/html'
import { useEditor } from '../doc/store'
import type { Node, Style } from '../doc/types'

export default function RightPanel() {
  const doc = useEditor(s => s.doc)
  const sel = useEditor(s => s.sel)
  const zoom = useEditor(s => s.cam.zoom)

  const node = sel[0] ? doc.nodes[sel[0]] ?? null : null

  return (
    <aside className="flex h-full w-inspector shrink-0 flex-col border-l border-hair bg-panel">
      <header className="flex h-[41px] shrink-0 items-center gap-2 border-b border-hair px-3">
        <span className="font-mono text-[11px] tabular-nums text-dim">
          {Math.round(zoom * 100)}%
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-faint">
          {sel.length > 1 ? `${sel.length} picked` : node?.type ?? 'page'}
        </span>
        <button
          className="text-dim transition-colors hover:text-ink"
          title="hide inspector"
          onClick={() => useEditor.getState().setInspector(false)}
        >
          <PanelIcon size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {node
          ? node.type === 'artboard'
            ? <ArtboardInspector node={node} />
            : <Inspector node={node} />
          : <PageInspector />}
      </div>

      <Handoff id={node?.id ?? doc.artboards[0]} />
    </aside>
  )
}

/**
 * Copy the design out.
 *
 * There is no build step behind any of these: the html is the document, the
 * jsx is that html with its style object spelled differently, and the png is
 * the browser drawing the very elements on screen. Which is the point of
 * designing in the DOM — the export cannot disagree with the canvas.
 */
function Handoff({ id }: { id?: string }) {
  const [done, setDone] = useState<string | null>(null)
  const flash = (what: string) => {
    setDone(what)
    setTimeout(() => setDone(null), 1300)
  }

  if (!id) return null

  const write = async (kind: 'html' | 'jsx' | 'tailwind') => {
    const { doc } = useEditor.getState()
    const text = kind === 'html' ? toHtml(doc, id) : toJsx(doc, id, kind === 'jsx' ? 'inline' : 'tailwind')
    await navigator.clipboard.writeText(text)
    flash(kind)
  }

  const png = async () => {
    try {
      const { w, h } = await copyPng(id)
      flash(`${w}×${h}`)
    } catch (e) {
      flash(e instanceof Error ? 'no image' : 'failed')
    }
  }

  return (
    <div className="border-t border-hair p-3">
      <div className="grid grid-cols-4 gap-1.5">
        {([
          ['html', 'HTML', () => write('html')],
          ['jsx', 'React', () => write('jsx')],
          ['tailwind', 'TW', () => write('tailwind')],
          ['png', 'PNG', png],
        ] as const).map(([key, label, run]) => (
          <button
            key={key}
            onClick={run}
            title={key === 'tailwind' ? 'React with Tailwind classes' : `Copy as ${label}`}
            className="inset-control h-[28px] transition-colors hover:bg-black/[0.02]"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 h-3 text-center text-[10px] text-faint">
        {done ? `copied ${done}` : `\u00a0`}
      </p>
    </div>
  )
}

function ArtboardInspector({ node }: { node: Node }) {
  const patch = (style: Style) => useEditor.getState().patchStyle([node.id], style)

  return (
    <>
      <Section label="Artboard">
        <input
          value={node.name}
          onChange={e => useEditor.getState().rename(node.id, e.target.value)}
          className="inset-control h-[26px] w-full px-2 outline-none
                     focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <NumField label="W" min={120} value={Math.round(readLen(node.style.width, 1280))}
                    onChange={v => patch({ width: `${Math.round(v)}px` })} />
          <NumField label="H" min={120} value={Math.round(readLen(node.style.height, 832))}
                    onChange={v => patch({ height: `${Math.round(v)}px` })} />
        </div>
      </Section>

      <Background node={node} patch={patch} showColor />

      <Tokens board={node} />

      <Section label="Contents">
        <p className="text-[10px] leading-relaxed text-faint">
          {node.children.length} top level {node.children.length === 1 ? 'node' : 'nodes'}.
          Double click a frame to work inside it.
        </p>
      </Section>

      <Palette artboardId={node.id} />
    </>
  )
}

function PageInspector() {
  const doc = useEditor(s => s.doc)
  return (
    <>
      <Section label="Document">
        <div className="space-y-1.5">
          <Row label="artboards" value={String(doc.artboards.length)} />
          <Row label="nodes" value={String(Object.keys(doc.nodes).length)} />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          Pick a node to edit it, or draw one with the tools on the left.
        </p>
      </Section>
      <Palette />
    </>
  )
}

/**
 * The palette, read out of the design rather than declared alongside it.
 *
 * Every colour the css actually mentions, commonest first. Clicking one
 * selects every node using it, which turns "what is this pink" into a
 * selection you can recolour in one edit.
 */
function Palette({ artboardId }: { artboardId?: string } = {}) {
  const doc = useEditor(s => s.doc)
  const swatches = palette(doc, artboardId)
  if (!swatches.length) return null

  const pick = (value: string) => {
    const hit = Object.values(doc.nodes).filter(n =>
      Object.entries(n.style).some(([k, v]) =>
        /color|background|border|outline|shadow/i.test(k) && v.toLowerCase().includes(value)))
    if (hit.length) useEditor.getState().select(hit.map(n => n.id))
  }

  return (
    <Section label="Colours">
      <div className="flex flex-col gap-px">
        {swatches.slice(0, 14).map(s => (
          <button
            key={s.value}
            onClick={() => pick(s.value)}
            title={`${s.properties.join(', ')} — select all ${s.uses}`}
            className="flex items-center gap-2 rounded-[4px] px-1 py-[3px] text-left
                       transition-colors hover:bg-black/[0.04]"
          >
            <span
              className="size-[13px] shrink-0 rounded-[3px] border border-black/15"
              style={{ background: s.value }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] uppercase">
              {s.value}
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-faint">
              {s.uses}
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center">
      <span className="text-dim">{label}</span>
      <span className="ml-auto font-mono text-[11px] tabular-nums">{value}</span>
    </div>
  )
}

const readLen = (v: string | undefined, fallback: number) => {
  const m = /^(-?[\d.]+)/.exec((v ?? '').trim())
  return m ? Number(m[1]) : fallback
}
