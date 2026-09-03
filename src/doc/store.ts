import { create } from 'zustand'
import { setGeo } from './geo'
import { parseHtml } from './html'
import * as ops from './ops'
import type { Box, Camera, Doc, Node, NodeBox, NodeType, Style } from './types'

export type Tool = 'select' | 'hand' | 'artboard' | 'frame' | 'text' | 'button' | 'image'

/** who made an edit. the activity log and the node highlight both read this */
export type Source = 'human' | 'agent'

export interface LogEntry {
  n: number
  at: number
  by: Source
  /** the tool name for an agent call, or the action name for a human one */
  tool: string
  detail: string
  error?: string
}

const HISTORY = 100
/** how long an agent-written node keeps its colour, in milliseconds */
export const HIGHLIGHT = 2600

/**
 * One store, and every edit is an action on it. The UI calls these actions and
 * so does every WebMCP tool, which is the point: there is no separate agent
 * path that can drift from what the buttons do, and an agent's write is
 * undoable because it went through the same snapshot.
 */
interface Editor {
  doc: Doc
  /** selected node ids. the first is the primary, the one with handles */
  sel: string[]
  tool: Tool
  cam: Camera
  /** the container we have stepped inside; its children select directly */
  inside: string | null
  hover: string | null
  panels: boolean
  menu: { x: number; y: number } | null
  /** the text node being edited inline */
  editing: string | null
  /** measured geometry, wall coordinates, refreshed after every layout */
  boxes: Record<string, NodeBox>
  past: Doc[]
  future: Doc[]
  log: LogEntry[]
  /** node id to the time an agent last wrote it, for the highlight */
  touched: Record<string, number>

  snapshot(): void
  /** forget the last snapshot, for a gesture that was cancelled rather than
   *  finished: an escaped text edit must not leave an empty undo step */
  dropSnapshot(): void
  undo(): void
  redo(): void

  select(ids: string[], additive?: boolean): void
  selectAll(): void
  setTool(t: Tool): void
  setCam(c: Camera | ((c: Camera) => Camera)): void
  setHover(id: string | null): void
  setInside(id: string | null): void
  setPanels(v: boolean): void
  setMenu(m: { x: number; y: number } | null): void
  setEditing(id: string | null): void
  measure(boxes: Record<string, NodeBox>): void

  createArtboard(spec: ops.ArtboardSpec): string
  createNode(parentId: string, type: NodeType, box: Partial<Box>): string | null
  insertHtml(parentId: string, html: string, mode?: 'insert' | 'replace'): string[]

  patchStyle(ids: string[], style: Style, transient?: boolean): void
  setText(id: string, text: string, transient?: boolean): void
  rename(id: string, name: string): void
  setTag(id: string, tag: string): void
  setProps(id: string, props: Record<string, string>): void

  remove(ids: string[]): void
  duplicate(ids: string[]): void
  reorder(ids: string[], where: ops.Reorder): void
  move(id: string, parentId: string, before: string | null): void
  group(ids: string[]): void
  ungroup(ids: string[]): void
  nudge(dx: number, dy: number): void

  copy(): void
  paste(): void

  note(entry: Omit<LogEntry, 'n' | 'at'>): void
  touch(ids: string[]): void
}

/** the copy buffer lives outside the store: it survives a document swap and
 *  nothing renders from it */
let clip: { nodes: Node[]; roots: string[]; from: string | null } | null = null
let logN = 0

function seed(): Doc {
  let doc: Doc = { nodes: {}, artboards: [] }
  const made = ops.addArtboard(doc, { name: 'Desktop', w: 1280, h: 832 })
  doc = made.doc

  const add = (type: NodeType, box: Partial<Box>, style: Style, text?: string, name?: string) => {
    const node = ops.draft(doc, { type, style, text, name }, box)
    doc = ops.addNode(doc, made.id, node)
    return node.id
  }

  add('text', { x: 96, y: 148, w: 860 }, {
    fontSize: '76px', fontWeight: '700', lineHeight: '1.05', letterSpacing: '-0.035em',
  }, 'Design with your agent, in the page', 'Headline')

  add('text', { x: 96, y: 356, w: 620 }, {
    fontSize: '20px', fontWeight: '400', lineHeight: '1.5', letterSpacing: '0',
    color: '#5b5b60',
  }, 'A canvas of real HTML and CSS. You draw, the agent writes, and you are both editing the same nodes.', 'Subhead')

  add('button', { x: 96, y: 476 }, {}, 'Get started', 'CTA')

  return doc
}

