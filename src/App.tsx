import { useEffect, useMemo, useState } from 'react'
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/clerk-react'
import Home from './Home'
import Login from './Login'
import * as auth from './lib/auth'
import * as files from './lib/files'
import * as route from './lib/route'
import Canvas from './canvas/Canvas'
import ContextMenu from './panels/ContextMenu'
import type { Item } from './panels/ContextMenu'
import LeftPanel from './panels/LeftPanel'
import PromptBar from './panels/PromptBar'
import RightPanel from './panels/RightPanel'
import ToolRail, { TOOL_KEYS } from './panels/ToolRail'
import { toHtml, toJsx } from './doc/html'
import { useEditor } from './doc/store'
import { KEYFRAMES } from './lib/effects'
import { PanelIcon } from './icons'
import { copyPng, downloadPng } from './lib/png'

const NUDGE = { small: 1, large: 8 }

/**
 * Signed out, the login page. Signed in, the home page or the editor.
 *
 * The callback route is where Clerk lands after GitHub; it finishes the
 * session and bounces to `/`. There is no router because there are only two
 * paths and the second one exists for a moment.
 */
export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [gate, setGate] = useState(false)
  // nothing asks the api until the guest flag matches the session
  const [ready, setReady] = useState(false)

  useEffect(() => {
    auth.bind(isSignedIn ? () => getToken() : null)
    return () => auth.bind(null)
  }, [isSignedIn, getToken])

  // signed out is not locked out: the editor runs on files kept in this
  // browser, and sign in is asked for when something needs the account
  useEffect(() => {
    if (!isLoaded) return
    const guest = !isSignedIn
    auth.setGuest(guest)
    useEditor.getState().setGuest(guest)
    auth.onSignInRequest(guest ? () => setGate(true) : null)
    if (!guest) {
      // whatever a guest made comes along, and a fresh account opens on its
      // scratchpad rather than on an empty list
      void files.adopt().then(async n => {
        const s = useEditor.getState()
        if (n) s.note({ by: 'human', tool: 'sign in', detail: `${n} file${n === 1 ? '' : 's'} moved to your account` })
        if (s.view !== 'landing') return
        const all = await files.list().catch(() => [])
        const scratch = all.find(f => f.scratch)
        if (scratch && all.length === 1) void s.openFile(scratch.id)
      })
    }
    setReady(true)
    return () => auth.onSignInRequest(null)
  }, [isLoaded, isSignedIn])

  if (location.pathname === '/sso-callback') return <AuthenticateWithRedirectCallback />
  if (!isLoaded || !ready) return <div className="h-full w-full bg-panel" />
  if (!isSignedIn && gate) return <Login onBack={() => setGate(false)} />
  return <Editor />
}

