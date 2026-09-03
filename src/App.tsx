import { useEffect, useMemo } from 'react'
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/clerk-react'
import Home from './Home'
import Login from './Login'
import * as auth from './lib/auth'
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

  useEffect(() => {
    auth.bind(isSignedIn ? () => getToken() : null)
    return () => auth.bind(null)
  }, [isSignedIn, getToken])

  if (location.pathname === '/sso-callback') return <AuthenticateWithRedirectCallback />
  if (!isLoaded) return <div className="h-full w-full bg-panel" />
  if (!isSignedIn) return <Login />
  return <Editor />
}

export function Editor() {
  const view = useEditor(s => s.view)
  const panels = useEditor(s => s.panels)
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

      {panels && <RightPanel />}

      {!panels && (
        <button
          className="absolute left-3 top-3 z-30 rounded-[8px] border border-black/10 bg-panel
                     px-2.5 py-1.5 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]"
          onClick={() => useEditor.getState().setPanels(true)}
        >
          Easel
        </button>
      )}

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} items={items}
          onClose={() => useEditor.getState().setMenu(null)}
        />
      )}
    </div>
  )
}
