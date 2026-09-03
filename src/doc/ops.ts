import { setGeo, toPx, unionBox } from './geo'
import { freshId, prefixFor } from './ids'
import type { Box, Doc, Node, NodeType, Style } from './types'

/**
 * Every operation returns a new document and never mutates the one it was
 * given, so an undo snapshot is just the previous reference and the store can
 * hand React a changed object without copying the whole tree.
 */

const put = (doc: Doc, ...nodes: Node[]): Doc => {
  const next = { ...doc, nodes: { ...doc.nodes } }
  for (const n of nodes) next.nodes[n.id] = n
  return next
}

export const nodeOf = (doc: Doc, id: string): Node | null => doc.nodes[id] ?? null

/** the artboard a node lives under, following parents up */
export function artboardOf(doc: Doc, id: string): string | null {
  let cur = doc.nodes[id]
  while (cur) {
    if (cur.type === 'artboard') return cur.id
    if (!cur.parent) return null
    cur = doc.nodes[cur.parent]
  }
  return null
}

export function ancestors(doc: Doc, id: string): string[] {
  const out: string[] = []
  let cur = doc.nodes[id]?.parent
  while (cur) {
    out.push(cur)
    cur = doc.nodes[cur]?.parent
  }
  return out
}

/** every id under a node, the node itself excluded */
export function descendants(doc: Doc, id: string): string[] {
  const out: string[] = []
  const walk = (nid: string) => {
    for (const c of doc.nodes[nid]?.children ?? []) {
      out.push(c)
      walk(c)
    }
  }
  walk(id)
  return out
}

/** depth-first ids under a node, the node included, in paint order */
export function subtree(doc: Doc, id: string): string[] {
  return [id, ...descendants(doc, id)]
}

export function countNodes(doc: Doc, id: string): number {
  return descendants(doc, id).length
}

// ---------------------------------------------------------------- factories

const TAGS: Record<NodeType, string> = {
  artboard: 'div',
  frame: 'div',
  text: 'p',
  image: 'img',
  button: 'button',
  link: 'a',
  svg: 'div',
}

export interface Draft {
  type: NodeType
  tag?: string
  name?: string
  style?: Style
  props?: Record<string, string>
  text?: string
  /** raw inline svg markup, for `svg` nodes */
  svg?: string
  /**
   * Take the style exactly as given, with none of the editor's opening
   * defaults. Html arriving from an agent already carries its own css, and
   * whatever it leaves out is meant to inherit — dropping a `position:
   * absolute` on top of a flex row would quietly break the layout it asked
   * for.
   */
  bare?: boolean
}

/** the css a freshly drawn node of each kind starts with */
function defaults(type: NodeType, box: Partial<Box>): Style {
  const geo = setGeo(box)
  switch (type) {
    case 'frame':
      return {
        position: 'absolute', ...geo,
        background: '#e9e9ea', borderRadius: '8px',
      }
    case 'text':
      return {
        position: 'absolute', left: geo.left ?? '0px', top: geo.top ?? '0px',
        ...(geo.width && { width: geo.width }),
        margin: '0', fontFamily: 'Inter, sans-serif', fontSize: '40px',
        fontWeight: '600', lineHeight: '1.15', letterSpacing: '-0.02em',
        color: '#111111',
      }
    case 'button':
      return {
        position: 'absolute', left: geo.left ?? '0px', top: geo.top ?? '0px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '14px 24px', border: 'none', borderRadius: '8px',
        background: '#111111', color: '#ffffff',
        fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600',
        cursor: 'pointer',
      }
    case 'link':
      return {
        position: 'absolute', left: geo.left ?? '0px', top: geo.top ?? '0px',
        margin: '0', fontFamily: 'Inter, sans-serif', fontSize: '16px',
        fontWeight: '500', color: '#2d52f0', textDecoration: 'underline',
      }
    case 'image':
      return {
        position: 'absolute', ...geo,
        objectFit: 'cover', borderRadius: '8px', display: 'block',
      }
    case 'svg':
      // the wrapper only positions the vector; `color` is here because the
      // markup we generate paints with currentColor, so recolouring the whole
      // drawing is one css property on this node
      return {
        position: 'absolute', ...geo,
        display: 'block', color: '#111111',
      }
    case 'artboard':
      return {
        position: 'relative', ...geo,
        background: '#ffffff', overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
      }
  }
}

