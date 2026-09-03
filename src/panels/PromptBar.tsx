import { useEffect, useRef, useState } from 'react'
import ContextMenu from './ContextMenu'
import { ChevronDown, Frame, Image as ImageIcon, Menu, Sections, Sparkle, Vector } from '../icons'
import * as clean from '../lib/clean'
import * as gen from '../lib/generate'
import * as edits from '../lib/ops'
import * as templates from '../lib/templates'
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
  icon: React.ReactNode
  placeholder: string
  /** what the second chip is for: a ratio for pictures, a target for markup */
  ratios: boolean
}> = {
  design: {
    verb: 'Create design',
    icon: <Sections size={12} />,
    placeholder: 'A pricing section with three tiers',
    ratios: false,
  },
  image: {
    verb: 'Create image',
    icon: <ImageIcon size={12} />,
    placeholder: 'A beautiful sunset over a calm ocean',
    ratios: true,
  },
  svg: {
    verb: 'Create SVG',
    icon: <Vector size={12} />,
    placeholder: 'Moon icon in outline style',
    ratios: true,
  },
}

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { field.current?.focus() }, [])

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
      e.preventDefault()
      useEditor.getState().setTool('select')
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [busy])

  const chosen = provider ?? models?.[0]?.id ?? null
  const label = provider === 'variety'
    ? 'Variety pack'
    : models?.find(m => m.id === chosen)?.label ?? (models ? 'No model' : 'Loading…')

  const run = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    setMade(null)
    try {
      const summary = kind === 'design'
        ? await landDesign(text, chosen, ratio)
        : kind === 'image'
          ? await landImage(text, chosen, ratio)
          : await landSvg(text, chosen, ratio)
      setMade(summary)
      setPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="absolute bottom-4 left-1/2 z-40 w-[392px] -translate-x-1/2"
      // the canvas listens for pointer gestures on everything above it
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="rounded-[12px] border border-black/10 bg-panel p-1.5
                      shadow-[0_18px_50px_-16px_rgba(0,0,0,0.5)]">
        <div className="relative">
          <textarea
            ref={field}
            rows={2}
            value={prompt}
            disabled={busy}
            placeholder={spec.placeholder}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run() }
              if (e.key === 'Escape') { e.currentTarget.blur() }
            }}
            className="w-full resize-none bg-transparent px-2 pb-1 pr-7 pt-1.5 leading-snug
                       outline-none placeholder:text-faint disabled:opacity-50"
          />
          <button
            title="options"
            onClick={e => {
              const r = (e.target as HTMLElement).getBoundingClientRect()
              setMenu({ x: r.right - 232, y: r.bottom + 6 })
            }}
            className="absolute right-1 top-1 grid size-5 place-items-center rounded-[4px]
                       text-faint transition-colors hover:bg-black/[0.05] hover:text-ink"
          >
            <Menu size={11} />
          </button>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          <Chip
            icon={<Sparkle size={11} />}
            label={label}
            disabled={busy}
            options={[
              ...(models ?? []).map(m => ({ id: m.id, label: m.label, hint: m.model })),
              ...((models?.length ?? 0) > 1
                ? [{
                  id: 'variety',
                  label: 'Variety pack',
                  hint: `all ${models!.length} at once`,
                }]
                : []),
            ]}
            value={chosen}
            onPick={setProvider}
          />

          {spec.ratios ? (
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

          <button
            disabled={busy || !prompt.trim() || !chosen}
            onClick={() => void run()}
            title={`${spec.verb}  ↵`}
            className="inset-control ml-auto flex h-[26px] items-center gap-1.5 px-2.5
                       font-medium transition-colors hover:bg-black/[0.02]
                       disabled:opacity-40"
          >
            {busy ? <Spinner /> : spec.icon}
            {busy ? 'Generating…' : spec.verb}
          </button>
        </div>

        {(error || made) && (
          <p className={`px-2 pb-0.5 pt-1.5 text-[10px] leading-relaxed
                         ${error ? 'text-[#dc4f70]' : 'text-faint'}`}>
            {error ?? made}
          </p>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Clear prompt',
              disabled: !prompt,
              run: () => { setPrompt(''); setError(null); setMade(null) },
            },
            { label: 'Close', keys: 'esc', run: () => useEditor.getState().setTool('select') },
            { sep: true },
            {
              label: 'Copy the last error',
              disabled: !error,
              run: () => { if (error) void navigator.clipboard.writeText(error) },
            },
          ]}
        />
      )}
    </div>
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
        className="inset-control flex h-[26px] max-w-[148px] items-center gap-1.5 px-2
                   transition-colors hover:bg-black/[0.02] disabled:opacity-40"
      >
        <span className="shrink-0 text-dim">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown size={9} className="shrink-0 text-faint" />
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-[60]" onPointerDown={() => setOpen(false)} />
          <div className="absolute bottom-[30px] left-0 z-[61] min-w-[176px] rounded-[9px]
                          border border-black/10 bg-panel py-1
                          shadow-[0_14px_44px_-12px_rgba(0,0,0,0.45)]">
            {options.map(o => (
              <button
                key={o.id}
                onClick={() => { onPick(o.id); setOpen(false) }}
                className={`flex h-[26px] w-full items-center gap-2 px-2.5 text-left
                            transition-colors hover:bg-black/[0.055]
                            ${o.id === value ? 'font-medium' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 font-mono text-[9px] text-faint">{o.hint}</span>
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

function Spinner() {
  return (
    <span className="size-[11px] shrink-0 animate-spin rounded-full
                     border-[1.5px] border-black/15 border-t-black/60" />
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
  let exemplar: { title: string; html: string } | undefined
  let exemplarId: string | undefined
  try {
    const t = await templates.match(prompt)
    if (t) { exemplar = { title: t.title, html: templates.excerpt(await templates.html(t.id), 16000) }; exemplarId = t.id }
  } catch { /* a missing template is not a reason to fail the prompt */ }
  const out = await edits.request({
    prompt, artboardId: board, outline: o.text, ids: o.ids,
    width: Math.round(s.boxes[board]?.w ?? num(node.style.width) ?? 1280),
    tokens: tokensOf(node.style),
    ...(provider ? { provider } : {}),
    ...(exemplar ? { exemplar, exemplarId } : {}),
  })
  const applied = edits.apply(out.ops)
  const touched = applied.flatMap(a => a.ids)
  await settle()
  fit(board)
  if (touched.length) useEditor.getState().select(touched.slice(0, 1))
  const failed = applied.filter(a => a.error).length
  return `${out.label}: ${out.summary ?? `${applied.length} edits`}.`
    + ` ${applied.length - failed} of ${applied.length} landed${out.dropped.length ? `, ${out.dropped.length} dropped` : ''}. ⌘Z undoes it.`
}
