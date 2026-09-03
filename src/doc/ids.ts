import type { Doc, NodeType } from './types'

/**
 * Short, stable, never reused while the document holds them. An agent can
 * write down `text3` at the start of a conversation and still mean the same
 * node ten calls later, which is the whole reason the ids are readable rather
 * than uuids.
 */
export function freshId(doc: Doc, base: string): string {
  let n = 1
  while (doc.nodes[`${base}${n}`]) n++
  return `${base}${n}`
}

/** n ids at once, for a subtree that does not exist in the document yet */
export function freshIds(doc: Doc, base: string, count: number): string[] {
  const out: string[] = []
  let n = 1
  while (out.length < count) {
    const id = `${base}${n}`
    if (!doc.nodes[id] && !out.includes(id)) out.push(id)
    n++
  }
  return out
}

const PREFIX: Record<NodeType, string> = {
  artboard: 'board',
  frame: 'frame',
  text: 'text',
  image: 'image',
  button: 'button',
  link: 'link',
  svg: 'svg',
}

export const prefixFor = (type: NodeType) => PREFIX[type]
