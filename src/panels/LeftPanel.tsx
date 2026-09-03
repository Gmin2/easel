import { useEffect, useRef, useState } from 'react'
import {
  ButtonMark, ChevronDown, ChevronRight, FileIcon, Frame, Image, LinkMark,
  PanelIcon, Plus, Rect, TypeMark, Vector,
} from '../icons'
import Activity from './Activity'
import { ancestors, boardsOn } from '../doc/ops'
import { useEditor } from '../doc/store'
import { DEVICES } from '../doc/devices'
import type { Node } from '../doc/types'

/** the drop the pointer is currently offering */
interface Drop {
  id: string
  where: 'above' | 'below' | 'inside'
}

export default function LeftPanel() {
  const doc = useEditor(s => s.doc)
  const file = useEditor(s => s.file)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [adding, setAdding] = useState(false)
  const [boardsOpen, setBoardsOpen] = useState(true)
  const list = useRef<HTMLDivElement>(null)
  // the right edge drags. the width outlives the session because a wide
  // layers panel is a preference, not a moment. activity sizes itself
  const [width, setWidth] = useState(() => recall('easel:left', 240))
  const grab = useRef<{ id: string; x: number; y: number; armed: boolean } | null>(null)

  const isOpen = (n: Node) => open[n.id] ?? n.type === 'artboard'

  // a pick on the canvas can land deep in a section nobody has unfolded, so
  // the tree opens down to it and brings it into view: the panel is how you
  // find out where the thing you clicked lives
  const primary = useEditor(s => s.sel[0])
  useEffect(() => {
    if (!primary) return
    const up = ancestors(useEditor.getState().doc, primary)
    const frame = requestAnimationFrame(() => {
      if (up.length) setOpen(o => ({ ...o, ...Object.fromEntries(up.map(a => [a, true])) }))
      // the row is only there once the unfolded tree has rendered
      requestAnimationFrame(() => {
        list.current?.querySelector(`[data-row="${primary}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [primary])

  const onDown = (e: React.PointerEvent, id: string) => {
    grab.current = { id, x: e.clientX, y: e.clientY, armed: false }
  }

  const onMove = (e: React.PointerEvent) => {
    const g = grab.current
    if (!g) return
    if (!g.armed) {
      if (Math.abs(e.clientY - g.y) + Math.abs(e.clientX - g.x) < 4) return
      g.armed = true
      setHeld(g.id)
    }
    const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
      ?.closest('[data-row]') as HTMLElement | null
    const over = row?.dataset.row
    if (!over || over === g.id) return setDrop(null)
    // dropping a node inside itself would orphan the branch
    const target = doc.nodes[over]
    if (!target) return setDrop(null)
    let up: string | null = target.id
    while (up) {
      if (up === g.id) return setDrop(null)
      up = doc.nodes[up]?.parent ?? null
    }
    const r = row.getBoundingClientRect()
    const f = (e.clientY - r.top) / r.height
    const container = target.type === 'artboard' || target.type === 'frame'
    setDrop({
      id: over,
      where: container && f > 0.25 && f < 0.75 ? 'inside' : f < 0.5 ? 'above' : 'below',
    })
  }

  const onUp = () => {
    const g = grab.current
    grab.current = null
    setHeld(null)
    const d = drop
    setDrop(null)
    if (!g?.armed || !d) return
    const s = useEditor.getState()
    const target = doc.nodes[d.id]
    if (d.where === 'inside') {
      s.move(g.id, d.id, null)
      setOpen(o => ({ ...o, [d.id]: true }))
      return
    }
    if (!target.parent) return
    const siblings = doc.nodes[target.parent].children
    const at = siblings.indexOf(d.id)
    const before = d.where === 'above' ? d.id : siblings[at + 1] ?? null
    s.move(g.id, target.parent, before)
  }

  const rows = (id: string, depth: number): React.ReactNode => {
    const n = doc.nodes[id]
    if (!n) return null
    const shown = isOpen(n)
    return (
      <div key={id} className="contents">
        <Row
          node={n} depth={depth}
          open={shown}
          renaming={renaming === id}
          held={held === id}
          drop={drop?.id === id ? drop.where : null}
          onToggle={() => setOpen(o => ({ ...o, [id]: !shown }))}
          onRename={name => { useEditor.getState().rename(id, name); setRenaming(null) }}
          onStartRename={() => setRenaming(id)}
          onDown={e => onDown(e, id)}
        />
        {shown && [...n.children].reverse().map(c => rows(c, depth + 1))}
      </div>
    )
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-hair bg-panel"
      style={{ width }}
    >
      <Grip axis="x" onDrag={dx => setWidth(w => clamp(w + dx, 200, 520))} onDone={() => remember('easel:left', width)} />
      <header className="flex h-[41px] shrink-0 items-center gap-2 border-b border-hair px-3">
        <button
          className="rounded-[4px] px-1 font-medium transition-colors hover:bg-black/[0.05]"
          title="back to files"
          onClick={() => void useEditor.getState().goHome()}
        >
          Easel
        </button>
        <span className="min-w-0 truncate text-dim">{file?.name ?? 'Untitled'}</span>
        <span className="shrink-0 font-mono text-[10px] text-faint">
          {Object.keys(doc.nodes).length} nodes
        </span>
        <button
          className="ml-auto text-dim transition-colors hover:text-ink"
          title="hide panels"
          onClick={() => useEditor.getState().setPanels(false)}
        >
          <PanelIcon size={15} />
        </button>
      </header>

      <Pages />

      <div className="flex items-center gap-1.5 border-b border-hair px-3 py-2">
        <Fold open={boardsOpen} onClick={() => setBoardsOpen(o => !o)} label="Artboards" />
        <button
          className="ml-auto grid h-5 w-5 place-items-center rounded text-dim
                     transition-colors hover:bg-black/[0.05] hover:text-ink"
          title="new artboard"
          onClick={() => setAdding(a => !a)}
        >
          <Plus size={12} />
        </button>
      </div>

      {adding && (
        <div className="border-b border-hair px-3 py-2">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">size</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DEVICES.map(d => (
              <button
                key={d.name}
                className="inset-control h-[26px] px-2 text-left transition-colors hover:bg-black/[0.02]"
                onClick={() => {
                  useEditor.getState().createArtboard({ name: d.name, w: d.w, h: d.h })
                  setAdding(false)
                }}
              >
                {d.name}
                <span className="ml-1 font-mono text-[10px] text-faint">{d.w}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {boardsOpen && <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setDrop(null)}
      >
        {[...boardsOn(doc)].reverse().map(id => rows(id, 0))}
      </div>}

      <Activity />
    </aside>
  )
}

/**
 * The pages list.
 *
 * A page is a named wall, so switching one is navigation rather than an edit
 * and stays off the undo stack. Every board in the file is still in the
 * document either way, which is why an agent can write to a board on a page
 * nobody is looking at.
 */
function Pages() {
  const doc = useEditor(s => s.doc)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  return (
    <div className="border-b border-hair px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Fold open={open} onClick={() => setOpen(o => !o)} label="Pages" />
        <button
          className="ml-auto grid h-5 w-5 place-items-center rounded text-dim
                     transition-colors hover:bg-black/[0.05] hover:text-ink"
          title="new page"
          onClick={() => useEditor.getState().addPage()}
        >
          <Plus size={12} />
        </button>
      </div>

      {open && <div className="mt-1 flex flex-col gap-px">
        {doc.pages.map(p => {
          const here = p.id === doc.page
          const boards = boardsOn(doc, p.id).length
          return (
            <div key={p.id} className="group flex items-center gap-1.5">
              {renaming === p.id ? (
                <input
                  autoFocus
                  defaultValue={p.name}
                  onBlur={e => {
                    useEditor.getState().renamePage(p.id, e.target.value.trim() || p.name)
                    setRenaming(null)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="h-[22px] min-w-0 flex-1 rounded-[4px] bg-black/[0.05] px-1.5 outline-none"
                />
              ) : (
                <button
                  onClick={() => useEditor.getState().showPage(p.id)}
                  onDoubleClick={() => setRenaming(p.id)}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] px-1.5 py-[3px]
                              text-left transition-colors
                              ${here ? 'bg-black/[0.06] text-ink' : 'text-dim hover:bg-black/[0.03]'}`}
                >
                  <FileIcon size={12} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 font-mono text-[9px] text-faint">{boards}</span>
                </button>
              )}
              {doc.pages.length > 1 && renaming !== p.id && (
                <button
                  onClick={() => useEditor.getState().removePage(p.id)}
                  title={`delete this page and its ${boards} board${boards === 1 ? '' : 's'}`}
                  className="shrink-0 text-faint opacity-0 transition-opacity
                             hover:text-ink group-hover:opacity-100"
                >
                  −
                </button>
              )}
            </div>
          )
        })}
      </div>}
    </div>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  artboard: <Frame size={12} />,
  frame: <Rect size={12} />,
  text: <TypeMark />,
  button: <ButtonMark size={12} />,
  image: <Image size={12} />,
  link: <LinkMark size={12} />,
  svg: <Vector size={12} />,
}

