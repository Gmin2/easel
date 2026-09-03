import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../doc/store'
import type { Camera, Comment } from '../doc/types'

const NONE: Comment[] = []

/**
 * Comment pins, drawn in screen space over the canvas.
 *
 * A pin sits at the top right corner of its node. Open ones are ink, resolved
 * ones fade and carry the reply. The draft box appears when a comment is being
 * written for the selected node (press C), and lands with Enter.
 */
export default function Pins({ cam }: { cam: Camera }) {
  // selected as stored, since a fresh [] on every read would re-render forever
  const stored = useEditor(s => s.doc.comments)
  const comments = stored ?? NONE
  const boxes = useEditor(s => s.boxes)
  const commentOn = useEditor(s => s.commentOn)
  const [open, setOpen] = useState<string | null>(null)
  const sx = (x: number) => x * cam.zoom + cam.pan.x
  const sy = (y: number) => y * cam.zoom + cam.pan.y

  const onPage = useEditor(s => s.doc.page)
  const nodes = useEditor(s => s.doc.nodes)
  const visible = comments.filter(c => {
    const n = nodes[c.node]
    if (!n) return false
    let cur = n
    while (cur.parent && nodes[cur.parent]) cur = nodes[cur.parent]
    return (cur.page ?? onPage) === onPage
  })

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {visible.map((c, i) => {
        const b = boxes[c.node]
        if (!b) return null
        const x = sx(b.x + b.w), y = sy(b.y)
        const showing = open === c.id
        return (
          <div key={c.id} className="absolute" style={{ left: x - 10, top: y - 10 }}>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setOpen(showing ? null : c.id)}
              title={c.text}
              className={`pointer-events-auto grid size-5 place-items-center rounded-full rounded-bl-none border text-[10px]
                          font-medium shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform hover:scale-110
                          ${c.resolved ? 'border-black/10 bg-white text-black/40' : 'border-[#1e1e1e] bg-[#1e1e1e] text-white'}`}
            >
              {c.resolved ? '✓' : i + 1}
            </button>
            {showing && (
              <div
                onPointerDown={e => e.stopPropagation()}
                className="pointer-events-auto absolute left-6 top-0 w-[240px] rounded-[8px] border border-black/10 bg-white p-2.5
                           text-[12px] leading-snug text-ink shadow-[0_12px_32px_-12px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-black/40">
                  <span>{c.by === 'agent' ? 'agent' : 'you'}</span>
                  <span>·</span>
                  <span>{c.resolved ? 'resolved' : 'open'}</span>
                  <button
                    onClick={() => { useEditor.getState().removeComment(c.id); setOpen(null) }}
                    className="ml-auto text-black/40 hover:text-black"
                    title="delete"
                  >×</button>
                </div>
                <p className="mt-1">{c.text}</p>
                {c.reply && (
                  <p className="mt-2 border-l-2 border-black/10 pl-2 text-black/60">{c.reply}</p>
                )}
                {!c.resolved && (
                  <button
                    onClick={() => useEditor.getState().resolveComment(c.id)}
                    className="mt-2 rounded-[5px] bg-black/[0.06] px-2 py-1 text-[11px] hover:bg-black/10"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {commentOn && boxes[commentOn] && (
        <Draft node={commentOn} x={sx(boxes[commentOn].x + boxes[commentOn].w)} y={sy(boxes[commentOn].y)} />
      )}
    </div>
  )
}

function Draft({ node, x, y }: { node: string; x: number; y: number }) {
  const [text, setText] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  // after the frame settles, so the inspector cannot take the focus back
  useEffect(() => {
    const t = setTimeout(() => field.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [node])
  const done = () => useEditor.getState().startComment(null)
  const save = () => { if (text.trim()) useEditor.getState().addComment(node, text); else done() }
  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      className="pointer-events-auto absolute w-[260px] rounded-[8px] border border-black/10 bg-white p-2
                 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.4)]"
      style={{ left: x + 14, top: y - 10 }}
    >
      <textarea
        ref={field}
        autoFocus
        rows={2}
        value={text}
        placeholder="Leave a note for the agent…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
          if (e.key === 'Escape') { e.preventDefault(); done() }
        }}
        className="w-full resize-none bg-transparent px-1 text-[12px] leading-snug outline-none placeholder:text-black/35"
      />
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-black/40">
        <span>Enter to post · Esc to cancel</span>
        <button onClick={save} className="rounded-[5px] bg-[#1e1e1e] px-2 py-0.5 text-[11px] text-white">Post</button>
      </div>
    </div>
  )
}
