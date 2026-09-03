import type { Box, Node, Style } from './types'

/**
 * Geometry is css, not a parallel set of fields.
 *
 * A node's position and size live in `style.left/top/width/height`, so a drag
 * and a hand-typed `left: 40px` are the same edit and the html export is
 * always exactly what is on screen. These helpers are the only place that
 * knows how to read a length back out of a string.
 */

/** a css length in pixels, or null if it is auto, a percentage, or missing */
export function px(v: string | undefined): number | null {
  if (!v) return null
  const m = /^(-?[\d.]+)px$/.exec(v.trim())
  return m ? Number(m[1]) : null
}

export const toPx = (n: number) => `${Math.round(n * 100) / 100}px`

/** what the document says about a node's box, before the browser lays it out */
export function geoOf(n: Node): Partial<Box> {
  const x = px(n.style.left)
  const y = px(n.style.top)
  const w = px(n.style.width)
  const h = px(n.style.height)
  return {
    ...(x != null && { x }),
    ...(y != null && { y }),
    ...(w != null && { w }),
    ...(h != null && { h }),
  }
}

/** a node the editor can move and resize by editing left/top/width/height */
export const isFreeform = (n: Node) => n.style.position === 'absolute'

export function setGeo(b: Partial<Box>): Style {
  return {
    ...(b.x != null && { left: toPx(b.x) }),
    ...(b.y != null && { top: toPx(b.y) }),
    ...(b.w != null && { width: toPx(b.w) }),
    ...(b.h != null && { height: toPx(b.h) }),
  }
}

/** the union of some boxes, which is what a group has to cover */
export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

export const hits = (b: Box, x: number, y: number) =>
  x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h
