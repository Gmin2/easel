import { useRef, useState } from 'react'
import * as edits from '../lib/ops'
import { tokensOf } from '../lib/tokens'
import { artboardOf } from '../doc/ops'
import { useEditor } from '../doc/store'
import type { Camera, Node, NodeBox } from '../doc/types'

/**
 * The bar under a selected node.
 *
 * Pick one thing and a pill appears beneath it: a field for what to change
 * about it, Explain, Improve, and a few more behind the chevron. Every
 * action is an addressed edit aimed at that node's id, applied through the
 * same ops the prompt bar uses, so it is one ⌘Z and the activity feed says
 * who did it. Explain is the exception: it reads the node back in words and
 * costs no model call.
 *
 * After the selection actions at beautifului.dev (MIT).
 */

type Mode = 'idle' | 'busy' | 'result'

const MORE = [
  { id: 'copy', label: 'Rewrite copy', ask: 'Rewrite the text so it reads better and says the same thing. Keep the length close.', doing: 'Rewriting' },
  { id: 'simplify', label: 'Simplify', ask: 'Simplify it: fewer elements, calmer spacing, one clear hierarchy.', doing: 'Simplifying' },
  { id: 'contrast', label: 'Fix contrast', ask: 'Fix colour contrast so every text passes WCAG AA against what it sits on.', doing: 'Fixing contrast' },
]

