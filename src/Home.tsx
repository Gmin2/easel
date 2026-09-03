import { useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/clerk-react'
import {
  ChevronDown, Clock, Grid, ListIcon, Magnifier, Pen, Plus, Sections, Sparkle,
} from './icons'
import * as auth from './lib/auth'
import * as clean from './lib/clean'
import * as files from './lib/files'
import type { FileMeta } from './lib/files'
import * as gen from './lib/generate'
import * as templates from './lib/templates'
import { useEditor } from './doc/store'

/**
 * The home page: a workspace sidebar, a prompt, and the files you were in.
 *
 * The prompt is the front door. What it makes is a file with the first
 * design already on it, so the editor opens on something rather than on an
 * empty board, and the file card is there to come back to.
 */

const STARTERS = [
  { label: 'SaaS hero', prompt: 'SaaS landing page hero with headline, subheadline, and a CTA button' },
  { label: 'Pricing page', prompt: 'Pricing page with three tiers (Free, Pro, Enterprise), cards in a row' },
  { label: 'Mobile app', prompt: 'Mobile app landing page hero with app mockup placeholder and download buttons' },
  { label: 'Portfolio', prompt: 'Designer portfolio hero with name, role, short bio, and a contact button' },
  { label: 'Dashboard', prompt: 'Admin dashboard header bar with logo, nav links, and user avatar placeholder' },
  { label: 'Blog post', prompt: 'Blog post header with title, author byline, date, and cover image placeholder' },
]

export default function Home() {
  const [list, setList] = useState<FileMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const refresh = () => {
    files.list().then(setList, e => setError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(refresh, [])

  return (
    <div className="flex h-full w-full bg-panel text-[12px] text-ink">
      <Sidebar />

      <main className="relative min-w-0 flex-1">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-20 pb-56 pt-8">
            <div className="flex h-9 items-center">
              <h1 className="text-[24px] font-[480] leading-8 tracking-[0.12px]">Recents</h1>
              <div className="ml-auto flex items-center gap-3">
                <button
                  onClick={() => void useEditor.getState().newFile()}
                  className="flex h-7 items-center gap-1.5 rounded-[7.5px] bg-[#1e1e1e] px-3
                             font-medium text-[#f9f9f9] transition-colors hover:bg-black"
                >
                  <Plus size={11} />
                  New file
                </button>
                <div className="flex gap-0.5 rounded-[7.5px] bg-black/[0.06] p-0.5">
                  <Toggle on={layout === 'grid'} onClick={() => setLayout('grid')} title="grid">
                    <Grid size={13} />
                  </Toggle>
                  <Toggle on={layout === 'list'} onClick={() => setLayout('list')} title="list">
                    <ListIcon size={13} />
                  </Toggle>
                </div>
              </div>
            </div>

            {error ? (
              <p className="mt-8 text-[#dc4f70]">{error}</p>
            ) : !list ? (
              <div className="mt-8 flex flex-wrap gap-6">
                {[0, 1].map(i => (
                  <div key={i} className="h-[225px] w-[257px] animate-pulse rounded-[10px] bg-black/[0.04]" />
                ))}
              </div>
            ) : layout === 'grid' ? (
              <div className="mt-8 flex flex-wrap gap-6">
                {list.map(f => <Card key={f.id} file={f} onChange={refresh} />)}
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-[10px] bg-[#f9f9f9]">
                {list.map(f => <Row key={f.id} file={f} onChange={refresh} />)}
              </div>
            )}

            <Gallery />
          </div>
        </div>

        <Prompt />
      </main>
    </div>
  )
}

// -------------------------------------------------------------------- gallery

/**
 * Real sites to start from.
 *
 * Each card is a published page flattened to this document's html, with its
 * own typefaces. Opening one makes a file whose artboard is the whole page as
 * editable nodes, so the first prompt in the editor is an edit to something
 * that already looks shipped, not a design from nothing.
 */
function Gallery() {
  const [all, setAll] = useState<templates.Template[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { templates.list().then(setAll, () => setAll([])) }, [])
  if (!all?.length) return null

  const shown = [...all].sort((a, b) => (b.review ?? 3) - (a.review ?? 3))

  async function open(t: templates.Template) {
    if (busy) return
    setBusy(t.id)
    setError(null)
    try {
      const { html, board: theme } = templates.unwrap(await templates.html(t.id), t.width)
      const s = useEditor.getState
      await s().newFile(t.title)
      const blank = s().doc.artboards.slice()
      if (blank.length) s().remove(blank)
      const board = s().createArtboard({ name: t.title, w: t.width, h: t.height, background: '#ffffff' })
      if (Object.keys(theme).length) s().patchStyle([board], theme)
      s().insertHtml(board, html, 'insert')
      if (Object.keys(theme).length) s().dropSnapshot()
      s().select([board])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-14">
      <div className="flex h-9 items-center">
        <h2 className="text-[16px] font-[480] leading-8 tracking-[0.12px]">Start from a real site</h2>
        <span className="ml-3 text-faint">{all.length} pages, flattened to editable nodes with their own fonts</span>
      </div>
      {error && <p className="mt-2 text-[#dc4f70]">{error}</p>}
      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-5">
        {shown.map(t => (
          <button
            key={t.id}
            disabled={!!busy}
            onClick={() => void open(t)}
            title={t.description}
            className="group overflow-hidden rounded-[10px] border border-black/[0.08] bg-[#f9f9f9] text-left
                       shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow]
                       hover:border-black/20 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]
                       disabled:opacity-60"
          >
            <div className="relative aspect-[8/5] overflow-hidden bg-black/[0.05]">
              <img
                src={`/templates/${t.id}/thumb.jpg`}
                alt=""
                draggable={false}
                className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
              />
              {busy === t.id && (
                <div className="absolute inset-0 grid place-items-center bg-white/60">
                  <Spinner />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="truncate font-medium">{t.title}</span>
              <span className="ml-auto shrink-0 text-faint">{t.height}px</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

// -------------------------------------------------------------------- sidebar

function Sidebar() {
  return (
    <aside className="flex h-full w-panel shrink-0 flex-col border-r border-hair">
      <div className="flex flex-col gap-6 p-3">
        {auth.enabled ? <Account /> : <LocalAccount />}

        <div className="flex h-8 items-center gap-2 rounded-[7.5px] bg-black/[0.06] px-2.5 text-black/50">
          <Magnifier size={12} />
          <span className="flex-1">Search</span>
          <span className="text-black/40">⌘F</span>
        </div>

        <nav className="-mt-2 flex flex-col">
          <NavItem icon={<Clock size={14} />} label="Recents" active />
          <NavItem icon={<Grid size={13} />} label="Files" />
        </nav>
      </div>
    </aside>
  )
}

/** the signed-in account, with the way out */
function Account() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [menu, setMenu] = useState(false)
  const name = user?.username ?? user?.firstName ?? 'You'

  return (
    <div className="relative">
      <button
        onClick={() => setMenu(m => !m)}
        className="flex h-8 max-w-full items-center gap-2.5 rounded-[7.5px] px-2 text-[13px]
                   font-medium transition-colors hover:bg-black/[0.04]"
      >
        <Avatar src={user?.imageUrl} name={name} size={24} />
        <span className="truncate">{name}</span>
        <ChevronDown size={9} className="shrink-0 text-faint" />
      </button>
      {menu && (
        <>
          <span className="fixed inset-0 z-[60]" onPointerDown={() => setMenu(false)} />
          <div className="absolute left-0 top-9 z-[61] min-w-[200px] rounded-[9px] border border-black/10
                          bg-panel py-1 shadow-[0_14px_44px_-12px_rgba(0,0,0,0.45)]">
            <div className="px-2.5 pb-1 pt-1.5 text-black/50">
              {user?.primaryEmailAddress?.emailAddress ?? name}
            </div>
            <button
              className="flex h-[26px] w-full items-center px-2.5 text-left hover:bg-black/[0.055]"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** a dev server with no clerk key: one local account, nothing to sign out of */
function LocalAccount() {
  return (
    <div className="flex h-8 items-center gap-2.5 px-2 text-[13px] font-medium" title="no clerk key: local dev account">
      <Avatar name="Local" size={24} />
      Local
      <span className="ml-auto rounded-[4px] bg-black/[0.06] px-1 py-0.5 font-mono text-[9px] text-black/50">dev</span>
    </div>
  )
}

function NavItem({ icon, label, active }: {
  icon: React.ReactNode; label: string; active?: boolean
}) {
  return (
    <button
      className={`flex h-8 items-center gap-2 rounded-[7.5px] px-2 text-[13px] transition-colors
                  ${active ? 'bg-black/[0.06] text-ink' : 'text-black/60 hover:bg-black/[0.04]'}`}
    >
      <span className={`grid w-4 place-items-center ${active ? 'text-ink' : ''}`}>{icon}</span>
      {label}
    </button>
  )
}

function Toggle({ on, onClick, title, children }: {
  on: boolean; onClick(): void; title: string; children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded-[6px] transition-colors
                  ${on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-black/50 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

// --------------------------------------------------------------------- prompt

function Prompt() {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<string | null>(null)
  const [models, setModels] = useState<gen.Provider[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { field.current?.focus() }, [])

  useEffect(() => {
    let live = true
    gen.catalogue().then(
      c => { if (live) setModels(c.design) },
      () => { if (live) setModels([]) })
    return () => { live = false }
  }, [])

  const chosen = provider ?? models?.[0]?.id ?? null
  const label = models?.find(m => m.id === chosen)?.label ?? (models ? 'No model' : 'Loading…')

  async function run(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const html = await firstDesign(trimmed, chosen)
      // the file exists only once there is something to put in it, so a
      // failed attempt does not leave an empty card behind
      await useEditor.getState().newFile(nameFor(trimmed))
      const board = useEditor.getState().doc.artboards[0]
      const ids = useEditor.getState().insertHtml(board, clean.fragment(html), 'insert')
      if (ids.length) useEditor.getState().select([ids[0]])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute bottom-6 left-1/2 z-40 w-[640px] max-w-[calc(100%-48px)] -translate-x-1/2">
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {STARTERS.map(s => (
          <button
            key={s.label}
            disabled={busy}
            onClick={() => { setPrompt(s.prompt); void run(s.prompt) }}
            className="h-[26px] rounded-full border border-black/10 bg-[#f9f9f9] px-3
                       text-black/60 transition-colors hover:border-black/20 hover:text-ink
                       disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-[12px] border border-black/10 bg-[#f9f9f9] p-1.5
                      shadow-[0_18px_50px_-16px_rgba(0,0,0,0.4)]">
        <textarea
          ref={field}
          rows={3}
          value={prompt}
          disabled={busy}
          placeholder="Describe what you want to design"
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(prompt) }
          }}
          className="w-full resize-none bg-transparent px-2 pb-1 pt-1.5 text-[13px] leading-snug
                     outline-none placeholder:text-faint disabled:opacity-50"
        />
        <div className="mt-0.5 flex items-center gap-1.5">
          <Chip
            icon={<Sparkle size={11} />}
            label={label}
            disabled={busy}
            options={(models ?? []).map(m => ({ id: m.id, label: m.label, hint: m.model }))}
            value={chosen}
            onPick={setProvider}
          />
          <button
            disabled={busy || !prompt.trim() || !chosen}
            onClick={() => void run(prompt)}
            className="ml-auto flex h-[26px] items-center gap-1.5 rounded-[7.5px] bg-[#1e1e1e]
                       px-2.5 font-medium text-[#f9f9f9] transition-colors
                       hover:bg-black disabled:opacity-40"
          >
            {busy ? <Spinner /> : <Sections size={12} />}
            {busy ? 'Generating…' : 'Create design'}
          </button>
        </div>
        {error && (
          <p className="px-2 pb-0.5 pt-1.5 text-[10px] leading-relaxed text-[#dc4f70]">{error}</p>
        )}
      </div>
    </div>
  )
}

interface Option { id: string; label: string; hint?: string }

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
        className="inset-control flex h-[26px] max-w-[180px] items-center gap-1.5 px-2
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
                {o.hint && <span className="shrink-0 font-mono text-[9px] text-faint">{o.hint}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span className="size-[11px] shrink-0 animate-spin rounded-full
                     border-[1.5px] border-white/30 border-t-white" />
  )
}

/** the first design of a file, with a template exemplar when one fits */
async function firstDesign(prompt: string, provider: string | null): Promise<string> {
  let exemplar: { title: string; html: string } | undefined
  try {
    const t = await templates.match(prompt)
    if (t) exemplar = { title: t.title, html: templates.excerpt(await templates.html(t.id)) }
  } catch { /* a missing template is not a reason to fail the prompt */ }
  const { made, failed } = await gen.design({
    prompt, width: 1280, height: 832,
    ...(provider ? { provider } : {}),
    ...(exemplar ? { exemplar } : {}),
  })
  const html = made[0]?.html
  if (!html) throw new Error(gen.failNote(failed) ?? 'Nothing came back.')
  return html
}

/** a file name from the prompt: the first few words, capitalised */
function nameFor(prompt: string): string {
  const words = prompt.replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean).slice(0, 5)
  // a name that ends on "for" or "with" reads like it was cut off, because it was
  while (words.length > 1 && /^(a|an|the|for|with|and|of|to|in|on|called)$/i.test(words.at(-1)!)) words.pop()
  const name = words.join(' ')
  return name ? name[0].toUpperCase() + name.slice(1) : 'Untitled'
}

// ---------------------------------------------------------------------- cards

function Card({ file, onChange }: { file: FileMeta; onChange(): void }) {
  const [menu, setMenu] = useState(false)
  const open = () => void useEditor.getState().openFile(file.id)

  return (
    <div
      className="group relative w-[257px] cursor-pointer rounded-[10px] bg-[#f9f9f9] p-1
                 transition-shadow hover:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.25)]"
      onClick={open}
      onContextMenu={e => { e.preventDefault(); if (!file.scratch) setMenu(true) }}
    >
      <div className="flex items-start px-2 pb-2 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 leading-[18px]">
            <span className="truncate">{file.name}</span>
            {file.scratch && <Pen size={13} className="shrink-0 text-black/60" />}
          </div>
          <div className="leading-[18px] text-black/50">
            {file.scratch ? 'Your permanent draft' : `Edited ${files.ago(file.edited)}`}
          </div>
        </div>
        {!file.scratch && <Owner />}
      </div>
      <Preview thumb={file.thumb} className="h-[163px] rounded-[4px]" />

      {menu && (
        <>
          <span className="fixed inset-0 z-[60]" onPointerDown={e => { e.stopPropagation(); setMenu(false) }}
                onClick={e => e.stopPropagation()} />
          <div className="absolute right-2 top-9 z-[61] min-w-[140px] rounded-[9px] border border-black/10
                          bg-panel py-1 shadow-[0_14px_44px_-12px_rgba(0,0,0,0.45)]"
               onClick={e => e.stopPropagation()}>
            <button
              className="flex h-[26px] w-full items-center px-2.5 text-left hover:bg-black/[0.055]"
              onClick={() => {
                const name = window.prompt('Rename file', file.name)
                setMenu(false)
                if (name?.trim()) files.save(file.id, { name: name.trim() }).then(onChange, onChange)
              }}
            >
              Rename
            </button>
            <button
              className="flex h-[26px] w-full items-center px-2.5 text-left text-[#dc4f70] hover:bg-black/[0.055]"
              onClick={() => { setMenu(false); files.remove(file.id).then(onChange, onChange) }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ file, onChange }: { file: FileMeta; onChange(): void }) {
  return (
    <div
      className="flex h-12 cursor-pointer items-center gap-3 border-b border-hair px-3
                 last:border-b-0 hover:bg-black/[0.03]"
      onClick={() => void useEditor.getState().openFile(file.id)}
    >
      <Preview thumb={file.thumb} className="h-8 w-12 rounded-[3px]" />
      <span className="flex-1 truncate">{file.name}</span>
      <span className="w-40 text-black/50">
        {file.scratch ? 'Your permanent draft' : `Edited ${files.ago(file.edited)}`}
      </span>
      {!file.scratch && (
        <button
          className="text-black/40 hover:text-[#dc4f70]"
          onClick={e => { e.stopPropagation(); files.remove(file.id).then(onChange, onChange) }}
          title="delete"
        >
          ×
        </button>
      )}
    </div>
  )
}

/** the account's picture, or its initial on the brand colour */
function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  return src ? (
    <img src={src} alt="" className="shrink-0 rounded-full" style={{ width: size, height: size }} draggable={false} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-flame font-medium text-white"
          style={{ width: size, height: size, fontSize: size * 0.54 }}>
      {name[0]?.toUpperCase() ?? 'e'}
    </span>
  )
}

function Owner() {
  return auth.enabled ? <ClerkOwner /> : <Avatar name="Local" size={24} />
}

function ClerkOwner() {
  const { user } = useUser()
  return <Avatar src={user?.imageUrl} name={user?.username ?? user?.firstName ?? 'e'} size={24} />
}

function Preview({ thumb, className }: { thumb?: string; className: string }) {
  return (
    <div className={`overflow-hidden bg-black/[0.075] ${className}`}>
      {thumb && <img src={thumb} alt="" className="size-full object-cover object-top" draggable={false} />}
    </div>
  )
}
