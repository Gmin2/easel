import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import NodeView from './NodeView'
import Overlay from './Overlay'
import { CURSORS, handleAt, heightens, resize, widens } from './handles'
import type { Handle } from './handles'
import { snap } from './snap'
import type { Guide } from './snap'
import { HEADER, wall } from './wall'
import { setGeo } from '../doc/geo'
import { ancestors, artboardOf } from '../doc/ops'
import { useEditor } from '../doc/store'
import type { Box, NodeBox, NodeType } from '../doc/types'

/** a click that has not moved this far is a click, not a drag */
const SLOP = 2
/** what a create tool makes when you click instead of dragging */
const DEFAULTS: Record<string, { w: number; h?: number }> = {
  frame: { w: 320, h: 200 },
  text: { w: 420 },
  button: { w: 0 },
  image: { w: 320, h: 200 },
}

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number; moved: boolean }
  | {
    kind: 'move'; ids: string[]; start: Record<string, Box>
    origin: Record<string, Box>; sx: number; sy: number; moved: boolean
  }
  | {
    kind: 'resize'; id: string; handle: Handle; start: Box; origin: Box
    sx: number; sy: number; moved: boolean
  }
  | {
    kind: 'draw'; type: NodeType; artboard: string; from: { x: number; y: number }
    screen: { x: number; y: number }; sx: number; sy: number; moved: boolean
  }
  | {
    kind: 'marquee'; scope: string | null; from: { x: number; y: number }
    screen: { x: number; y: number }; sx: number; sy: number; moved: boolean
  }

