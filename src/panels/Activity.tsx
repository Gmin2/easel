import { useEffect, useRef, useState } from 'react'
import CodeBlock from './CodeBlock'
import { useEditor } from '../doc/store'
import type { LogEntry } from '../doc/store'
import { toolManifest } from '../mcp/tools'

/**
 * Who did what, most recent first.
 *
 * In a canvas two people are editing, the hard question is not what the
 * document says — you can see that — it is which of you said it. Every entry
 * is attributed, clicking one selects the nodes it touched, and opening one
 * shows the call itself as json, so "the agent changed something" is always
 * one click from "this, here, with these arguments".
 *
 * The pane is a drawer: drag its top edge to give the log more room, or fold
 * it down to the tab bar.
 */

const MIN = 96
const KEY = 'easel.activity'

export default function Activity() {
  const log = useEditor(s => s.log)
  const [tab, setTab] = useState<'log' | 'tools'>('log')
  const [height, setHeight] = useState(() => {
    try { return Number(localStorage.getItem(KEY)) || 220 } catch { return 220 }
  })
  const [open, setOpen] = useState(true)
  const feed = useRef<HTMLDivElement>(null)

  const agentTurns = log.filter(l => l.by === 'agent').length

  useEffect(() => {
    feed.current?.scrollTo({ top: 0 })
  }, [log.length])

  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const start = height
    const max = Math.max(MIN, window.innerHeight - 200)
    const move = (ev: PointerEvent) => {
      const next = Math.min(max, Math.max(MIN, start + (startY - ev.clientY)))
      setHeight(next)
      setOpen(true)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setHeight(h => { try { localStorage.setItem(KEY, String(h)) } catch { /* fine */ } return h })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-line"
      style={{ height: open ? height : 30, transition: 'height 200ms var(--ease-out-strong)' }}
    >
      <div
        className="absolute -top-[3px] left-0 right-0 z-10 h-[6px] cursor-row-resize"
        onPointerDown={drag}
        title="drag to resize"
      />
      <div className="flex h-[30px] shrink-0 items-center gap-1 px-2.5">
        {([['log', 'Activity'], ['tools', 'Tools']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setOpen(true) }}
            className={`rounded-[5px] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]
                        transition-colors
                        ${tab === k && open ? 'bg-black/[0.06] text-ink' : 'text-faint hover:text-dim'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[9px] text-faint">
          {tab === 'log'
            ? `${agentTurns} agent`
            : `${toolManifest.length} tools`}
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? 'fold' : 'unfold'}
          className="grid size-5 place-items-center rounded-[4px] text-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <Chevron down={open} />
        </button>
      </div>

      {open && (
        <div ref={feed} className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
          {tab === 'tools'
            ? <Tools />
            : log.length === 0
              ? <p className="py-2 text-[10px] leading-relaxed text-faint">
                  Nothing yet. Edits show up here whether they came from you or
                  from an agent.
                </p>
              : <ol className="flex flex-col gap-0.5">
                  {[...log].reverse().map(e => <Row key={e.n} e={e} />)}
                </ol>}
        </div>
      )}
    </div>
  )
}

/**
 * One row per entry, the way an agent run reads: a glyph for the kind of
 * call, the tool as a label, and what it touched as a chip. Clicking a row
 * opens the call as json; the chip selects the nodes. After the tool chips
 * and code block at beautifului.dev (MIT).
 */
const GLYPH: Record<'think' | 'write' | 'read' | 'run', React.ReactNode> = {
  think: <path fill="currentColor" stroke="none" d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  read: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  run: <path d="M4 17l6-5-6-5M12 19h8" />,
}

function kindOf(tool: string): keyof typeof GLYPH {
  if (/^(ready|get_guide|think)/.test(tool)) return 'think'
  if (/^(get|list|find|read|export|screenshot)/.test(tool)) return 'read'
  if (/^(insert|write|create|set|update|patch|rename|move|remove|delete|duplicate|group|ungroup|reorder|paste|nudge|fill|text|style|resize|generate|apply|add)/.test(tool)) return 'write'
  return 'run'
}

const IDS = /^[a-z]+\d+$/

/** json for a log entry, trimmed so a pasted page of html does not swamp the panel */
function pretty(v: unknown, cap = 4000): string {
  let s: string
  try {
    s = JSON.stringify(v, (_k, val) =>
      typeof val === 'string' && val.length > 400 ? `${val.slice(0, 400)}… (${val.length} chars)` : val, 2) ?? 'undefined'
  } catch {
    s = String(v)
  }
  return s.length > cap ? `${s.slice(0, cap)}\n… ${s.length - cap} more chars` : s
}


function Row({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false)
  const ids = e.detail.split(', ').filter(id => IDS.test(id))
  const chip = ids.length
    ? `${ids.length} node${ids.length === 1 ? '' : 's'}`
    : e.detail
  const kind = e.error ? 'run' : kindOf(e.tool)
  const hasBody = e.data !== undefined || !!e.error

  return (
    <li style={{ animation: 'fade-up 240ms var(--ease-out-strong) both' }}>
      <div
        className="group flex w-full cursor-default items-center gap-1.5 rounded-[6px] px-1 py-[3px] transition-colors hover:bg-hover"
        onClick={() => { if (hasBody) setOpen(o => !o) }}
        title={e.by === 'agent' ? 'over webmcp' : 'you'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"
             className={`shrink-0 ${e.by === 'agent' ? 'text-[var(--color-agent)]' : 'text-ink-3'}`}>
          {GLYPH[kind]}
        </svg>
        <span className="shrink-0 text-[11px] text-ink">
          {e.tool.replace(/_/g, ' ')}
          {e.count && e.count > 1 && <span className="text-ink-3"> ×{e.count}</span>}
        </span>
        {chip && (
          <button
            onClick={ev => { if (ids.length) { ev.stopPropagation(); useEditor.getState().select(ids) } }}
            className={`min-w-0 flex-1 truncate rounded-[5px] bg-field px-1.5 py-0.5 text-left text-[10px] leading-4 text-ink-2
                        ${ids.length ? 'font-mono hover:bg-hover-2' : 'cursor-default'}`}
            title={ids.length ? 'select these nodes' : e.detail}
          >
            {chip}
          </button>
        )}
        {e.error && (
          <span className="shrink-0 rounded-[5px] bg-[#fdf0f3] px-1.5 py-0.5 font-mono text-[9px] text-red">failed</span>
        )}
        {hasBody && (
          <span className={`shrink-0 text-ink-3 transition-[opacity,transform] ${open ? 'rotate-90' : 'opacity-0 group-hover:opacity-100'}`}>
            <Chevron />
          </span>
        )}
      </div>
      {open && (
        <div className="ml-[18px] mb-1 mr-1 mt-1 flex flex-col gap-1">
          {e.error && (
            <p className="rounded-[6px] bg-[#fdf0f3] px-2 py-1.5 text-[10.5px] leading-relaxed text-red">{e.error}</p>
          )}
          {e.data !== undefined && (
            <CodeBlock
              title={`${e.tool}.json`}
              hint={e.by === 'agent' ? 'tool input' : 'arguments'}
              code={pretty(e.data)}
            />
          )}
        </div>
      )}
    </li>
  )
}

/**
 * What the agent can actually do, read off the same manifest we register,
 * grouped the way the guide groups them and folded by default so the list
 * reads as a table of contents rather than a wall.
 */
const GROUPS: { name: string; test: RegExp }[] = [
  { name: 'Read', test: /^(get|list|find|describe|read)/ },
  { name: 'Write', test: /^(insert|create|set|update|rename|move|remove|delete|duplicate|group|reorder|write|add)/ },
  { name: 'Generate', test: /^(generate|design|make)/ },
  { name: 'Comments', test: /comment/ },
  { name: 'Export', test: /^(export|screenshot|copy)/ },
]

function Tools() {
  const [open, setOpen] = useState<Record<string, boolean>>({ Read: false, Write: true })
  const [shown, setShown] = useState<string | null>(null)

  const grouped = GROUPS.map(g => ({ ...g, tools: [] as typeof toolManifest }))
  const other = { name: 'Other', test: /./, tools: [] as typeof toolManifest }
  for (const t of toolManifest) {
    const g = grouped.find(g => g.test.test(t.name) && !(g.name !== 'Comments' && /comment/.test(t.name)))
    ;(g ?? other).tools.push(t)
  }
  const sections = [...grouped, other].filter(g => g.tools.length)

  return (
    <div className="flex flex-col gap-0.5">
      {sections.map(g => {
        const on = open[g.name] ?? false
        return (
          <div key={g.name}>
            <button
              onClick={() => setOpen(o => ({ ...o, [g.name]: !on }))}
              className="flex h-7 w-full items-center gap-1.5 rounded-[6px] px-1 text-left transition-colors hover:bg-hover"
            >
              <span className="text-[11px] font-medium text-ink">{g.name}</span>
              <span className="font-mono text-[9px] text-ink-3">{g.tools.length}</span>
              <span className={`ml-auto text-ink-3 transition-transform ${on ? 'rotate-180' : ''}`}>
                <Chevron down />
              </span>
            </button>
            {on && (
              <ul className="mb-1 ml-1 flex flex-col gap-px border-l border-line pl-1.5">
                {g.tools.map(t => (
                  <li key={t.name}>
                    <button
                      onClick={() => setShown(shown === t.name ? null : t.name)}
                      className="flex w-full items-baseline gap-1.5 rounded-[4px] px-1 py-[3px]
                                 text-left transition-colors hover:bg-hover"
                    >
                      <span
                        className={`shrink-0 font-mono text-[9px] ${t.readOnly ? 'text-ink-3' : 'text-[var(--color-agent)]'}`}
                        title={t.readOnly ? 'reads only' : 'writes'}
                      >
                        {t.readOnly ? 'get' : 'set'}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink">
                        {t.name}
                      </span>
                    </button>
                    {shown === t.name && (
                      <div className="px-1 pb-1.5 pl-[26px]">
                        <p className="text-[10px] leading-relaxed text-dim">{t.description}</p>
                        {t.params.length > 0 && (
                          <p className="mt-1 font-mono text-[9px] leading-relaxed text-faint">
                            {t.params.map(p => (t.required.includes(p) ? p : `${p}?`)).join('  ')}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

const Chevron = ({ down }: { down?: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {down ? <path d="M6 9l6 6 6-6" /> : <path d="M9 18l6-6-6-6" />}
  </svg>
)