export const useEditor = create<Editor>((set, get) => {
  /** commit a document. `transient` keeps a drag from filling the undo stack */
  const commit = (doc: Doc, transient = false) => {
    if (transient) return set({ doc })
    const { past, doc: prev } = get()
    set({
      doc,
      past: [...past, prev].slice(-HISTORY),
      future: [],
    })
  }

  return {
    doc: seed(),
    sel: [],
    tool: 'select',
    cam: { pan: { x: 0, y: 0 }, zoom: 1 },
    inside: null,
    hover: null,
    panels: true,
    menu: null,
    editing: null,
    boxes: {},
    past: [],
    future: [],
    log: [],
    touched: {},

    snapshot() {
      const { past, doc } = get()
      set({ past: [...past, doc].slice(-HISTORY), future: [] })
    },

    dropSnapshot() {
      set(s => ({ past: s.past.slice(0, -1) }))
    },

    undo() {
      const { past, future, doc } = get()
      const prev = past.at(-1)
      if (!prev) return
      set({
        doc: prev,
        past: past.slice(0, -1),
        future: [...future, doc],
        sel: get().sel.filter(id => prev.nodes[id]),
      })
    },

    redo() {
      const { past, future, doc } = get()
      const next = future.at(-1)
      if (!next) return
      set({
        doc: next,
        past: [...past, doc],
        future: future.slice(0, -1),
        sel: get().sel.filter(id => next.nodes[id]),
      })
    },

    select(ids, additive) {
      if (!additive) return set({ sel: ids })
      const cur = get().sel
      const next = [...cur]
      for (const id of ids) {
        const at = next.indexOf(id)
        if (at < 0) next.push(id)
        else next.splice(at, 1)
      }
      set({ sel: next })
    },

    selectAll() {
      const { doc, sel, inside } = get()
      // inside a container, select all of its children; otherwise everything
      // in the artboard you are working in, and failing that every artboard
      const scope = inside
        ?? (sel[0] ? ops.artboardOf(doc, sel[0]) : null)
        ?? doc.artboards[0]
      const parent = doc.nodes[scope]
      set({ sel: parent ? [...parent.children] : [...doc.artboards] })
    },

    setTool(tool) { set({ tool }) },
    setCam(c) { set(s => ({ cam: typeof c === 'function' ? c(s.cam) : c })) },
    setHover(hover) { set({ hover }) },
    setInside(inside) { set({ inside }) },
    setPanels(panels) { set({ panels }) },
    setMenu(menu) { set({ menu }) },
    setEditing(editing) { set({ editing }) },

    measure(boxes) {
      const cur = get().boxes
      const ids = Object.keys(boxes)
      if (ids.length === Object.keys(cur).length && ids.every(id => {
        const a = cur[id], b = boxes[id]
        return a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
      })) return
      set({ boxes })
    },

    createArtboard(spec) {
      const made = ops.addArtboard(get().doc, spec)
      commit(made.doc)
      set({ sel: [made.id] })
      return made.id
    },

    createNode(parentId, type, box) {
      const { doc } = get()
      if (!doc.nodes[parentId]) return null
      const node = ops.draft(doc, { type }, box)
      commit(ops.addNode(doc, parentId, node))
      set({ sel: [node.id] })
      return node.id
    },

    insertHtml(parentId, html, mode = 'insert') {
      const { doc } = get()
      const parent = doc.nodes[parentId]
      if (!parent) return []
      const { nodes, roots } = parseHtml(doc, html)
      if (!roots.length) return []

      let next: Doc = mode === 'replace'
        ? ops.removeNodes(doc, parent.children)
        : doc
      const map = { ...next.nodes }
      for (const n of nodes) map[n.id] = n
      next = { ...next, nodes: map }
      for (const r of roots) next = ops.moveNode(next, r, parentId, null)

      commit(next)
      return nodes.map(n => n.id)
    },

    patchStyle(ids, style, transient) {
      commit(ops.patchStyle(get().doc, ids, style), transient)
    },

    setText(id, text, transient) {
      commit(ops.setText(get().doc, id, text), transient)
    },

    rename(id, name) { commit(ops.renameNode(get().doc, id, name)) },
    setTag(id, tag) { commit(ops.setTag(get().doc, id, tag)) },
    setProps(id, props) { commit(ops.setProps(get().doc, id, props)) },

    remove(ids) {
      if (!ids.length) return
      commit(ops.removeNodes(get().doc, ids))
      set({ sel: [], editing: null })
    },

    duplicate(ids) {
      let doc = get().doc
      const made: string[] = []
      for (const id of ids) {
        const out = ops.duplicateNode(doc, id)
        if (!out) continue
        doc = out.doc
        made.push(out.id)
      }
      if (!made.length) return
      commit(doc)
      set({ sel: made })
    },

    reorder(ids, where) {
      let doc = get().doc
      for (const id of ids) doc = ops.reorderNode(doc, id, where)
      commit(doc)
    },

    move(id, parentId, before) {
      commit(ops.moveNode(get().doc, id, parentId, before))
    },

    group(ids) {
      const { doc, boxes } = get()
      const local = localBoxes(doc, boxes, ids)
      const made = ops.groupNodes(doc, ids, local)
      if (!made) return
      commit(made.doc)
      set({ sel: [made.id] })
    },

    ungroup(ids) {
      const { doc, boxes } = get()
      const kids = ids.flatMap(id => doc.nodes[id]?.children ?? [])
      const local = localBoxes(doc, boxes, kids, 1)
      const made = ops.ungroupNodes(doc, ids, local)
      if (!made) return
      commit(made.doc)
      set({ sel: made.ids })
    },

    nudge(dx, dy) {
      const { doc, sel, boxes } = get()
      const movable = sel.filter(id => doc.nodes[id] && doc.nodes[id].type !== 'artboard')
      if (!movable.length) return
      let next = doc
      for (const id of movable) {
        const n = next.nodes[id]
        const b = boxes[id]
        const x = numOr(n.style.left, b ? b.x : 0) + dx
        const y = numOr(n.style.top, b ? b.y : 0) + dy
        next = ops.patchStyle(next, [id], { position: 'absolute', ...setGeo({ x, y }) })
      }
      commit(next)
    },

    copy() {
      const { doc, sel } = get()
      // a node already covered by a selected ancestor would paste twice
      const roots = sel.filter(id => !ops.ancestors(doc, id).some(a => sel.includes(a)))
      if (!roots.length) return
      const nodes: Node[] = []
      const ids: string[] = []
      let scratch = doc
      for (const id of roots) {
        const made = ops.cloneSubtree(scratch, id)
        if (!made) continue
        const map = { ...scratch.nodes }
        for (const n of made.nodes) map[n.id] = n
        scratch = { ...scratch, nodes: map }
        nodes.push(...made.nodes)
        ids.push(made.root)
      }
      clip = { nodes, roots: ids, from: doc.nodes[roots[0]].parent }
    },

    paste() {
      if (!clip) return
      const { doc, sel, inside } = get()
      const target = pasteTarget(doc, sel, inside) ?? doc.artboards[0]
      if (!target) return

      // fresh ids again, so pasting twice does not collide
      let scratch: Doc = { ...doc, nodes: { ...doc.nodes } }
      for (const n of clip.nodes) scratch.nodes[n.id] = n
      const same = clip.from === target

      let next = doc
      const made: string[] = []
      for (const root of clip.roots) {
        const copy = ops.cloneSubtree(scratch, root, same ? 24 : 0)
        if (!copy) continue
        const map = { ...next.nodes }
        for (const n of copy.nodes) map[n.id] = n
        next = { ...next, nodes: map }
        next = ops.moveNode(next, copy.root, target, null)
        made.push(copy.root)
      }
      if (!made.length) return
      commit(next)
      set({ sel: made })
    },

    note(entry) {
      logN += 1
      set(s => ({ log: [...s.log, { ...entry, n: logN, at: Date.now() }].slice(-200) }))
    },

    touch(ids) {
      const at = Date.now()
      set(s => ({
        touched: { ...s.touched, ...Object.fromEntries(ids.map(id => [id, at])) },
      }))
      // the highlight has to expire on its own: nothing else is going to
      // re-render these nodes once the write has landed
      setTimeout(() => set(s => {
        const next = { ...s.touched }
        for (const id of ids) if (next[id] === at) delete next[id]
        return { touched: next }
      }), HIGHLIGHT)
    },
  }
})

