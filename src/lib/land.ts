// a design landing as it is written, shared by the canvas prompt bar and the
// home prompt. see api/_stream.ts for the other half

import * as clean from './clean'
import * as stream from './stream'
import { tokensOf } from './tokens'
import { useEditor } from '../doc/store'

const num = (v: string | undefined) => Number(/^(-?[\d.]+)/.exec((v ?? '').trim())?.[1] ?? 0)
const settle = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/**
 * A design landing as it is written.
 *
 * The root arrives first and goes on the board empty; every child is
 * inserted under it as its markup completes, and the agent's cursor moves to
 * each one. The whole thing stays one undo step: the first insert is the
 * step and every later one drops its own history entry.
 */
export async function landStream(prompt: string, provider: string | null, board: string, at: { x: number; y: number; w: number }, fit: (board: string) => void) {
  const s = useEditor.getState
  const node = s().doc.nodes[board]
  let root: string | null = null
  let label = 'agent'
  let count = 0
  const place = (b: { x: number; y: number; w: number; h: number }, busy: boolean) =>
    s().setCursor({ x: b.x + Math.min(24, b.w / 2), y: b.y + Math.min(18, b.h / 2), label, busy })
  s().setCursor({ x: at.x + 24, y: at.y + 24, label, busy: true })
  try {
    await stream.design({
      prompt, width: at.w,
      height: Math.round(num(node.style.height)) || undefined,
      tokens: tokensOf(node.style),
      ...(provider ? { provider } : {}),
      ...(s().file ? { fileId: s().file!.id } : {}),
    }, {
      meta: m => { label = m.label; s().setCursor({ x: at.x + 24, y: at.y + 24, label, busy: true }) },
      open: html => {
        // the opening tag closed by hand makes a valid, empty root
        const tag = /^<\s*([a-zA-Z][\w:-]*)/.exec(html)?.[1] ?? 'div'
        const placed = clean.place(clean.fragment(`${html}</${tag}>`), { x: at.x, y: at.y, w: at.w, name: `${label} — ${prompt.slice(0, 24)}` })
        const ids = s().insertHtml(board, placed)
        if (count++) s().dropSnapshot()
        root = ids.find(id => s().doc.nodes[id]?.parent === board) ?? ids[0] ?? null
      },
      node: html => {
        if (!root) return
        const ids = s().insertHtml(root, clean.fragment(html))
        s().dropSnapshot()
        if (ids[0]) {
          s().touch(ids)
          // the box is measured in a layout effect after the commit, which
          // can be a few frames out; wait for it rather than guess
          let tries = 0
          const follow = () => {
            const b = s().boxes[ids[0]]
            if (b) place(b, true)
            else if (tries++ < 12) requestAnimationFrame(follow)
          }
          requestAnimationFrame(follow)
        }
      },
    })
  } finally {
    const b = root ? s().boxes[root] : undefined
    if (b) s().setCursor({ x: b.x + b.w - 8, y: b.y + b.h - 8, label, busy: false })
    setTimeout(() => { if (!s().cursor?.busy) s().setCursor(null) }, 1800)
  }
  if (!root) throw new Error(`${label} returned markup with no elements in it.`)
  await settle()
  fit(board)
  s().select([root])
  void s().refreshThumb()
  const made = s().doc.nodes[root]?.children.length ?? 0
  return `${made + 1} nodes from ${label}, as they were written. ⌘Z undoes it.`
}