const DEFAULT_TEXT: Partial<Record<NodeType, string>> = {
  text: 'Text',
  button: 'Button',
  link: 'Link',
}

/** a node that does not belong to a document yet; the caller inserts it */
export function draft(doc: Doc, d: Draft, box: Partial<Box> = {}): Node {
  const id = freshId(doc, prefixFor(d.type))
  return {
    id,
    type: d.type,
    name: d.name ?? id,
    tag: d.tag ?? TAGS[d.type],
    props: d.props ?? (d.type === 'image' ? { src: '', alt: '' } : {}),
    style: d.bare ? { ...d.style } : { ...defaults(d.type, box), ...d.style },
    text: d.bare ? d.text : d.text ?? DEFAULT_TEXT[d.type],
    ...(d.svg != null && { svg: d.svg }),
    children: [],
    parent: null,
  }
}

// ------------------------------------------------------------------- insert

export function addNode(
  doc: Doc, parentId: string, node: Node, index?: number,
): Doc {
  const parent = doc.nodes[parentId]
  if (!parent) return doc
  const kids = [...parent.children]
  kids.splice(index ?? kids.length, 0, node.id)
  return put(doc,
    { ...node, parent: parentId },
    { ...parent, children: kids })
}

/** many nodes into one parent, ids already unique against the document */
export function addNodes(doc: Doc, parentId: string, nodes: Node[]): Doc {
  return nodes.reduce((d, n) => addNode(d, parentId, n), doc)
}

export interface ArtboardSpec {
  name?: string
  w: number
  h: number
  background?: string
  /** which page's wall it lands on. defaults to the one being shown */
  page?: string
}

export function addArtboard(doc: Doc, spec: ArtboardSpec): { doc: Doc; id: string } {
  const node = draft(doc, {
    type: 'artboard',
    name: spec.name,
    style: { ...(spec.background && { background: spec.background }) },
  }, { w: spec.w, h: spec.h })
  const next: Doc = {
    ...doc,
    nodes: {
      ...doc.nodes,
      [node.id]: { ...node, text: undefined, page: spec.page ?? doc.page },
    },
    artboards: [...doc.artboards, node.id],
  }
  return { doc: next, id: node.id }
}

// -------------------------------------------------------------------- pages

/** the boards on one page, in wall order */
export const boardsOn = (doc: Doc, page: string = doc.page) =>
  doc.artboards.filter(id => (doc.nodes[id]?.page ?? doc.pages[0]?.id) === page)

export function addPage(doc: Doc, name?: string): { doc: Doc; id: string } {
  const n = doc.pages.length + 1
  const id = `page${n}`
  return {
    doc: { ...doc, pages: [...doc.pages, { id, name: name ?? `Page ${n}` }], page: id },
    id,
  }
}

export function renamePage(doc: Doc, id: string, name: string): Doc {
  return { ...doc, pages: doc.pages.map(p => (p.id === id ? { ...p, name } : p)) }
}

/** the last page cannot go, and its boards go with it */
export function removePage(doc: Doc, id: string): Doc {
  if (doc.pages.length < 2) return doc
  const gone = removeNodes(doc, boardsOn(doc, id))
  const pages = doc.pages.filter(p => p.id !== id)
  return { ...gone, pages, page: pages[0].id }
}

// ------------------------------------------------------------------- remove

export function removeNodes(doc: Doc, ids: string[]): Doc {
  const drop = new Set<string>()
  for (const id of ids) for (const s of subtree(doc, id)) drop.add(s)

  const nodes: Record<string, Node> = {}
  for (const [id, n] of Object.entries(doc.nodes)) {
    if (drop.has(id)) continue
    nodes[id] = n.children.some(c => drop.has(c))
      ? { ...n, children: n.children.filter(c => !drop.has(c)) }
      : n
  }
  return { ...doc, nodes, artboards: doc.artboards.filter(id => !drop.has(id)) }
}

// ---------------------------------------------------------------- duplicate

/**
 * A subtree copied with fresh ids throughout. Ids are never shared between a
 * copy and its original: an agent holding one must not find itself editing
 * two nodes at once.
 */