interface RowProps {
  node: Node
  depth: number
  open: boolean
  renaming: boolean
  held: boolean
  drop: 'above' | 'below' | 'inside' | null
  onToggle(): void
  onRename(name: string): void
  onStartRename(): void
  onDown(e: React.PointerEvent): void
}

function Row({
  node, depth, open, renaming, held, drop,
  onToggle, onRename, onStartRename, onDown,
}: RowProps) {
  const picked = useEditor(s => s.sel.includes(node.id))
  const inside = useEditor(s => s.inside === node.id)

  return (
    <div className="relative">
      {drop === 'above' && <span className="absolute left-0 right-0 top-0 h-px bg-[#5e92f4]" />}
      {drop === 'below' && <span className="absolute bottom-0 left-0 right-0 h-px bg-[#5e92f4]" />}
      <div
        data-row={node.id}
        onPointerDown={e => {
          onDown(e)
          const s = useEditor.getState()
          s.select([node.id], e.shiftKey || e.metaKey || e.ctrlKey)
          if (node.type !== 'artboard') s.setInside(node.parent)
          else s.setInside(null)
        }}
        onDoubleClick={onStartRename}
        style={{ paddingLeft: 8 + depth * 14, height: 26 }}
        className={`flex items-center gap-1.5 pr-2 transition-colors
                    ${held ? 'opacity-40' : ''}
                    ${drop === 'inside' ? 'ring-1 ring-inset ring-[#5e92f4]' : ''}
                    ${picked ? 'bg-row' : 'hover:bg-black/[0.035]'}`}
      >
        {node.children.length ? (
          <button
            className="grid h-3.5 w-3.5 shrink-0 place-items-center text-faint"
            onPointerDown={e => { e.stopPropagation(); onToggle() }}
          >
            {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          </button>
        ) : <span className="h-3.5 w-3.5 shrink-0" />}

        <span className="grid w-4 shrink-0 place-items-center text-dim">
          {ICONS[node.type]}
        </span>

        {renaming ? (
          <input
            autoFocus
            defaultValue={node.name}
            onPointerDown={e => e.stopPropagation()}
            onBlur={e => onRename(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') onRename(node.name)
            }}
            className="min-w-0 flex-1 rounded-[3px] bg-surface px-1 outline-none
                       ring-2 ring-[#2d52f0]/40"
          />
        ) : (
          <span className={`min-w-0 flex-1 truncate ${inside ? 'font-medium' : ''}`}>
            {node.name}
          </span>
        )}

        <span className="shrink-0 font-mono text-[10px] text-faint">{node.tag}</span>
      </div>
    </div>
  )
}

/** a section title that folds its section, chevron and all */
function Fold({ open, onClick, label }: { open: boolean; onClick(): void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-[4px] py-0.5 pr-1 font-medium transition-colors hover:text-ink">
      <ChevronRight size={9} className={`text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
      {label}
    </button>
  )
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function recall(key: string, fallback: number): number {
  try { const v = Number(localStorage.getItem(key)); return v > 0 ? v : fallback } catch { return fallback }
}

function remember(key: string, value: number): void {
  try { localStorage.setItem(key, String(value)) } catch { /* private mode */ }
}

/** the drag edge on the right, resizing width */
function Grip({ axis, onDrag, onDone }: { axis: 'x'; onDrag(delta: number): void; onDone(): void }) {
  const last = useRef(0)
  return (
    <div
      onPointerDown={e => {
        e.preventDefault()
        e.stopPropagation()
        last.current = axis === 'x' ? e.clientX : e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        const now = axis === 'x' ? e.clientX : e.clientY
        onDrag(now - last.current)
        last.current = now
      }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); onDone() }}
      className={axis === 'x'
        ? 'absolute -right-[3px] top-0 z-20 h-full w-[6px] cursor-col-resize hover:bg-black/10'
        : 'absolute -top-[3px] left-0 z-20 h-[6px] w-full cursor-row-resize hover:bg-black/10'}
    />
  )
}
