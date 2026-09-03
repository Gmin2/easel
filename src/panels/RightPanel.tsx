import { useState } from 'react'
import ColorRow from './ColorRow'
import Inspector, { Section } from './Inspector'
import NumField from './NumField'
import { PanelIcon } from '../icons'
import { readColour, writeColour } from '../lib/css'
import { toHtml } from '../doc/html'
import { useEditor } from '../doc/store'
import type { Node, Style } from '../doc/types'

export default function RightPanel() {
  const doc = useEditor(s => s.doc)
  const sel = useEditor(s => s.sel)
  const zoom = useEditor(s => s.cam.zoom)
  const [copied, setCopied] = useState(false)

  const node = sel[0] ? doc.nodes[sel[0]] ?? null : null

  const copy = async () => {
    if (!node) return
    await navigator.clipboard.writeText(toHtml(doc, node.id))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

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
          title="hide panels"
          onClick={() => useEditor.getState().setPanels(false)}
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

      {node && (
        <div className="border-t border-hair p-3">
          <button
            onClick={copy}
            className="inset-control h-[30px] w-full transition-colors hover:bg-black/[0.02]"
          >
            {copied ? 'Copied' : 'Copy HTML'}
          </button>
        </div>
      )}
    </aside>
  )
}

function ArtboardInspector({ node }: { node: Node }) {
  const patch = (style: Style) => useEditor.getState().patchStyle([node.id], style)
  const bg = readColour(node.style.background ?? node.style.backgroundColor, '#FFFFFF')

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

      <Section label="Background">
        <ColorRow hex={bg.hex} alpha={bg.alpha}
                  onChange={(hex, alpha) => patch({ background: writeColour(hex, alpha) })} />
      </Section>

      <Section label="Contents">
        <p className="text-[10px] leading-relaxed text-faint">
          {node.children.length} top level {node.children.length === 1 ? 'node' : 'nodes'}.
          Double click a frame to work inside it.
        </p>
      </Section>
    </>
  )
}

function PageInspector() {
  const doc = useEditor(s => s.doc)
  return (
    <Section label="Document">
      <div className="space-y-1.5">
        <Row label="artboards" value={String(doc.artboards.length)} />
        <Row label="nodes" value={String(Object.keys(doc.nodes).length)} />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Pick a node to edit it, or draw one with the tools on the left.
      </p>
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
