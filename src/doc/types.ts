/**
 * The document.
 *
 * A node is a real HTML element: a tag, some attributes, a plain CSS object
 * and children. The canvas renders the tree as DOM, so what you see is what
 * `toHtml` gives back and what an agent reads through `get_html`. There is no
 * second representation to keep in sync.
 *
 * The tree is stored flat, id to node, with children held as id lists. Ids are
 * the only way anything refers to anything else: an agent can hold one across
 * many calls, lookups are O(1), and reparenting is a pointer change.
 */

export type NodeType = 'artboard' | 'frame' | 'text' | 'image' | 'button' | 'link' | 'svg'

/** camelCase css, exactly as react wants it, converted on html export */
export type Style = Record<string, string>

export interface Node {
  id: string
  type: NodeType
  /** what the layers panel shows; free for a human or an agent to rename */
  name: string
  /** the element actually rendered: div, h1, p, button, a, img */
  tag: string
  /** attributes other than style: href, src, alt, placeholder */
  props: Record<string, string>
  style: Style
  /** leaf text content. only meaningful when there are no children */
  text?: string
  /**
   * Raw inline svg markup, for `svg` nodes only.
   *
   * A generated vector stays vector: the wrapper is a real div and this is the
   * real `<svg>` inside it, so it is inspectable, restylable through `color`
   * and `fill`, and it exports as markup rather than as pixels. It is held
   * whole rather than parsed into child nodes because svg attributes are
   * namespaced and case sensitive — `viewBox`, `stroke-width`, `fill-rule` —
   * and none of that survives our camelCase style handling intact.
   */
  svg?: string
  children: string[]
  /** null for artboards, which hang off the document root */
  parent: string | null
  /** artboards only: which page's wall this board sits on */
  page?: string
}

/**
 * A named wall of artboards.
 *
 * Pages are a filter, not a second tree: `artboards` still lists every board
 * in the file and each board records which page it belongs to. So nothing that
 * walks the document has to learn about pages, undo keeps working unchanged,
 * and an agent can address any board on any page by id without switching to it
 * first.
 */
export interface Page {
  id: string
  name: string
}

/**
 * A note pinned to a node. This is how a person hands work to an agent
 * without describing where: the pin already says which node. An agent lists
 * the open ones, does the work with the other tools, and resolves with a
 * reply that shows under the pin.
 */
export interface Comment {
  id: string
  node: string
  text: string
  by: 'human' | 'agent'
  at: number
  resolved?: boolean
  reply?: string
}

export interface Doc {
  nodes: Record<string, Node>
  comments?: Comment[]
  /** artboard ids, in the order they sit on the wall */
  artboards: string[]
  pages: Page[]
  /** the page the wall is showing */
  page: string
}

/** a box in some coordinate space, top-left based the way css is */
export interface Box { x: number; y: number; w: number; h: number }

export interface Camera {
  /** screen pixels the world origin is offset by */
  pan: { x: number; y: number }
  zoom: number
}

/** one measured node, in wall coordinates, for the overlay and for snapping */
export interface NodeBox extends Box {
  id: string
  /** the artboard this node lives under */
  artboard: string
}

export const isContainer = (n: Node) =>
  n.type === 'artboard' || n.type === 'frame'

/** text lives in the node itself, not in a child */
export const isLeaf = (n: Node) =>
  n.type === 'text' || n.type === 'image'
