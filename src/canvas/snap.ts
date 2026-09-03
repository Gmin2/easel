import type { Box } from '../doc/types'

/** a guide line, in wall coordinates, for the overlay to draw */
export interface Guide {
  axis: 'x' | 'y'
  /** where the line sits on its own axis */
  at: number
  /** the span it is drawn across, on the other axis */
  from: number
  to: number
}

export interface Snapped {
  x: number
  y: number
  guides: Guide[]
}

/** how close, in wall pixels, an edge has to be before it grabs */
const THRESHOLD = 6

interface Cand { at: number; from: number; to: number }

/**
 * Pull a moving box onto its neighbours. Edges and centres both snap, against
 * every sibling and against the containing box's own edges and centre, which
 * is what you actually reach for when centring a headline.
 *
 * Everything is top-left based and in wall coordinates, in and out.
 */
export function snap(
  box: Box, siblings: Box[], container: Box, zoom: number,
): Snapped {
  const tol = THRESHOLD / Math.max(zoom, 0.01)

  const xs: Cand[] = [
    { at: container.x, from: container.y, to: container.y + container.h },
    { at: container.x + container.w / 2, from: container.y, to: container.y + container.h },
    { at: container.x + container.w, from: container.y, to: container.y + container.h },
  ]
  const ys: Cand[] = [
    { at: container.y, from: container.x, to: container.x + container.w },
    { at: container.y + container.h / 2, from: container.x, to: container.x + container.w },
    { at: container.y + container.h, from: container.x, to: container.x + container.w },
  ]
  for (const s of siblings) {
    xs.push({ at: s.x, from: s.y, to: s.y + s.h })
    xs.push({ at: s.x + s.w / 2, from: s.y, to: s.y + s.h })
    xs.push({ at: s.x + s.w, from: s.y, to: s.y + s.h })
    ys.push({ at: s.y, from: s.x, to: s.x + s.w })
    ys.push({ at: s.y + s.h / 2, from: s.x, to: s.x + s.w })
    ys.push({ at: s.y + s.h, from: s.x, to: s.x + s.w })
  }

  /** the closest candidate to any of the three lines the box presents */
  const pick = (edges: number[], cands: Cand[]) => {
    let best: { d: number; shift: number; c: Cand } | null = null
    for (const edge of edges) {
      for (const c of cands) {
        const d = Math.abs(edge - c.at)
        if (d > tol) continue
        if (!best || d < best.d) best = { d, shift: c.at - edge, c }
      }
    }
    return best
  }

  const guides: Guide[] = []
  let x = box.x
  let y = box.y

  const hx = pick([box.x, box.x + box.w / 2, box.x + box.w], xs)
  if (hx) {
    x = box.x + hx.shift
    guides.push({
      axis: 'x', at: hx.c.at,
      from: Math.min(hx.c.from, y), to: Math.max(hx.c.to, y + box.h),
    })
  }
  const hy = pick([box.y, box.y + box.h / 2, box.y + box.h], ys)
  if (hy) {
    y = box.y + hy.shift
    guides.push({
      axis: 'y', at: hy.c.at,
      from: Math.min(hy.c.from, x), to: Math.max(hy.c.to, x + box.w),
    })
  }

  return { x, y, guides }
}
