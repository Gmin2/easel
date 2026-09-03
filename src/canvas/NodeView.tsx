import { createElement, useEffect, useRef } from 'react'
import { useEditor } from '../doc/store'
import type { Node } from '../doc/types'

/**
 * A node, rendered as the element it says it is.
 *
 * This is the whole reason the editor is worth building on WebMCP: there is no
 * intermediate picture of the design. The thing you drag is an `<h1>`, the
 * thing an agent restyles is the same `<h1>`, and `get_html` reads it straight
 * back out.
 */

const VOID = new Set(['img', 'br', 'hr', 'input', 'source'])

/** an image with nothing in it yet still needs to be visible and grabbable */
const EMPTY_IMAGE = {
  backgroundColor: '#e4e4e7',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(0,0,0,.05) 0 8px, transparent 8px 16px)',
}

export default function NodeView({ id }: { id: string }) {
  const node = useEditor(s => s.doc.nodes[id])
  const editing = useEditor(s => s.editing === id)
  /** set by an agent write and cleared by the store once it has faded */
  const fresh = useEditor(s => s.touched[id] != null)

  if (!node) return null
  if (editing && node.type !== 'image') return <Editable node={node} />

  const style = { ...node.style }
  if (node.type === 'image' && !node.props.src) Object.assign(style, EMPTY_IMAGE)
  // a node an agent just wrote carries its colour, so you can see what landed
  // without reading the log
  if (fresh) {
    style.outline = '2px solid var(--color-agent)'
    style.outlineOffset = '1px'
  }

  const attrs: Record<string, unknown> = {
    ...node.props,
    style,
    'data-easel': node.id,
    ...(node.type === 'artboard' && { 'data-artboard': node.id }),
    className: node.type === 'artboard' ? 'easel-node easel-artboard' : 'easel-node',
  }

  if (VOID.has(node.tag)) return createElement(node.tag, attrs)

  // a generated vector is real markup in the page, so it measures, scales and
  // recolours like anything else here. it is sanitised on the way in — twice,
  // once on the server and once in lib/clean — because this is the one place
  // in the editor where a string becomes DOM without being parsed into nodes
  if (node.svg != null) {
    return createElement(node.tag, {
      ...attrs,
      dangerouslySetInnerHTML: { __html: node.svg },
    })
  }

  return createElement(
    node.tag,
    attrs,
    node.children.length
      ? node.children.map(c => <NodeView key={c} id={c} />)
      : node.text,
  )
}

/**
 * Inline editing happens in the node itself rather than in a field floating
 * over it, so the type you are editing is the type you will ship: same font,
 * same width, same wrapping, at whatever zoom you are at.
 *
 * The element is uncontrolled on purpose. Re-rendering text from state while
 * a caret is in it moves the caret, so the document is told about every
 * keystroke but never tells the element anything back.
 */
function Editable({ node }: { node: Node }) {
  const ref = useRef<HTMLElement | null>(null)
  const original = useRef(node.text ?? '')
  const setText = useEditor(s => s.setText)
  const setEditing = useEditor(s => s.setEditing)
  const dropSnapshot = useEditor(s => s.dropSnapshot)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = original.current
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [])

  const done = (commit: boolean) => {
    const el = ref.current
    if (!commit) {
      setText(node.id, original.current, true)
      dropSnapshot()
    } else if (el) {
      setText(node.id, el.textContent ?? '', true)
    }
    setEditing(null)
  }

  return createElement(node.tag, {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    'data-easel': node.id,
    className: 'easel-node',
    style: { ...node.style, userSelect: 'text', cursor: 'text', outline: 'none' },
    onInput: (e: React.FormEvent<HTMLElement>) =>
      setText(node.id, e.currentTarget.textContent ?? '', true),
    onBlur: () => done(true),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); done(false) }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true) }
    },
  })
}