export default function Canvas() {
  const doc = useEditor(s => s.doc)
  const sel = useEditor(s => s.sel)
  const tool = useEditor(s => s.tool)
  const cam = useEditor(s => s.cam)
  const inside = useEditor(s => s.inside)
  const hover = useEditor(s => s.hover)
  const boxes = useEditor(s => s.boxes)
  const editing = useEditor(s => s.editing)

  const wrap = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const fitted = useRef(false)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [guides, setGuides] = useState<Guide[]>([])
  const [band, setBand] = useState<Box | null>(null)
  const [grab, setGrab] = useState<Handle | null>(null)
  const [space, setSpace] = useState(false)

  const layout = useMemo(() => wall(doc, boxes), [doc, boxes])

  // ------------------------------------------------------------ measurement

  /**
   * Boxes come from the browser, not from the document. A text node's height
   * is whatever the font decided and a flow child's position is whatever the
   * layout put it at, so the only honest source is the elements themselves.
   */
  useLayoutEffect(() => {
    const w = world.current
    if (!w) return
    const origin = w.getBoundingClientRect()
    const z = cam.zoom
    const out: Record<string, NodeBox> = {}
    w.querySelectorAll<HTMLElement>('[data-easel]').forEach(el => {
      const id = el.dataset.easel
      if (!id) return
      const r = el.getBoundingClientRect()
      out[id] = {
        id,
        artboard: artboardOf(doc, id) ?? '',
        x: (r.left - origin.left) / z,
        y: (r.top - origin.top) / z,
        w: r.width / z,
        h: r.height / z,
      }
    })
    useEditor.getState().measure(out)
  })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const el = wrap.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 80
    const room = { w: r.width - pad * 2, h: r.height - pad * 2 - HEADER }
    const { w, h } = wall(useEditor.getState().doc, useEditor.getState().boxes)
    if (!w || !h) return
    const zoom = Math.min(1, Math.max(0.02, Math.min(room.w / w, room.h / h)))
    useEditor.getState().setCam({
      zoom,
      pan: { x: (r.width - w * zoom) / 2, y: (r.height - h * zoom) / 2 + HEADER / 2 },
    })
  }, [])

  /** frame the wall once, the first time we know how big the viewport is */
  useEffect(() => {
    if (fitted.current || !size.w || !layout.w) return
    fitted.current = true
    fit()
  }, [size.w, layout.w, fit])

  // ------------------------------------------------------------ coordinates

  const local = useCallback((cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }, [])

  const toWall = useCallback((cx: number, cy: number) => {
    const p = local(cx, cy)
    return { x: (p.x - cam.pan.x) / cam.zoom, y: (p.y - cam.pan.y) / cam.zoom }
  }, [cam, local])

  /**
   * What is under the cursor, resolved to the level you are working at: a
   * click lands on the outermost thing inside the current scope, so clicking
   * a headline in a group picks the group until you step into it.
   */
  const pickAt = useCallback((cx: number, cy: number) => {
    const el = document.elementFromPoint(cx, cy) as HTMLElement | null
    const hit = el?.closest('[data-easel]') as HTMLElement | null
    const board = (el?.closest('[data-artboard]') as HTMLElement | null)?.dataset.artboard ?? null
    const id = hit?.dataset.easel
    if (!id) return { id: null, artboard: board }

    const chain = [id, ...ancestors(doc, id)]
    const scope = inside && chain.includes(inside) ? inside : artboardOf(doc, id)
    if (!scope || id === scope) return { id: null, artboard: board }
    const at = chain.indexOf(scope)
    return { id: chain[at - 1] ?? null, artboard: board }
  }, [doc, inside])

  const screenRect = useCallback((b: Box) => ({
    x: b.x * cam.zoom + cam.pan.x,
    y: b.y * cam.zoom + cam.pan.y,
    w: b.w * cam.zoom,
    h: b.h * cam.zoom,
  }), [cam])

  const primary = sel[0] ? boxes[sel[0]] ?? null : null

  // ----------------------------------------------------------------- camera

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      if (e.metaKey || e.ctrlKey) {
        useEditor.getState().setCam(c => {
          const zoom = Math.min(4, Math.max(0.02, c.zoom * Math.exp(-e.deltaY * 0.0015)))
          const k = zoom / c.zoom
          return { zoom, pan: { x: mx - (mx - c.pan.x) * k, y: my - (my - c.pan.y) * k } }
        })
      } else {
        useEditor.getState().setCam(c => ({
          ...c, pan: { x: c.pan.x - e.deltaX, y: c.pan.y - e.deltaY },
        }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /** space held turns any drag into a pan, the way every canvas does */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      e.preventDefault()
      setSpace(true)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // --------------------------------------------------------------- gestures

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 2) return
    const s = useEditor.getState()
    if (editing) return
    // capture keeps a drag alive once the pointer leaves the node it started
    // on, which is most of them
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId) } catch { /* synthetic */ }
    s.setMenu(null)

    const start = { sx: e.clientX, sy: e.clientY, moved: false }

    if (space || tool === 'hand' || e.button === 1) {
      drag.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false }
      return
    }

    if (tool === 'artboard') {
      const last = layout.boards.at(-1)
      s.createArtboard({ name: `Board ${doc.artboards.length + 1}`, w: 1280, h: 832 })
      s.setTool('select')
      if (!last) fit()
      return
    }

    if (tool === 'frame' || tool === 'text' || tool === 'button' || tool === 'image') {
      const p = pickAt(e.clientX, e.clientY)
      const board = p.artboard
      if (!board) return
      drag.current = {
        kind: 'draw', type: tool, artboard: board,
        from: toWall(e.clientX, e.clientY), screen: local(e.clientX, e.clientY), ...start,
      }
      return
    }

    // select tool: handles first, since they sit outside the node's own box
    if (primary && sel.length === 1) {
      const at = local(e.clientX, e.clientY)
      const h = handleAt(screenRect(primary), at.x, at.y)
      if (h) {
        const node = doc.nodes[sel[0]]
        const parent = node.parent ? boxes[node.parent] : null
        s.snapshot()
        drag.current = {
          kind: 'resize', id: sel[0], handle: h,
          start: { x: primary.x, y: primary.y, w: primary.w, h: primary.h },
          origin: parent ?? { x: 0, y: 0, w: 0, h: 0 },
          ...start,
        }
        return
      }
    }

    const p = pickAt(e.clientX, e.clientY)
    if (p.id) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey
      let ids = sel
      if (additive) {
        s.select([p.id], true)
        ids = useEditor.getState().sel
      } else if (!sel.includes(p.id)) {
        s.select([p.id])
        ids = [p.id]
      }
      const movable = ids.filter(id => doc.nodes[id] && doc.nodes[id].type !== 'artboard')
      if (!movable.length) { drag.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false }; return }
      s.snapshot()
      drag.current = {
        kind: 'move', ids: movable,
        start: Object.fromEntries(movable.map(id => [id, { ...boxes[id] }])),
        origin: Object.fromEntries(movable.map(id => {
          const parent = doc.nodes[id].parent
          return [id, parent && boxes[parent] ? { ...boxes[parent] } : { x: 0, y: 0, w: 0, h: 0 }]
        })),
        ...start,
      }
      return
    }

    // empty space: marquee inside a board, pan out on the wall
    if (p.artboard) {
      drag.current = {
        kind: 'marquee', scope: inside ?? p.artboard,
        from: toWall(e.clientX, e.clientY), screen: local(e.clientX, e.clientY), ...start,
      }
      return
    }
    // the bare wall holds nothing to pick, so touching it lets go of whatever
    // was, and the drag that follows is a pan
    s.select([])
    s.setInside(null)
    drag.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const s = useEditor.getState()

    if (!d) {
      // hover feedback and the resize cursor
      if (tool !== 'select') { if (hover) s.setHover(null); return }
      const p = local(e.clientX, e.clientY)
      if (primary && sel.length === 1) {
        setGrab(handleAt(screenRect(primary), p.x, p.y))
      } else if (grab) setGrab(null)
      const hit = pickAt(e.clientX, e.clientY)
      if (hit.id !== hover) s.setHover(hit.id)
      return
    }

    if (!d.moved && d.kind !== 'pan') {
      const far = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy)
      if (far <= SLOP) return
      d.moved = true
    }

    if (d.kind === 'pan') {
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      d.lastX = e.clientX
      d.lastY = e.clientY
      if (dx || dy) d.moved = true
      s.setCam(c => ({ ...c, pan: { x: c.pan.x + dx, y: c.pan.y + dy } }))
      return
    }

    // whole pixels: a screen delta divided by a 62% zoom is fractional, and
    // since the css on the canvas is the css that gets exported, a drag would
    // otherwise hand someone `height: 1026.18px` and look like a bug
    const dx = Math.round((e.clientX - d.sx) / cam.zoom)
    const dy = Math.round((e.clientY - d.sy) / cam.zoom)

    if (d.kind === 'move') {
      const lead = d.ids[0]
      const from = d.start[lead]
      const parentId = doc.nodes[lead].parent
      const siblings = (parentId ? doc.nodes[parentId].children : [])
        .filter(id => !d.ids.includes(id))
        .map(id => boxes[id])
        .filter(Boolean)
      const container = parentId ? boxes[parentId] : null
      const wanted = { x: from.x + dx, y: from.y + dy, w: from.w, h: from.h }
      const hit = container
        ? snap(wanted, siblings, container, cam.zoom)
        : { x: wanted.x, y: wanted.y, guides: [] }
      setGuides(hit.guides)

      // the lead lands where it snapped; the rest follow by the same shift
      const shift = { x: hit.x - from.x, y: hit.y - from.y }
      let next = s.doc
      for (const id of d.ids) {
        const b = d.start[id]
        const o = d.origin[id]
        next = patched(next, id, {
          x: Math.round(b.x + shift.x - o.x),
          y: Math.round(b.y + shift.y - o.y),
        })
      }
      useEditor.setState({ doc: next })
      return
    }

    if (d.kind === 'resize') {
      const box = resize(d.start, d.handle, dx, dy, e.shiftKey, e.altKey)
      // a board's place on the wall is derived, so it authors a size and
      // nothing else; a left or top on it would fight the wall
      const board = doc.nodes[d.id]?.type === 'artboard'
      // rounded here and not just on the delta: a paragraph's start height is
      // whatever the browser measured the text at, so adding a whole-pixel
      // drag to 272.59 still ends in .59
      const r = Math.round
      // only the axes this handle actually moves get written, so dragging the
      // side of a paragraph rewraps it and leaves the height to the text,
      // while dragging its bottom pins the height to what you chose
      const style = setGeo({
        ...(!board && { x: r(box.x - d.origin.x), y: r(box.y - d.origin.y) }),
        ...(widens(d.handle) && { w: r(box.w) }),
        ...(heightens(d.handle) && { h: r(box.h) }),
      })
      s.patchStyle([d.id], board ? style : { position: 'absolute', ...style }, true)
      return
    }

    // draw and marquee both just rubber-band
    const now = local(e.clientX, e.clientY)
    setBand({
      x: Math.min(d.screen.x, now.x), y: Math.min(d.screen.y, now.y),
      w: Math.abs(now.x - d.screen.x), h: Math.abs(now.y - d.screen.y),
    })
  }

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGuides([])
    setBand(null)
    if (!d) return
    const s = useEditor.getState()

    if (d.kind === 'draw') {
      const to = toWall(e.clientX, e.clientY)
      const board = boxes[d.artboard]
      if (!board) return
      const def = DEFAULTS[d.type]
      const raw = {
        x: Math.min(d.from.x, to.x), y: Math.min(d.from.y, to.y),
        w: Math.abs(to.x - d.from.x), h: Math.abs(to.y - d.from.y),
      }
      const tiny = raw.w < 4 || raw.h < 4
      const box: Partial<Box> = {
        x: (tiny ? d.from.x : raw.x) - board.x,
        y: (tiny ? d.from.y : raw.y) - board.y,
        ...(d.type === 'button'
          ? {}
          : tiny
            ? { w: def.w, ...(def.h && { h: def.h }) }
            : { w: raw.w, ...(d.type === 'text' ? {} : { h: raw.h }) }),
      }
      const id = s.createNode(inside ?? d.artboard, d.type, box)
      s.setTool('select')
      if (id && (d.type === 'text' || d.type === 'button')) {
        s.snapshot()
        s.setEditing(id)
      }
      return
    }

    if (d.kind === 'marquee') {
      if (!d.moved) {
        // a click that drew no band steps out of whatever you had opened, and
        // once you are back at the top it picks the board its own background
        // belongs to, the same as clicking the board's name
        if (inside) {
          s.select([])
          s.setInside(null)
        } else s.select(d.scope ? [d.scope] : [])
        return
      }
      const to = toWall(e.clientX, e.clientY)
      const area = {
        x: Math.min(d.from.x, to.x), y: Math.min(d.from.y, to.y),
        w: Math.abs(to.x - d.from.x), h: Math.abs(to.y - d.from.y),
      }
      const kids = d.scope ? doc.nodes[d.scope]?.children ?? [] : []
      const picked = kids.filter(id => {
        const b = boxes[id]
        return b && b.x >= area.x && b.y >= area.y
          && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h
      })
      s.select(picked)
      return
    }

    if ((d.kind === 'move' || d.kind === 'resize') && !d.moved) {
      // a gesture that never moved leaves no edit, so its snapshot goes back
      s.dropSnapshot()
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = useEditor.getState()
    const p = pickAt(e.clientX, e.clientY)
    if (!p.id) { s.setInside(null); return }
    const n = doc.nodes[p.id]
    if (n.type === 'frame' || n.type === 'artboard') {
      s.setInside(p.id)
      s.select([])
      return
    }
    if (n.text !== undefined) {
      s.select([p.id])
      s.snapshot()
      s.setEditing(p.id)
    }
  }

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault()
    const s = useEditor.getState()
    const p = pickAt(e.clientX, e.clientY)
    if (p.id && !sel.includes(p.id)) s.select([p.id])
    else if (!p.id) s.select([])
    s.setMenu({ x: e.clientX, y: e.clientY })
  }

  const cursor = space || tool === 'hand'
    ? 'grab'
    : grab
      ? CURSORS[grab]
      : tool === 'select' ? 'default' : 'crosshair'

  return (
    <div
      ref={wrap}
      className="canvas-nodes relative min-h-0 flex-1 overflow-hidden bg-ground"
      style={{ cursor }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContext}
      onPointerLeave={() => useEditor.getState().setHover(null)}
    >
      <div
        ref={world}
        className="absolute left-0 top-0 h-0 w-0"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${cam.pan.x}px, ${cam.pan.y}px) scale(${cam.zoom})`,
        }}
      >
        {layout.boards.map(b => (
          <div key={b.id} className="absolute" style={{ left: b.x, top: b.y }}>
            <NodeView id={b.id} />
          </div>
        ))}
      </div>

      <Overlay
        cam={cam}
        boards={layout.boards}
        primary={primary}
        primaryName={primary ? doc.nodes[primary.id]?.name ?? '' : ''}
        others={sel.slice(1).map(id => boxes[id]).filter(Boolean)}
        hover={hover && hover !== sel[0] ? boxes[hover] ?? null : null}
        inside={inside ? boxes[inside] ?? null : null}
        guides={guides}
        band={band}
        activeBoard={sel[0] ? artboardOf(doc, sel[0]) : inside ? artboardOf(doc, inside) : null}
        onPickBoard={id => {
          const s = useEditor.getState()
          s.select([id])
          s.setInside(null)
        }}
      />

      <button
        className="inset-control absolute bottom-3 right-3 h-[26px] px-2 font-mono text-[11px] tabular-nums text-dim hover:text-ink"
        onClick={fit}
        title="zoom to fit"
      >
        {Math.round(cam.zoom * 100)}%
      </button>
    </div>
  )
}

/** move one node by rewriting its own css, keeping it out of the undo stack */
function patched(doc: ReturnType<typeof useEditor.getState>['doc'], id: string, at: { x: number; y: number }) {
  const n = doc.nodes[id]
  if (!n) return doc
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [id]: { ...n, style: { ...n.style, position: 'absolute', ...setGeo(at) } },
    },
  }
}
