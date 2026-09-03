import { px } from '../doc/geo'
import type { Box, Doc } from '../doc/types'

/**
 * The wall: artboards in a row, left to right, in the order the document
 * holds them. Positions are derived rather than stored, so adding a board
 * never leaves the wall untidy and there is no third kind of coordinate for
 * an agent to reason about.
 *
 * Measurements are in wall pixels, which the camera scales.
 */
export const GAP_X = 180
/** screen pixels kept clear above each board for its name */
export const HEADER = 30

export interface Board extends Box {
  id: string
  name: string
  index: number
}

const DEFAULT: Box = { x: 0, y: 0, w: 1280, h: 832 }

export function wall(doc: Doc, measured: Record<string, Box> = {}) {
  const boards: Board[] = []
  let x = 0
  doc.artboards.forEach((id, index) => {
    const n = doc.nodes[id]
    if (!n) return
    const w = px(n.style.width) ?? measured[id]?.w ?? DEFAULT.w
    const h = px(n.style.height) ?? measured[id]?.h ?? DEFAULT.h
    boards.push({ id, name: n.name, index, x, y: 0, w, h })
    x += w + GAP_X
  })
  return {
    boards,
    w: Math.max(0, x - GAP_X),
    h: Math.max(0, ...boards.map(b => b.h)),
  }
}

export const boardOf = (boards: Board[], id: string) => boards.find(b => b.id === id)