export function Editor() {
  const view = useEditor(s => s.view)
  const panels = useEditor(s => s.panels)
  const inspector = useEditor(s => s.inspector)
  const tool = useEditor(s => s.tool)
  const menu = useEditor(s => s.menu)
  const sel = useEditor(s => s.sel)
  const doc = useEditor(s => s.doc)

  // A selection is shareable: the primary node rides in the hash, so a link
  // reopens the file looking at the thing that was being discussed. An agent
  // that called select_nodes has therefore also written a url you can send.
  useEffect(() => {
    const want = sel[0] ? `#${sel[0]}` : ''
    if (location.hash !== want) {
      history.replaceState(null, '', `${location.pathname}${want}`)
    }
  }, [sel])

  useEffect(() => {
    const open = () => {
      const id = location.hash.slice(1)
      const s = useEditor.getState()
      if (id && s.doc.nodes[id] && s.sel[0] !== id) s.select([id])
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])

  // The file and page ride in the path, so a link opens the same board the
  // way it does in Paper or Figma. Home is the bare root.
  const file = useEditor(s => s.file)
  const page = doc.page
  useEffect(() => {
    const want = view === 'editor' && file ? route.pathFor(file.id, page) : '/'
    if (location.pathname === want) return
    if (location.pathname === '/sso-callback') return
    // a new file is a place you can go back to; a page switch within it is not
    const method = want === '/' || location.pathname === '/' || route.parse()?.file !== file?.id ? 'pushState' : 'replaceState'
    history[method](null, '', `${want}${want === '/' ? '' : location.hash}`)
  }, [view, file, page])

  useEffect(() => {
    const go = async () => {
      const at = route.parse()
      const s = useEditor.getState()
      if (!at) { if (s.view === 'editor') void s.goHome(); return }
      if (s.file?.id !== at.file) {
        try { await s.openFile(at.file) } catch { history.replaceState(null, '', '/'); return }
      }
      if (at.page) useEditor.getState().showPage(at.page)
    }
    void go()
    window.addEventListener('popstate', go)
    return () => window.removeEventListener('popstate', go)
  }, [])

  // Shortcuts read the store rather than closing over state, so the handler
  // is installed once and never sees a stale selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT'
        || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return

      const s = useEditor.getState()
      // the home page has no tools to switch and no selection to nudge
      if (s.view !== 'editor') return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && key === '\\') { e.preventDefault(); s.setPanels(!s.panels); return }

      // the prompt tools, on Paper's bindings so the muscle memory carries
      // over. these come before ⌘D and ⌘I, which would otherwise swallow them
      if (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'd')) {
        e.preventDefault()
        s.setTool(key === 'i' ? 'image' : key === 'j' ? 'svg' : 'design')
        return
      }

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && (key === 'c' || key === 'x')) {
        e.preventDefault()
        s.copy()
        if (key === 'x') s.remove(s.sel)
        return
      }
      if (mod && key === 'v') { e.preventDefault(); s.paste(); return }
      if (mod && key === 'd') { e.preventDefault(); s.duplicate(s.sel); return }
      if (mod && key === 'a') { e.preventDefault(); s.selectAll(); return }
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) s.ungroup(s.sel)
        else s.group(s.sel)
        return
      }
      if (mod && (key === ']' || key === '[')) {
        e.preventDefault()
        const front = key === ']'
        s.reorder(s.sel, e.shiftKey ? (front ? 'front' : 'back') : (front ? 'up' : 'down'))
        return
      }

      // C on a selection: leave a note pinned to it for an agent to pick up
      if (!mod && key === 'c' && s.sel[0] && !s.editing) {
        e.preventDefault()
        s.startComment(s.sel[0])
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!s.sel.length) return
        e.preventDefault()
        s.remove(s.sel)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (s.editing) return
        // a deep pick walks back up a level at a time before letting go
        const one = s.sel.length === 1 ? s.doc.nodes[s.sel[0]] : null
        const up = one?.parent ? s.doc.nodes[one.parent] : null
        if (up && up.type !== 'artboard' && up.id !== s.inside) { s.select([up.id]); return }
        if (s.inside) { s.setInside(null); s.select([]) }
        else s.select([])
        return
      }

      if (e.key === 'Enter' && s.sel.length === 1 && !s.editing) {
        const n = s.doc.nodes[s.sel[0]]
        if (n?.text !== undefined) {
          e.preventDefault()
          s.snapshot()
          s.setEditing(n.id)
        }
        return
      }

      if (e.key.startsWith('Arrow') && s.sel.length) {
        e.preventDefault()
        const step = e.shiftKey ? NUDGE.large : NUDGE.small
        const [dx, dy] = {
          ArrowLeft: [-step, 0], ArrowRight: [step, 0],
          ArrowUp: [0, -step], ArrowDown: [0, step],
        }[e.key] ?? [0, 0]
        s.nudge(dx, dy)
        return
      }

      if (!mod && !e.altKey && TOOL_KEYS[key]) s.setTool(TOOL_KEYS[key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo<Item[]>(() => {
    const s = useEditor.getState()
    const one = sel.length === 1 ? doc.nodes[sel[0]] : null
    const any = sel.length > 0
    const groupable = sel.length > 1
    const ungroupable = sel.some(id => doc.nodes[id]?.type === 'frame')

    return [
      {
        label: 'Edit text', keys: '↵',
        disabled: !one || one.text === undefined,
        run: () => { if (one) { s.snapshot(); s.setEditing(one.id) } },
      },
      {
        label: 'Copy HTML',
        disabled: !one,
        run: () => { if (one) void navigator.clipboard.writeText(toHtml(doc, one.id)) },
      },
      {
        label: 'Copy as React',
        disabled: !one,
        run: () => { if (one) void navigator.clipboard.writeText(toJsx(doc, one.id)) },
      },
      {
        label: 'Copy as PNG',
        disabled: !one,
        run: () => { if (one) void copyPng(one.id) },
      },
      {
        label: 'Save PNG',
        disabled: !one,
        run: () => { if (one) void downloadPng(one.id, one.name) },
      },
      { sep: true },
      { label: 'Copy', keys: '⌘C', disabled: !any, run: () => s.copy() },
      { label: 'Paste', keys: '⌘V', run: () => s.paste() },
      { label: 'Duplicate', keys: '⌘D', disabled: !any, run: () => s.duplicate(sel) },
      { sep: true },
      { label: 'Bring to front', keys: '⇧⌘]', disabled: !any, run: () => s.reorder(sel, 'front') },
      { label: 'Bring forward', keys: '⌘]', disabled: !any, run: () => s.reorder(sel, 'up') },
      { label: 'Send backward', keys: '⌘[', disabled: !any, run: () => s.reorder(sel, 'down') },
      { label: 'Send to back', keys: '⇧⌘[', disabled: !any, run: () => s.reorder(sel, 'back') },
      { sep: true },
      { label: 'Group', keys: '⌘G', disabled: !groupable, run: () => s.group(sel) },
      { label: 'Ungroup', keys: '⇧⌘G', disabled: !ungroupable, run: () => s.ungroup(sel) },
      { sep: true },
      { label: 'Delete', keys: '⌫', danger: true, disabled: !any, run: () => s.remove(sel) },
    ]
  }, [sel, doc])

  if (view === 'landing') return <Home />

  return (
    <div className="relative flex h-full w-full">
      {/* the animated effects' keyframes, from the same string the export
          ships, so a drifting gradient cannot look one way here and another
          way in the page someone publishes */}
      <style>{KEYFRAMES}</style>

      {panels && <LeftPanel />}
      <ToolRail tool={tool} onTool={t => useEditor.getState().setTool(t)} floating={!panels} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Canvas />
        <PromptBar />
      </div>

      {panels && inspector && <RightPanel />}

      {panels && !inspector && (
        <button
          className="absolute right-3 top-3 z-30 grid size-8 place-items-center rounded-[8px] border border-black/10
                     bg-panel text-dim shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)] hover:text-ink"
          title="show inspector"
          onClick={() => useEditor.getState().setInspector(true)}
        >
          <PanelIcon size={15} />
        </button>
      )}

      {!panels && (
        <button
          className="absolute left-3 top-3 z-30 rounded-[8px] border border-black/10 bg-panel
                     px-2.5 py-1.5 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]"
          onClick={() => useEditor.getState().setPanels(true)}
        >
          Easel
        </button>
      )}

      <GuestNudge key={file?.id ?? 'none'} />

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} items={items}
          onClose={() => useEditor.getState().setMenu(null)}
        />
      )}
    </div>
  )
}

