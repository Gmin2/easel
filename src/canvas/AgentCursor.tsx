import { useEffect, useRef } from 'react'
import { useEditor } from '../doc/store'
import type { Camera } from '../doc/types'

/**
 * The agent's cursor, the way a collaborator's shows in a multiplayer tool.
 *
 * It springs to wherever the last node landed and idles with a pulse while
 * the model is still writing, so a generation reads as someone building on
 * the board rather than a spinner followed by a wall of nodes. When it moves
 * out of view the camera follows, gently.
 */
export default function AgentCursor({ cam }: { cam: Camera }) {
  const c = useEditor(s => s.cursor)
  const root = useRef<HTMLDivElement>(null)
  const x = c ? c.x * cam.zoom + cam.pan.x : 0
  const y = c ? c.y * cam.zoom + cam.pan.y : 0

  useEffect(() => {
    if (!c?.busy) return
    const host = root.current?.parentElement
    if (!host) return
    const r = host.getBoundingClientRect()
    const m = 80
    let dx = 0, dy = 0
    if (x < m) dx = m - x; else if (x > r.width - m) dx = r.width - m - x
    if (y < m) dy = m - y; else if (y > r.height - m) dy = r.height - m - y
    if (dx || dy) useEditor.getState().setCam(cam => ({ ...cam, pan: { x: cam.pan.x + dx, y: cam.pan.y + dy } }))
  }, [c, x, y])

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-40">
      <Skeleton cam={cam} />
      <Loading cam={cam} />
      {c && (
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 420ms cubic-bezier(.2,.8,.2,1)' }}
        >
          <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
            <path d="M2 1.5L2 16.2L5.9 12.6L8.4 18.4L11.2 17.2L8.8 11.6L14.2 11.4Z" fill="#2563eb" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <div className="ml-3.5 -mt-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2563eb] py-0.5 pl-2 pr-2.5 text-[10px] font-medium text-white shadow">
            <span className={`size-1.5 rounded-full bg-white ${c.busy ? 'animate-pulse' : 'opacity-60'}`} />
            {c.label}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Where the next piece will land: a shimmering block at the bottom of the
 * container being filled, sized like a line of content. It is drawn here in
 * screen space, so it is never a node and never gets saved.
 */
function Skeleton({ cam }: { cam: Camera }) {
  const parent = useEditor(s => s.skeleton)
  const boxes = useEditor(s => s.boxes)
  const nodes = useEditor(s => s.doc.nodes)
  if (!parent) return null
  const box = boxes[parent]
  const node = nodes[parent]
  if (!box || !node) return null
  const kids = node.children.map(id => boxes[id]).filter(Boolean)
  const bottom = kids.length ? Math.max(...kids.map(b => b.y + b.h)) : box.y + 16
  const pad = Math.min(24, box.w * 0.05)
  const w = Math.max(80, Math.min(box.w - pad * 2, 520)) * cam.zoom
  const h = 28 * cam.zoom
  const sx = (box.x + pad) * cam.zoom + cam.pan.x
  const sy = (bottom + 12) * cam.zoom + cam.pan.y
  return (
    <div
      className="absolute left-0 top-0 rounded-[6px]"
      style={{
        transform: `translate(${sx}px, ${sy}px)`, width: w, height: h,
        background: 'linear-gradient(90deg, rgba(37,99,235,0.10), rgba(37,99,235,0.22), rgba(37,99,235,0.10))',
        backgroundSize: '200% 100%',
        animation: 'easel-shimmer 1.2s linear infinite',
        outline: '1px dashed rgba(37,99,235,0.45)',
        transition: 'transform 300ms cubic-bezier(.2,.8,.2,1), width 300ms',
      }}
    />
  )
}

/** a shimmer over every node that is waiting on a picture, so the wait is visible where it lands */
function Loading({ cam }: { cam: Camera }) {
  const ids = useEditor(s => s.loading)
  const boxes = useEditor(s => s.boxes)
  if (!ids.length) return null
  return (
    <>
      {ids.map(id => {
        const b = boxes[id]
        if (!b) return null
        return (
          <div
            key={id}
            className="absolute left-0 top-0 rounded-[8px]"
            style={{
              transform: `translate(${b.x * cam.zoom + cam.pan.x}px, ${b.y * cam.zoom + cam.pan.y}px)`,
              width: b.w * cam.zoom, height: b.h * cam.zoom,
              background: 'linear-gradient(90deg, rgba(37,99,235,0.06), rgba(37,99,235,0.16), rgba(37,99,235,0.06))',
              backgroundSize: '200% 100%',
              animation: 'easel-shimmer 1.2s linear infinite',
              outline: '1px dashed rgba(37,99,235,0.45)',
            }}
          >
            <span className="absolute left-2 top-2 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-medium text-white">painting…</span>
          </div>
        )
      })}
    </>
  )
}