export default function SelectionBar({ cam, box, hidden }: {
  cam: Camera
  box: NodeBox | null
  /** true while a gesture is in flight, so the bar keeps out of the way */
  hidden: boolean
}) {
  const doc = useEditor(s => s.doc)
  const node = box ? doc.nodes[box.id] : null
  const [mode, setMode] = useState<Mode>('idle')
  const [prompt, setPrompt] = useState('')
  const [doing, setDoing] = useState('Improving')
  const [expanded, setExpanded] = useState(false)
  const [explain, setExplain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  if (!box || !node || node.type === 'artboard') return null

  const x = box.x * cam.zoom + cam.pan.x + (box.w * cam.zoom) / 2
  const y = box.y * cam.zoom + cam.pan.y + box.h * cam.zoom + 32

  const run = async (ask: string, label: string) => {
    if (mode === 'busy') return
    setDoing(label)
    setExpanded(false)
    setExplain(false)
    setError(null)
    setMode('busy')
    try {
      const summary = await scopedEdit(node, ask)
      setNote(summary)
      setMode('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMode('idle')
    }
  }

  const keep = () => { setMode('idle'); setPrompt(''); setNote(null) }
  const discard = () => { useEditor.getState().undo(); keep() }

  const hasPrompt = prompt.trim().length > 0

  return (
    <div
      className="absolute left-0 top-0 z-40"
      style={{
        transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translateX(-50%)`,
        transition: 'transform 200ms var(--ease-out-strong), opacity 150ms ease-out',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      {explain && (
        <div className="absolute bottom-full left-1/2 mb-2 w-[300px] -translate-x-1/2 rounded-[10px] bg-surface p-3
                        text-[12px] leading-relaxed text-ink shadow-raised"
             style={{ animation: 'pop-in 180ms var(--ease-out-strong) both' }}>
          {describe(node, box, doc)}
        </div>
      )}

      <div
        className="flex h-9 w-max max-w-[calc(100vw-48px)] items-center gap-0.5 rounded-full bg-surface p-1
                   text-[12.5px] text-ink shadow-overlay"
        style={{ animation: 'pop-in 220ms var(--ease-out-strong) both' }}
      >
        {mode === 'busy' && (
          <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5 text-ink-2">
            <span className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                  style={{ animation: 'spin 700ms linear infinite' }} />
            <span className="shimmer">{doing}…</span>
          </span>
        )}

        {mode === 'result' && (
          <>
            <button onClick={keep}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 text-white
                               transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]">
              <Glyph d="M20 6L9 17l-5-5" /> Keep
            </button>
            <Quiet onClick={discard}><Glyph d="M18 6L6 18M6 6l12 12" /> Discard</Quiet>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
            <button title="try again" onClick={() => void run(lastAsk.current, doing)}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink-2">
              <Glyph d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
            </button>
          </>
        )}

        {mode === 'idle' && (
          <>
            <form
              className="flex h-7 shrink-0 items-center"
              onSubmit={e => { e.preventDefault(); if (hasPrompt) void run(prompt.trim(), 'Editing') }}
            >
              <input
                ref={field}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setPrompt(''); e.currentTarget.blur() } }}
                placeholder="Describe edits"
                className="h-7 bg-transparent pl-3 pr-2 text-[12.5px] text-ink outline-none placeholder:text-ink-3"
                style={{ width: hasPrompt ? 220 : 130, transition: 'width 300ms var(--ease-out-strong)' }}
              />
            </form>

            {hasPrompt ? (
              <button title="send  ↵" onClick={() => void run(prompt.trim(), 'Editing')}
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-white active:scale-[0.94]">
                <Glyph d="M12 19V5M5 12l7-7 7 7" w={2.4} />
              </button>
            ) : (
              <>
                <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
                <Quiet onClick={() => setExplain(v => !v)} on={explain}>
                  <Glyph d="M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /> Explain
                </Quiet>
                <Quiet onClick={() => void run('Improve it: refine spacing, alignment, type hierarchy and colour so it looks finished. Keep the content.', 'Improving')}>
                  <Spark /> Improve
                </Quiet>
                {expanded && MORE.map(m => (
                  <Quiet key={m.id} onClick={() => void run(m.ask, m.doing)}>{m.label}</Quiet>
                ))}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                <button
                  title={expanded ? 'fewer' : 'more'}
                  onClick={() => setExpanded(v => !v)}
                  className="grid size-7 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-hover"
                >
                  <span className="flex transition-transform duration-300"
                        style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
                    <Glyph d="M9 18l6-6-6-6" />
                  </span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {(error || (mode === 'result' && note)) && (
        <p className={`mx-auto mt-1.5 w-max max-w-[320px] rounded-[6px] bg-surface px-2 py-1 text-center text-[11px]
                       leading-snug shadow-hairline ${error ? 'text-red' : 'text-ink-3'}`}>
          {error ?? note}
        </p>
      )}
    </div>
  )
}

/** the last thing asked, so "try again" can ask it again */
const lastAsk = { current: '' }

/**
 * An addressed edit, scoped to one node.
 *
 * The model still sees the whole artboard's outline, since "make it match
 * the button above" needs the button, but it is told which id it may touch.
 */
async function scopedEdit(node: Node, ask: string): Promise<string> {
  lastAsk.current = ask
  const s = useEditor.getState()
  const board = artboardOf(s.doc, node.id)
  if (!board) throw new Error('This node is not on an artboard.')
  const o = edits.outline(s.doc, board, s.boxes)
  const out = await edits.request({
    prompt: `${ask}\nTarget: ${node.name} (${node.id}). Change only ${node.id} and its descendants; leave every other node exactly as it is.`,
    artboardId: board, outline: o.text, ids: o.ids,
    width: Math.round(s.boxes[board]?.w ?? 1280),
    tokens: tokensOf(s.doc.nodes[board].style),
    ...(s.file ? { fileId: s.file.id } : {}),
  })
  const applied = edits.apply(out.ops)
  if (!applied.length) throw new Error(out.summary ?? 'The model had nothing to change.')
  const failed = applied.filter(a => a.error).length
  if (failed === applied.length) throw new Error(applied[0].error ?? 'None of the edits landed.')
  return `${out.summary ?? `${applied.length} edits`} · ${out.label}`
}

/** the node in words, from its own styles */
function describe(n: Node, box: NodeBox, doc: ReturnType<typeof useEditor.getState>['doc']): string {
  const st = n.style
  const parts: string[] = []
  parts.push(`${n.name} is a <${n.tag}> ${n.type}, ${Math.round(box.w)}×${Math.round(box.h)}px`)
  if (n.children.length) parts.push(`with ${n.children.length} ${n.children.length === 1 ? 'child' : 'children'}`)
  if (st.display === 'flex') parts.push(`laid out as a flex ${st.flexDirection === 'column' ? 'column' : 'row'}${st.gap ? ` with ${st.gap} gap` : ''}`)
  else if (st.display === 'grid') parts.push('laid out as a grid')
  if (st.padding) parts.push(`padded ${st.padding}`)
  if (st.fontSize) parts.push(`type ${st.fontSize}${st.fontWeight ? ` at weight ${st.fontWeight}` : ''}${st.fontFamily ? ` in ${st.fontFamily.split(',')[0].replace(/["']/g, '')}` : ''}`)
  if (st.color) parts.push(`coloured ${st.color}`)
  const bg = st.background ?? st.backgroundColor
  if (bg && bg !== 'transparent') parts.push(`on ${bg.length > 40 ? 'a gradient' : bg}`)
  if (st.borderRadius && st.borderRadius !== '0px') parts.push(`rounded ${st.borderRadius}`)
  if (st.boxShadow && st.boxShadow !== 'none') parts.push('with a shadow')
  const parent = n.parent ? doc.nodes[n.parent] : null
  if (parent) parts.push(`inside ${parent.name}`)
  return parts.join(', ') + '.'
}

function Quiet({ children, onClick, on }: { children: React.ReactNode; onClick(): void; on?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12.5px]
                  transition-colors hover:bg-hover ${on ? 'bg-hover text-ink' : 'text-ink-2 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

const Glyph = ({ d, w = 1.8 }: { d: string; w?: number }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
)

const Spark = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  </svg>
)