const numOr = (v: string | undefined, fallback: number) => {
  const m = /^(-?[\d.]+)px$/.exec((v ?? '').trim())
  return m ? Number(m[1]) : fallback
}

/**
 * Measured boxes rewritten into a parent's coordinate space. Grouping and
 * ungrouping both need it: the wall coordinates the canvas measures are
 * absolute, but css offsets are relative to whatever box contains them.
 */
function localBoxes(
  doc: Doc, boxes: Record<string, NodeBox>, ids: string[], up = 0,
): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const id of ids) {
    const b = boxes[id]
    if (!b) continue
    let host = doc.nodes[id]?.parent ?? null
    for (let i = 0; i < up && host; i++) host = doc.nodes[host]?.parent ?? null
    const origin = host ? boxes[host] : null
    out[id] = origin
      ? { x: b.x - origin.x, y: b.y - origin.y, w: b.w, h: b.h }
      : { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return out
}

/** where a paste lands: inside what you have opened, or beside what is picked */
function pasteTarget(doc: Doc, sel: string[], inside: string | null): string | null {
  if (inside && doc.nodes[inside]) return inside
  const first = sel[0] ? doc.nodes[sel[0]] : null
  if (!first) return null
  if (first.type === 'artboard' || first.type === 'frame') return first.id
  return first.parent
}