export function cloneSubtree(
  doc: Doc, id: string, offset = 0,
): { nodes: Node[]; root: string } | null {
  const src = doc.nodes[id]
  if (!src) return null

  const made: Node[] = []
  const taken = { ...doc.nodes }

  const walk = (nid: string, parent: string | null): string => {
    const n = taken[nid] ?? doc.nodes[nid]
    let fresh = 1
    const base = prefixFor(n.type)
    while (taken[`${base}${fresh}`]) fresh++
    const newId = `${base}${fresh}`
    const copy: Node = { ...n, id: newId, parent, children: [], style: { ...n.style }, props: { ...n.props } }
    taken[newId] = copy
    made.push(copy)
    copy.children = n.children.map(c => walk(c, newId))
    return newId
  }

  const root = walk(id, src.parent)
  if (offset) {
    const r = made.find(n => n.id === root)!
    const left = Number(/^(-?[\d.]+)px$/.exec(r.style.left ?? '')?.[1] ?? NaN)
    const top = Number(/^(-?[\d.]+)px$/.exec(r.style.top ?? '')?.[1] ?? NaN)
    if (!Number.isNaN(left)) r.style.left = toPx(left + offset)
    if (!Number.isNaN(top)) r.style.top = toPx(top + offset)
  }
  return { nodes: made, root }
}

export function duplicateNode(
  doc: Doc, id: string, offset = 24,
): { doc: Doc; id: string } | null {
  const src = doc.nodes[id]
  if (!src) return null
  const made = cloneSubtree(doc, id, offset)
  if (!made) return null

  const nodes = { ...doc.nodes }
  for (const n of made.nodes) nodes[n.id] = n

  if (src.type === 'artboard') {
    const at = doc.artboards.indexOf(id)
    const artboards = [...doc.artboards]
    artboards.splice(at + 1, 0, made.root)
    // a copied board belongs to the same page as the one it came from
    nodes[made.root] = { ...nodes[made.root], page: src.page ?? doc.page }
    return { doc: { ...doc, nodes, artboards }, id: made.root }
  }

  const parent = nodes[src.parent!]
  const kids = [...parent.children]
  kids.splice(kids.indexOf(id) + 1, 0, made.root)
  nodes[parent.id] = { ...parent, children: kids }
  return { doc: { ...doc, nodes, artboards: doc.artboards }, id: made.root }
}

// ------------------------------------------------------------------ z-order

export type Reorder = 'front' | 'back' | 'up' | 'down'

/**
 * Paint order is document order: a later sibling draws over an earlier one,
 * for absolute children as much as for flow ones. So bring-forward is a swap
 * towards the end of the list.
 */
export function reorderNode(doc: Doc, id: string, where: Reorder): Doc {
  const node = doc.nodes[id]
  if (!node) return doc

  if (node.type === 'artboard') {
    const list = [...doc.artboards]
    const at = list.indexOf(id)
    const to = where === 'front' ? list.length - 1 : where === 'back' ? 0
      : where === 'up' ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1)
    if (at < 0 || at === to) return doc
    list.splice(at, 1)
    list.splice(to, 0, id)
    return { ...doc, artboards: list }
  }

  const parent = doc.nodes[node.parent!]
  if (!parent) return doc
  const kids = [...parent.children]
  const at = kids.indexOf(id)
  const to = where === 'front' ? kids.length - 1 : where === 'back' ? 0
    : where === 'up' ? Math.min(kids.length - 1, at + 1) : Math.max(0, at - 1)
  if (at < 0 || at === to) return doc
  kids.splice(at, 1)
  kids.splice(to, 0, id)
  return put(doc, { ...parent, children: kids })
}

/** reparent or reorder. `before` null means last */
export function moveNode(
  doc: Doc, id: string, parentId: string, before: string | null,
): Doc {
  const node = doc.nodes[id]
  const parent = doc.nodes[parentId]
  if (!node || !parent || id === parentId) return doc
  // a node cannot be moved inside itself
  if (ancestors(doc, parentId).includes(id)) return doc

  let next = doc
  if (node.parent) {
    const old = next.nodes[node.parent]
    next = put(next, { ...old, children: old.children.filter(c => c !== id) })
  }
  const kids = [...next.nodes[parentId].children].filter(c => c !== id)
  const at = before ? kids.indexOf(before) : kids.length
  kids.splice(at < 0 ? kids.length : at, 0, id)
  return put(next,
    { ...next.nodes[id], parent: parentId },
    { ...next.nodes[parentId], children: kids })
}

