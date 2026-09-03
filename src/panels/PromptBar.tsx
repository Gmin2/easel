import { useEffect, useRef, useState } from 'react'
import Composer from './Composer'
import type { Row } from './Composer'
import { ChevronDown, Frame, Image as ImageIcon, Sections, Vector } from '../icons'
import * as clean from '../lib/clean'
import * as gen from '../lib/generate'
import * as edits from '../lib/ops'
import * as stream from '../lib/stream'
import { landStream } from '../lib/land'
import { tokensOf } from '../lib/tokens'
import { artboardOf, boardsOn } from '../doc/ops'
import { useEditor } from '../doc/store'
import type { Tool } from '../doc/store'
import type { Doc } from '../doc/types'

/**
 * The prompt bar.
 *
 * Three kinds of generation, one bar: the tool decides what comes out and the
 * model chip picks who makes it. They share a bar because they share
 * everything else — the same backend, the same error surface, and the same
 * landing, which is the store actions the rest of the editor uses. Nothing here
 * writes the document itself, so a generated section is undoable with `⌘Z` and
 * shows up in the activity feed attributed like any other edit.
 *
 * The design kind is the one worth the trouble. Easel's document is real HTML
 * with real CSS, so markup from a model is the design rather than a picture of
 * one — it arrives as nodes a person can drag and an agent can read back.
 */

type Kind = 'design' | 'image' | 'svg'

const KINDS: Record<Kind, {
  verb: string
  /** what the bar says while it waits */
  doing: string
  icon: React.ReactNode
  placeholder: string
  desc: string
  /** what the second chip is for: a ratio for pictures, a target for markup */
  ratios: boolean
}> = {
  design: {
    verb: 'Design',
    doing: 'Designing…',
    icon: <Sections size={13} />,
    placeholder: 'Describe a section, or an edit to what is there',
    desc: 'HTML and CSS on the artboard',
    ratios: false,
  },
  image: {
    verb: 'Image',
    doing: 'Painting…',
    icon: <ImageIcon size={13} />,
    placeholder: 'A beautiful sunset over a calm ocean',
    desc: 'A picture, placed or filled in',
    ratios: true,
  },
  svg: {
    verb: 'SVG',
    doing: 'Drawing…',
    icon: <Vector size={13} />,
    placeholder: 'Moon icon in outline style',
    desc: 'Vector markup, as a node',
    ratios: true,
  },
}

const PLUS: Row[] = (Object.keys(KINDS) as Kind[]).map(k => ({
  id: k, label: KINDS[k].verb, desc: KINDS[k].desc, icon: KINDS[k].icon,
}))

const COMMANDS: Row[] = [
  ...PLUS.map(r => ({ ...r, id: `kind:${r.id}`, label: `/${r.id}` })),
  { id: 'variety', label: '/variety', desc: 'Every model at once, stacked down the board' },
  { id: 'fit', label: '/fit', desc: 'Grow the artboard around what is on it' },
]

const kindOf = (tool: Tool): Kind | null =>
  tool === 'design' || tool === 'image' || tool === 'svg' ? tool : null

export default function PromptBar() {
  const tool = useEditor(s => s.tool)
  const kind = kindOf(tool)

  // remounting per kind is deliberate: switching tools should give you a fresh
  // prompt and clear the last error, not inherit them
  return kind ? <Bar key={kind} kind={kind} /> : null
}

