import { create } from 'zustand'
import { setGeo } from './geo'
import { parseHtml } from './html'
import * as ops from './ops'
import * as files from '../lib/files'
import type { FileMeta } from '../lib/files'
import type { Box, Camera, Doc, Node, NodeBox, NodeType, Style, Comment } from './types'

export type Tool =
  | 'select' | 'hand' | 'artboard' | 'frame' | 'text' | 'button' | 'image' | 'comment'
  /** the two prompt tools: markup in, nodes out */
  | 'svg' | 'design'

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
  /** repeats folded into this entry, so a drag is one line and not two hundred */
  count?: number
  /** the change itself: a tool's input, or an action's arguments */
  data?: unknown
}

/**
 * Who is editing, for the duration of one call.
 *
 * Human edits are logged by wrapping the store's own actions, which means an
 * agent tool — which reaches those same actions — would be logged twice and
 * attributed wrongly. So the tool layer runs its writes inside `runAs`, and the
 * wrapper stands down while an agent is holding the pen.
 */
let actor: Source | null = null

export function runAs<T>(by: Source, run: () => T): T {
  const prev = actor
  actor = by
  try { return run() } finally { actor = prev }
}

/** actions worth a line in the activity log; the rest are camera and chrome */
const EDITS = new Set([
  'createArtboard', 'createNode', 'insertHtml', 'insertSvg', 'insertImage',
  'fitBoard', 'patchStyle',
  'setText', 'setSvg', 'rename', 'setTag', 'setProps', 'remove', 'duplicate',
  'reorder', 'move', 'group', 'ungroup', 'nudge', 'paste', 'undo', 'redo',
  'addPage', 'renamePage', 'removePage',
])

/** repeats of the same action inside this window fold into one entry */
const FOLD = 900

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
  /** the inspector on its own. ⌘\\ still hides everything */
  inspector: boolean
  /** signed out and working in this browser */
  guest: boolean
  setGuest(v: boolean): void
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

  /** 'landing' = the home page, 'editor' = full canvas */
  view: 'landing' | 'editor'
  setView(v: 'landing' | 'editor'): void

  /** the file the document belongs to; null until one is opened */
  file: FileMeta | null
  /** open a stored file in the editor. the scratchpad seeds itself */
  openFile(id: string): Promise<void>
  /** make a file and open it. no doc means one blank desktop artboard */
  newFile(name?: string, doc?: Doc): Promise<FileMeta>
  /** save, take a thumbnail, and go back to the home page */
  goHome(): Promise<void>

  select(ids: string[], additive?: boolean): void
  selectAll(): void
  setTool(t: Tool): void
  setCam(c: Camera | ((c: Camera) => Camera)): void
  setHover(id: string | null): void
  setInside(id: string | null): void
  setPanels(v: boolean): void
  setInspector(v: boolean): void
  setMenu(m: { x: number; y: number } | null): void
  setEditing(id: string | null): void
  measure(boxes: Record<string, NodeBox>): void

  createArtboard(spec: ops.ArtboardSpec): string
  addPage(name?: string): string
  renamePage(id: string, name: string): void
  removePage(id: string): void
  showPage(id: string): void
  /** the node a comment is being written for, or null */
  commentOn: string | null
  startComment(node: string | null): void
  addComment(node: string, text: string, by?: 'human' | 'agent'): string
  resolveComment(id: string, reply?: string): void
  removeComment(id: string): void
  createNode(parentId: string, type: NodeType, box: Partial<Box>): string | null
  insertHtml(parentId: string, html: string, mode?: 'insert' | 'replace'): string[]
  /** a generated vector: one node holding real svg markup */
  insertSvg(parentId: string, markup: string, box: Partial<Box>, name?: string): string | null
  /** a generated picture, source and all, as one edit */
  insertImage(parentId: string, src: string, alt: string, box: Partial<Box>, name?: string): string | null
  /** grow an artboard so nothing on it is cut off. true if it changed */
  fitBoard(id: string): boolean

  patchStyle(ids: string[], style: Style, transient?: boolean): void
  setText(id: string, text: string, transient?: boolean): void
  setSvg(id: string, markup: string): void
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

/** a file with one empty desktop artboard on it, which is what "new" means */
function blank(): Doc {
  const doc: Doc = {
    nodes: {}, artboards: [], pages: [{ id: 'page1', name: 'Page 1' }], page: 'page1',
  }
  return ops.addArtboard(doc, { name: 'Desktop', w: 1280, h: 832 }).doc
}

/**
 * A small jpeg of the first artboard, for the file card.
 *
 * Taken while the canvas is still mounted, since the nodes are the renderer:
 * once the home page is up there is nothing to draw.
 */