/**
 * The first edit a guest makes is when it matters where the file lives.
 * One card, once per session, dismissable, with the one action that fixes it.
 */
function GuestNudge() {
  const guest = useEditor(s => s.guest)
  const log = useEditor(s => s.log)
  // the landing of a generation is not an edit; the first change to it is.
  // the activity log already knows the difference, so read it from there
  const [baseline] = useState(log.length)
  const [state, setState] = useState<'idle' | 'shown' | 'done'>(() => {
    try { return sessionStorage.getItem('easel:nudged') ? 'done' : 'idle' } catch { return 'idle' }
  })
  useEffect(() => {
    if (!guest || state !== 'idle') return
    const setup = new Set(['ready', 'save', 'sign in', 'insertHtml', 'createArtboard', 'fitBoard', 'select', 'comment', 'newFile', 'openFile'])
    const edited = log.slice(baseline).some(e => !e.error && (e.by === 'agent' || !setup.has(e.tool)))
    if (edited) setState('shown')
  }, [guest, log, baseline, state])
  if (!guest || state !== 'shown') return null
  const close = () => { setState('done'); try { sessionStorage.setItem('easel:nudged', '1') } catch { /* ignore */ } }
  return (
    <div className="absolute bottom-5 right-5 z-40 w-[300px] rounded-[10px] border border-black/10 bg-panel p-3.5
                    text-[12px] leading-snug text-ink shadow-[0_18px_50px_-16px_rgba(0,0,0,0.5)]">
      <p className="font-medium">This file lives in this browser.</p>
      <p className="mt-1 text-black/60">Sign in to keep it and to keep generating. Everything you made comes with you.</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => { close(); auth.requestSignIn() }}
          className="h-7 rounded-[7px] bg-[#1e1e1e] px-3 font-medium text-[#f9f9f9] hover:bg-black"
        >
          Sign in with GitHub
        </button>
        <button onClick={close} className="h-7 px-2 text-black/50 hover:text-ink">Later</button>
      </div>
    </div>
  )
}