function Bar({ kind }: { kind: Kind }) {
  const spec = KINDS[kind]
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<string>('1:1')
  const [provider, setProvider] = useState<string | null>(null)
  const [models, setModels] = useState<gen.Provider[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<string | null>(null)
  // `@Name` in the draft, and the id it stood for when it was picked
  const mentioned = useRef<Record<string, string>>({})

  const doc = useEditor(s => s.doc)
  const sel = useEditor(s => s.sel)
  const board = targetBoard(doc, sel)

  // the chip offers what the deployment's keys can really reach, so it cannot
  // advertise a model that will answer with "no api key"
  useEffect(() => {
    let live = true
    gen.catalogue().then(
      c => { if (live) setModels(c[kind]) },
      () => { if (live) setModels([]) })
    return () => { live = false }
  }, [kind])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return
      const t = e.target as HTMLTextAreaElement
      if (t.tagName === 'TEXTAREA' && t.value) return
      e.preventDefault()
      useEditor.getState().setTool('select')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [busy])

  const chosen = provider ?? models?.[0]?.id ?? null
  const modelRows = [
    ...(models ?? []).map(m => ({ id: m.id, label: m.label, hint: m.model })),
    ...((models?.length ?? 0) > 1 ? [{ id: 'variety', label: 'Variety pack', hint: `all ${models!.length}` }] : []),
  ]

  // nodes on the target board, for `@`: what the edits endpoint can aim at
  const mentions: Row[] = board
    ? edits.outline(doc, board, useEditor.getState().boxes, 60).ids
      .filter(id => id !== board)
      .map(id => {
        const n = doc.nodes[id]
        return { id, label: n?.name ?? id, desc: n?.text?.slice(0, 40), hint: n?.tag }
      })
    : []

  const editing = !!(board && doc.nodes[board]?.children.length) && kind === 'design' && chosen !== 'variety'

  const run = async (text: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setMade(null)
    // a mention becomes the id the model can address
    const aimed = text.replace(/@([^\s@]+)/g, (m, name: string) =>
      mentioned.current[name] ? `${name} (${mentioned.current[name]})` : m)
    try {
      const summary = kind === 'design'
        ? await landDesign(aimed, chosen, ratio)
        : kind === 'image'
          ? await landImage(aimed, chosen, ratio)
          : await landSvg(aimed, chosen, ratio)
      setMade(summary)
      setPrompt('')
      mentioned.current = {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const command = (r: Row) => {
    if (r.id.startsWith('kind:')) useEditor.getState().setTool(r.id.slice(5) as Tool)
    else if (r.id === 'variety') setProvider('variety')
    else if (r.id === 'fit' && board) fit(board)
  }

  return (
    <Composer
      className="absolute bottom-4 left-1/2 z-40 w-[440px] -translate-x-1/2"
      value={prompt}
      onChange={setPrompt}
      onSend={run}
      placeholder={spec.placeholder}
      autoFocus
      busy={busy}
      status={editing ? 'Editing…' : spec.doing}
      error={error}
      note={made}
      models={modelRows}
      model={chosen}
      onModel={setProvider}
      plus={PLUS}
      plusActive={kind}
      onPlus={id => useEditor.getState().setTool(id as Tool)}
      commands={COMMANDS}
      onCommand={command}
      mentions={kind === 'design' ? mentions : undefined}
      onMention={r => { mentioned.current[r.label] = r.id }}
      chips={spec.ratios ? (
        <Chip
          icon={<Frame size={11} />}
          label={ratio}
          disabled={busy}
          options={gen.RATIOS.map(r => ({ id: r, label: r, hint: sizeHint(r) }))}
          value={ratio}
          onPick={setRatio}
        />
      ) : (
        <Target disabled={busy} />
      )}
    />
  )
}

// -------------------------------------------------------------------- controls

interface Option { id: string; label: string; hint?: string }

/** a chip that opens a list, which is the whole vocabulary of this bar */
function Chip({ icon, label, options, value, disabled, onPick }: {
  icon: React.ReactNode
  label: string
  options: Option[]
  value: string | null
  disabled?: boolean
  onPick(id: string): void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        disabled={disabled || !options.length}
        onClick={() => setOpen(o => !o)}
        className="flex h-7 max-w-[148px] shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px]
                   font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
      >
        <span className="shrink-0 text-ink-3">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown size={9} className="shrink-0 text-ink-3" />
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-[9]" onPointerDown={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-10 mb-3 min-w-[176px] rounded-[10px] bg-surface p-1 shadow-raised"
               style={{ animation: 'pop-in 180ms var(--ease-out-strong) both', transformOrigin: 'bottom right' }}>
            {options.map(o => (
              <button
                key={o.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onPick(o.id); setOpen(false) }}
                className={`flex h-[30px] w-full items-center gap-2 rounded-[6px] px-2 text-left
                            transition-colors hover:bg-hover ${o.id === value ? 'font-medium' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">{o.hint}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** where a generated design will land, since it goes into an artboard */
function Target({ disabled }: { disabled?: boolean }) {
  const doc = useEditor(s => s.doc)
  const sel = useEditor(s => s.sel)
  const boards = boardsOn(doc)
  const target = targetBoard(doc, sel)

  return (
    <Chip
      icon={<Frame size={11} />}
      label={target ? doc.nodes[target]?.name ?? target : 'No artboard'}
      disabled={disabled}
      value={target}
      options={boards.map(id => ({
        id,
        label: doc.nodes[id]?.name ?? id,
        hint: `${Math.round(num(doc.nodes[id]?.style.width))}px`,
      }))}
      onPick={id => useEditor.getState().select([id])}
    />
  )
}

// --------------------------------------------------------------------- landing

const num = (v: string | undefined) => Number(/^(-?[\d.]+)/.exec((v ?? '').trim())?.[1] ?? 0)

const sizeHint = (r: string) => {
  const { w, h } = gen.ratioSize(r, 1024)
  return `${w}×${h}`
}

/** the board a generation goes into: what is picked, else what is on the wall */
function targetBoard(doc: Doc, sel: string[]): string | null {
  const picked = sel[0]
  if (picked) {
    const board = doc.nodes[picked]?.type === 'artboard' ? picked : artboardOf(doc, picked)
    if (board) return board
  }
  return boardsOn(doc)[0] ?? null
}

/**
 * A free row under whatever is already on the board.
 *
 * Dropping a generated section on top of the existing design would be the
 * wrong kind of surprise, and it is the thing a model gets wrong every time
 * because it cannot see what is already there.
 */
function freeRow(board: string): { x: number; y: number; w: number } {
  const { doc, boxes } = useEditor.getState()
  const box = boxes[board]
  const kids = doc.nodes[board]?.children ?? []
  const bottom = kids.reduce((low, id) => {
    const b = boxes[id]
    return b && box ? Math.max(low, b.y - box.y + b.h) : low
  }, 0)
  const w = box ? Math.round(box.w) : 1280
  return { x: 0, y: Math.round(bottom ? bottom + 64 : 64), w }
}

/** centre a box of this size inside the board */
function centred(board: string, w: number, h: number) {
  const box = useEditor.getState().boxes[board]
  return {
    x: Math.round(((box?.w ?? 1280) - w) / 2),
    y: Math.round(((box?.h ?? 832) - h) / 2),
  }
}

async function landDesign(prompt: string, provider: string | null, _ratio: string) {
  const s = useEditor.getState()
  const board = targetBoard(s.doc, s.sel)
  if (!board) throw new Error('There is no artboard to write into. Draw one with A first.')

  const node = s.doc.nodes[board]
  // an artboard with something on it gets edits aimed at what is there; an
  // empty one gets a design. same box, the prompt decides what it means
  if (node.children.length && provider !== 'variety') return landEdits(prompt, provider, board)
  const at = freeRow(board)
  if (provider !== 'variety') return landStream(prompt, provider, board, at, fit)
  const { made: results, failed } = await gen.design({
    prompt,
    width: at.w,
    height: Math.round(num(node.style.height)) || undefined,
    tokens: tokensOf(node.style),
    ...(provider ? { provider } : {}),
  })

  // a variety pack stacks its answers down the board, which is the point of
  // it: the possibility space one under the next rather than one at a time
  let y = at.y
  const made: string[] = []
  const roots: string[] = []
  for (const r of results) {
    const html = clean.place(clean.fragment(r.html), {
      x: at.x, y, w: at.w, name: `${r.label} — ${prompt.slice(0, 24)}`,
    })
    const ids = useEditor.getState().insertHtml(board, html)
    if (!ids.length) throw new Error(`${r.label} returned markup with no elements in it.`)
    made.push(...ids)
    const root = ids.find(id => useEditor.getState().doc.nodes[id]?.parent === board)
    if (root) {
      roots.push(root)
      await settle()
      y += Math.round((useEditor.getState().boxes[root]?.h ?? 320) + 64)
    }
  }

  fit(board)
  useEditor.getState().select(roots)
  const note = gen.failNote(failed)
  return `${made.length} nodes from ${results.map(r => r.label).join(', ')}.`
    + ` ⌘Z undoes it.${note ? ` ${note}` : ''}`
}

/**
 * Make room on the board, without costing a second undo step.
 *
 * Growing the artboard is its own commit, so its snapshot is dropped: the
 * generation and the room made for it were one intent, and one `⌘Z` should
 * take back both.
 */
function fit(board: string): void {
  if (useEditor.getState().fitBoard(board)) useEditor.getState().dropSnapshot()
}

async function landImage(prompt: string, provider: string | null, ratio: string) {
  const s = useEditor.getState()
  const { made: results, failed } = await gen.image({
    prompt, ratio, ...(provider ? { provider } : {}),
  })
  if (!results.length) throw new Error(gen.failNote(failed) ?? 'Nothing came back.')

  // filling the node that is already picked mirrors the inspector's generator:
  // if you selected an image and asked for a picture, you meant that one
  const picked = s.sel.length === 1 ? s.doc.nodes[s.sel[0]] : null
  if (picked?.type === 'image' && results.length === 1) {
    useEditor.getState().setProps(picked.id, { src: results[0].src, alt: prompt })
    return note(results[0], `Filled ${picked.name}.`, failed)
  }

  const board = targetBoard(s.doc, s.sel)
  if (!board) throw new Error('There is no artboard to put it on. Draw one with A first.')

  const { w, h } = gen.ratioSize(ratio, 384)
  const spot = centred(board, w, h)
  const made: string[] = []
  results.forEach((r, i) => {
    const id = useEditor.getState().insertImage(board, r.src, prompt, {
      x: spot.x + i * (w + 24) - (results.length - 1) * (w + 24) / 2,
      y: spot.y, w, h,
    }, `${r.label} — ${prompt.slice(0, 24)}`)
    if (id) made.push(id)
  })
  if (!made.length) throw new Error('Could not place the image on the artboard.')
  useEditor.getState().select(made)
  return note(results[0],
    `${made.length === 1 ? 'Placed' : `Placed ${made.length}`} on ${useEditor.getState().doc.nodes[board].name}.`,
    failed)
}

async function landSvg(prompt: string, provider: string | null, ratio: string) {
  const s = useEditor.getState()
  const { made: results, failed } = await gen.svg({
    prompt, ratio, ...(provider ? { provider } : {}),
  })
  if (!results.length) throw new Error(gen.failNote(failed) ?? 'Nothing came back.')
  const markup = results.map(r => ({ ...r, svg: clean.svg(r.svg) }))

  const picked = s.sel.length === 1 ? s.doc.nodes[s.sel[0]] : null
  if (picked?.type === 'svg' && markup.length === 1) {
    useEditor.getState().setSvg(picked.id, markup[0].svg)
    return note(markup[0], `Redrew ${picked.name}.`, failed)
  }

  const board = targetBoard(s.doc, s.sel)
  if (!board) throw new Error('There is no artboard to put it on. Draw one with A first.')

  const { w, h } = gen.ratioSize(ratio, 240)
  const spot = centred(board, w, h)
  const made: string[] = []
  markup.forEach((r, i) => {
    const id = useEditor.getState().insertSvg(board, r.svg, {
      x: spot.x + i * (w + 24) - (markup.length - 1) * (w + 24) / 2,
      y: spot.y, w, h,
    }, `${r.label} — ${prompt.slice(0, 24)}`)
    if (id) made.push(id)
  })
  if (!made.length) throw new Error('Could not place the vector on the artboard.')
  useEditor.getState().select(made)
  return note(markup[0],
    `Inline SVG on ${useEditor.getState().doc.nodes[board].name}, ${markup[0].svg.length} chars of markup.`,
    failed)
}

/** what the bar says afterwards: who made it, and anything they warned about */
const note = (r: { label: string; note?: string }, what: string, failed: gen.Fail[] = []) =>
  [what, r.label + '.', r.note, gen.failNote(failed)].filter(Boolean).join(' ')

/** let react render and the canvas re-measure, so a box is real before we read it */
const settle = () =>
  new Promise<void>(done =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())))

/** addressed edits to an artboard that already has content, one undo step */
async function landEdits(prompt: string, provider: string | null, board: string) {
  const s = useEditor.getState()
  const node = s.doc.nodes[board]
  const o = edits.outline(s.doc, board, s.boxes)
  const queue: edits.Op[] = []
  let label = 'agent'
  const first = s.boxes[board]
  if (first) useEditor.getState().setCursor({ x: first.x + 24, y: first.y + 24, label, busy: true })
  const out = await stream.edits({
    prompt, artboardId: board, outline: o.text, ids: o.ids,
    width: Math.round(s.boxes[board]?.w ?? num(node.style.width) ?? 1280),
    tokens: tokensOf(node.style),
    ...(provider ? { provider } : {}),
    ...(s.file ? { fileId: s.file.id } : {}),
  }, {
    meta: m => { label = m.label },
    op: op => { queue.push(op) },
  })
  const applied = await edits.applyPaced(out.ops.length ? out.ops : queue, label)
  const touched = applied.flatMap(a => a.ids)
  await settle()
  fit(board)
  if (touched.length) useEditor.getState().select(touched.slice(0, 1))
  const failed = applied.filter(a => a.error).length
  return `${label}: ${out.summary ?? `${applied.length} edits`}.`
    + ` ${applied.length - failed} of ${applied.length} landed${out.dropped.length ? `, ${out.dropped.length} dropped` : ''}. ⌘Z undoes it.`
}