async function thumbnail(doc: Doc): Promise<string | null> {
  const id = doc.artboards.find(b => doc.nodes[b]?.page === doc.page) ?? doc.artboards[0]
  const el = id ? document.querySelector<HTMLElement>(`[data-easel="${id}"]`) : null
  if (!el) return null
  try {
    const { toJpeg } = await import('html-to-image')
    return await toJpeg(el, {
      pixelRatio: Math.min(1, 480 / Math.max(1, el.offsetWidth)),
      quality: 0.7,
      backgroundColor: '#ffffff',
      filter: n => !(n instanceof HTMLElement && n.dataset.easelChrome != null),
    })
  } catch {
    return null
  }
}

function seed(): Doc {
  let doc: Doc = {
    nodes: {}, artboards: [], pages: [{ id: 'page1', name: 'Page 1' }], page: 'page1',
  }
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

let saveTimer: ReturnType<typeof setTimeout> | null = null

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

  const editor: Editor = {
    doc: seed(),
    /** if the store already has seeded artboards in it (persisted state),
     *  skip the landing page so returning users land in the editor */
    view: 'landing',
    file: null,
    sel: [],
    tool: 'select',
    cam: { pan: { x: 0, y: 0 }, zoom: 1 },
    inside: null,
    hover: null,
    panels: true,
    inspector: true,
    guest: false,
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
    setInspector(inspector) { set({ inspector }) },
    setGuest(guest) { set({ guest }) },
    setMenu(menu) { set({ menu }) },
    setEditing(editing) { set({ editing }) },
    setView(view) { set({ view }) },

    async openFile(id) {
      const { meta, doc: stored } = await files.load(id)
      // the scratchpad is born empty on the server and seeded here
      const doc = 'nodes' in stored && stored.nodes ? stored as Doc : meta.scratch ? seed() : blank()
      set({
        doc, file: meta, view: 'editor',
        sel: [], inside: null, hover: null, editing: null,
        past: [], future: [], boxes: {}, touched: {},
        cam: { pan: { x: 0, y: 0 }, zoom: 1 },
      })
    },

    async newFile(name = 'Untitled', doc = blank()) {
      const meta = await files.create(name, doc)
      set({
        doc, file: meta, view: 'editor',
        sel: [], inside: null, hover: null, editing: null,
        past: [], future: [], boxes: {}, touched: {},
        cam: { pan: { x: 0, y: 0 }, zoom: 1 },
      })
      return meta
    },

    async goHome() {
      const { file, doc } = get()
      if (file) {
        const thumb = await thumbnail(doc)
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        try {
          await files.save(file.id, { doc, ...(thumb ? { thumb } : {}) })
        } catch (e) {
          get().note({ by: 'human', tool: 'save', detail: 'save failed', error: String(e) })
        }
      }
      set({ view: 'landing', file: null, sel: [], inside: null, editing: null })
    },

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

    addPage(name) {
      const made = ops.addPage(get().doc, name)
      commit(made.doc)
      set({ sel: [] })
      return made.id
    },

    renamePage(id, name) { commit(ops.renamePage(get().doc, id, name)) },

    removePage(id) {
      commit(ops.removePage(get().doc, id))
      set({ sel: [] })
    },

    showPage(id) {
      const { doc } = get()
      if (!doc.pages.some(p => p.id === id) || doc.page === id) return
      // switching pages is navigation, not an edit, so it stays off the undo
      // stack — but the selection has to go, since it is on the old wall
      set({ doc: { ...doc, page: id }, sel: [], inside: null, hover: null })
    },

    // comments are conversation, not edits: they save with the file but stay
    // off the undo stack, so ⌘Z never swallows a note someone just left
    commentOn: null,
    startComment(node) { set(node ? { commentOn: node } : { commentOn: null, tool: 'select' }) },
    addComment(node, text, by = 'human') {
      const { doc } = get()
      if (!doc.nodes[node] || !text.trim()) return ''
      const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const c: Comment = { id, node, text: text.trim(), by, at: Date.now() }
      set({ doc: { ...doc, comments: [...(doc.comments ?? []), c] }, commentOn: null, tool: 'select' })
      get().note({ by, tool: 'comment', detail: `${node}: ${text.trim().slice(0, 60)}` })
      return id
    },
    resolveComment(id, reply) {
      const { doc } = get()
      const comments = (doc.comments ?? []).map(c => c.id === id ? { ...c, resolved: true, ...(reply && { reply }) } : c)
      set({ doc: { ...doc, comments } })
    },
    removeComment(id) {
      const { doc } = get()
      set({ doc: { ...doc, comments: (doc.comments ?? []).filter(c => c.id !== id) } })
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

    /**
     * A vector lands as one node holding the markup, not as a parsed tree.
     *
     * Svg children are namespaced and their attributes are case sensitive —
     * `viewBox`, `stroke-width`, `fill-rule` — and none of that round-trips
     * through a camelCase style object. Held whole, the drawing stays exactly
     * what the model authored, is still real DOM the browser measures, and
     * still recolours from the wrapper's `color`.
     */
    insertSvg(parentId, markup, box, name) {
      const { doc } = get()
      if (!doc.nodes[parentId]) return null
      const node = ops.draft(doc, { type: 'svg', svg: markup, name }, box)
      commit(ops.addNode(doc, parentId, { ...node, text: undefined }))
      set({ sel: [node.id] })
      return node.id
    },

    /**
     * The node and its picture in one commit.
     *
     * Creating an empty image and then pointing it somewhere is two edits, so
     * one `⌘Z` would undo the picture and leave the empty node behind. A
     * generation is one intent, so it is one entry on the stack.
     */
    insertImage(parentId, src, alt, box, name) {
      const { doc } = get()
      if (!doc.nodes[parentId]) return null
      const node = ops.draft(doc, { type: 'image', props: { src, alt }, name }, box)
      commit(ops.addNode(doc, parentId, { ...node, text: undefined }))
      set({ sel: [node.id] })
      return node.id
    },

    /**
     * Grow a board to hold what is on it.
     *
     * Nothing that writes markup can know how tall its own section will be
     * until the browser has laid it out, so a generated section routinely runs
     * past the bottom of the artboard and is clipped there. This reads the
     * measured boxes afterwards and makes room, which is why it is a store
     * action rather than something each caller works out for itself.
     */
    fitBoard(id) {
      const { doc, boxes } = get()
      const board = doc.nodes[id]
      const box = boxes[id]
      if (!board || board.type !== 'artboard' || !box) return false

      const bottom = board.children.reduce((low, kid) => {
        const b = boxes[kid]
        return b ? Math.max(low, b.y - box.y + b.h) : low
      }, 0)
      if (bottom <= box.h) return false

      const height = `${Math.round(bottom + 64)}px`
      commit({
        ...doc,
        nodes: { ...doc.nodes, [id]: { ...board, style: { ...board.style, height } } },
      })
      return true
    },

    patchStyle(ids, style, transient) {
      commit(ops.patchStyle(get().doc, ids, style), transient)
    },

    setText(id, text, transient) {
      commit(ops.setText(get().doc, id, text), transient)
    },

    setSvg(id, markup) {
      const { doc } = get()
      const n = doc.nodes[id]
      if (!n) return
      commit({ ...doc, nodes: { ...doc.nodes, [id]: { ...n, svg: markup } } })
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
      const at = Date.now()
      set(s => {
        const last = s.log[s.log.length - 1]
        // a drag is one intent, however many patches it took to express
        if (last && last.by === entry.by && last.tool === entry.tool
          && !last.error && !entry.error && at - last.at < FOLD) {
          const folded = {
            ...last, at, detail: entry.detail, data: entry.data, count: (last.count ?? 1) + 1,
          }
          return { log: [...s.log.slice(0, -1), folded] }
        }
        logN += 1
        return { log: [...s.log, { ...entry, n: logN, at }].slice(-200) }
      })
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

  /**
   * Log the human's edits by wrapping the actions themselves.
   *
   * Doing it here rather than at each call site means the panels and the
   * shortcuts get attribution for free and cannot forget to ask for it, and
   * the log stays a record of the document changing rather than a record of
   * the places someone remembered to write a line.
   */
  for (const key of EDITS) {
    const name = key as keyof Editor
    const fn = editor[name]
    if (typeof fn !== 'function') continue
    const bare = fn as (...a: unknown[]) => unknown
    ;(editor[name] as unknown) = (...args: unknown[]) => {
      const out = bare(...args)
      if (!actor) {
        const ids = Array.isArray(args[0]) ? (args[0] as string[]) : []
        editor.note({
          by: 'human',
          tool: key,
          detail: ids.length ? ids.join(', ') : describeArgs(args),
          data: args.length === 1 ? args[0] : args,
        })
      }
      return out
    }
  }

  return editor
})

/** a short, honest label for whatever the action was handed */
function describeArgs(args: unknown[]): string {
  const first = args[0]
  if (typeof first === 'string') return first
  if (typeof first === 'number') return args.filter(a => typeof a === 'number').join(', ')
  if (first && typeof first === 'object') {
    const o = first as Record<string, unknown>
    if (typeof o.name === 'string') return o.name
    if (o.w != null && o.h != null) return `${o.w}×${o.h}`
  }
  return ''
}

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

/**
 * Autosave, debounced.
 *
 * Every commit already goes through the store, so saving is a subscription
 * rather than a call site in each action. Transient drags land here too, and
 * the delay folds them into one write.
 */
useEditor.subscribe((s, prev) => {
  if (s.doc === prev.doc || !s.file || s.file !== prev.file) return
  const { file, doc } = s
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    files.save(file.id, { doc }).catch(e => {
      useEditor.getState().note({ by: 'human', tool: 'save', detail: 'autosave failed', error: String(e) })
    })
  }, 800)
})
