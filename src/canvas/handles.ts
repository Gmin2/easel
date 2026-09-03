import type { Box } from '../doc/types'

/**
 * Eight handles: four corners and four edges, clockwise from the top-left.
 *
 * The corners are drawn; the edges are not. An edge is grabbable anywhere
 * along its length rather than at a midpoint dot, which is both a bigger
 * target than a dot and quieter chrome — the cursor turning into ns-resize is
 * the affordance.
 *
 * The boards editor did this maths around a centre point because its document
 * stored node centres. Ours stores css, so everything here is top-left based
 * and a resize is four edges moving independently.
 */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type Handle = (typeof HANDLES)[number]

export const CORNERS = ['nw', 'ne', 'se', 'sw'] as const

/** does this handle move a vertical edge, and so author a width */
export const widens = (h: Handle) => h.includes('e') || h.includes('w')
/** does it move a horizontal edge, and so author a height */
export const heightens = (h: Handle) => h.includes('n') || h.includes('s')

export interface ScreenRect { x: number; y: number; w: number; h: number }

/** the drawn handles, which are the corners only */
export function handlePoints(r: ScreenRect): [number, number][] {
  return [
    [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
  ]
}

/**
 * Which handle is under a screen point, if any.
 *
 * Corners win over edges, since they overlap at every one of them. An edge is
 * only offered when the node is thick enough across that axis to still have a
 * middle left to drag from — otherwise a thin node would be all edge and you
 * could never pick it up and move it.
 */
export function handleAt(r: ScreenRect, px: number, py: number, grab = 9): Handle | null {
  const pts = handlePoints(r)
  for (let i = 0; i < pts.length; i++) {
    const [hx, hy] = pts[i]
    if (Math.abs(px - hx) <= grab && Math.abs(py - hy) <= grab) return CORNERS[i]
  }

  const alongX = px >= r.x - grab && px <= r.x + r.w + grab
  const alongY = py >= r.y - grab && py <= r.y + r.h + grab
  const room = grab * 3

  if (alongX && r.h > room) {
    if (Math.abs(py - r.y) <= grab) return 'n'
    if (Math.abs(py - (r.y + r.h)) <= grab) return 's'
  }
  if (alongY && r.w > room) {
    if (Math.abs(px - r.x) <= grab) return 'w'
    if (Math.abs(px - (r.x + r.w)) <= grab) return 'e'
  }
  return null
}

export const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
}

/** apply a handle drag to a box. dx and dy are in wall pixels */
export function resize(
  start: Box, handle: Handle, dx: number, dy: number,
  keepAspect: boolean, fromCentre = false,
): Box {
  const east = handle.includes('e')
  const west = handle.includes('w')
  const south = handle.includes('s')
  const north = handle.includes('n')

  let w = Math.max(1, start.w + (east ? dx : 0) - (west ? dx : 0))
  let h = Math.max(1, start.h + (south ? dy : 0) - (north ? dy : 0))

  if (keepAspect) {
    const k = Math.max(w / start.w, h / start.h)
    w = start.w * k
    h = start.h * k
  }

  // alt resizes about the centre: the middle stays put and the size changes
  // by twice the drag
  if (fromCentre) {
    const cx = start.x + start.w / 2
    const cy = start.y + start.h / 2
    const w2 = Math.max(1, start.w + 2 * (w - start.w))
    const h2 = Math.max(1, start.h + 2 * (h - start.h))
    return { x: cx - w2 / 2, y: cy - h2 / 2, w: w2, h: h2 }
  }

  return {
    // the anchored edge does not move, so a west drag pays for the width
    x: west ? start.x + start.w - w : start.x,
    y: north ? start.y + start.h - h : start.y,
    w,
    h,
  }
}
