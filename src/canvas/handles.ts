import type { Box } from '../doc/types'

/**
 * Corners only, clockwise from the top-left — four handles and no edge
 * midpoints. Edge resizing still works by dragging the outline itself.
 *
 * The boards editor did this maths around a centre point because its document
 * stored node centres. Ours stores css, so everything here is top-left based
 * and a resize is four edges moving independently.
 */
export const HANDLES = ['nw', 'ne', 'se', 'sw'] as const
export type Handle = (typeof HANDLES)[number]

export interface ScreenRect { x: number; y: number; w: number; h: number }

export function handlePoints(r: ScreenRect): [number, number][] {
  return [
    [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
  ]
}

/** which handle is under a screen point, if any. the grab area is larger than
 *  the drawn square so small nodes stay resizable */
export function handleAt(r: ScreenRect, px: number, py: number, grab = 9): Handle | null {
  const pts = handlePoints(r)
  for (let i = 0; i < pts.length; i++) {
    const [hx, hy] = pts[i]
    if (Math.abs(px - hx) <= grab && Math.abs(py - hy) <= grab) return HANDLES[i]
  }
  return null
}

export const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
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