// ------------------------------------------------------------------- groups

/**
 * Grouping wraps the selection in a real frame and rewrites the members'
 * offsets to be relative to it, because that is what nesting means in css.
 * `local` carries each member's measured box in the shared parent's space,
 * since a text node's height is whatever the browser decided.
 */
export function groupNodes(
  doc: Doc, ids: string[], local: Record<string, Box>,
): { doc: Doc; id: string } | null {
  const members = ids.map(id => doc.nodes[id]).filter(Boolean)
  if (members.length < 2) return null
  const parentId = members[0].parent
  if (!parentId || members.some(m => m.parent !== parentId)) return null

  const boxes = members.map(m => local[m.id]).filter(Boolean)
  if (boxes.length !== members.length) return null
  const box = unionBox(boxes)!

  const frame = draft(doc, {
    type: 'frame',
    name: 'Group',
    style: { background: 'transparent', borderRadius: '0px' },
  }, box)

  // the frame lands where the frontmost member was, so the group keeps its
  // place in the stack rather than jumping to the top
  const siblings = doc.nodes[parentId].children
  const front = Math.max(...members.map(m => siblings.indexOf(m.id)))

  let next = addNode(doc, parentId, { ...frame, text: undefined }, front + 1)
  for (const m of members) {
    const b = local[m.id]
    next = put(next, {
      ...next.nodes[m.id],
      style: { ...next.nodes[m.id].style, ...setGeo({ x: b.x - box.x, y: b.y - box.y }) },
    })
    next = moveNode(next, m.id, frame.id, null)
  }
  return { doc: next, id: frame.id }
}

export function ungroupNodes(
  doc: Doc, ids: string[], local: Record<string, Box>,
): { doc: Doc; ids: string[] } | null {
  const frames = ids.map(id => doc.nodes[id]).filter(n => n && n.type === 'frame')
  if (!frames.length) return null

  let next = doc
  const freed: string[] = []
  for (const frame of frames) {
    const parentId = frame.parent
    if (!parentId) continue
    const at = next.nodes[parentId].children.indexOf(frame.id)
    const kids = [...frame.children]
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i]
      const b = local[kid]
      if (b) {
        next = put(next, {
          ...next.nodes[kid],
          style: { ...next.nodes[kid].style, ...setGeo({ x: b.x, y: b.y }) },
        })
      }
      next = moveNode(next, kid, parentId,
        next.nodes[parentId].children[at + i] ?? null)
      freed.push(kid)
    }
    next = removeNodes(next, [frame.id])
  }
  return { doc: next, ids: freed }
}

// -------------------------------------------------------------------- style

export function patchStyle(doc: Doc, ids: string[], style: Style): Doc {
  const touched = ids.map(id => doc.nodes[id]).filter(Boolean)
  if (!touched.length) return doc
  return put(doc, ...touched.map(n => {
    const merged = { ...n.style, ...style }
    // an empty string means "drop this property", which is how the inspector
    // clears a shadow without inventing a null in the css object
    for (const [k, v] of Object.entries(style)) if (v === '') delete merged[k]
    return { ...n, style: merged }
  }))
}

export function setText(doc: Doc, id: string, text: string): Doc {
  const n = doc.nodes[id]
  return n ? put(doc, { ...n, text }) : doc
}

export function renameNode(doc: Doc, id: string, name: string): Doc {
  const n = doc.nodes[id]
  return n ? put(doc, { ...n, name: name.trim() || n.id }) : doc
}

export function setTag(doc: Doc, id: string, tag: string): Doc {
  const n = doc.nodes[id]
  return n ? put(doc, { ...n, tag }) : doc
}

export function setProps(doc: Doc, id: string, props: Record<string, string>): Doc {
  const n = doc.nodes[id]
  if (!n) return doc
  const merged = { ...n.props, ...props }
  for (const [k, v] of Object.entries(props)) if (v === '') delete merged[k]
  return put(doc, { ...n, props: merged })
}
