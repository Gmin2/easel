import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../doc/store'
import type { LogEntry } from '../doc/store'
import { toolManifest } from '../mcp/tools'

/**
 * Who did what, most recent first.
 *
 * In a canvas two people are editing, the hard question is not what the
 * document says — you can see that — it is which of you said it. Every entry
 * is attributed and clicking one selects the nodes it touched, so "the agent
 * changed something" is always one click from "this, here".
 */
export default function Activity() {
  const log = useEditor(s => s.log)
  const [tab, setTab] = useState<'log' | 'tools'>('log')
  const feed = useRef<HTMLDivElement>(null)

  const agentTurns = log.filter(l => l.by === 'agent').length

  useEffect(() => {
    feed.current?.scrollTo({ top: 0 })
  }, [log.length])

  return (
    <div className="flex min-h-0 flex-col border-t border-line">
      <div className="flex items-center gap-1 px-2.5 pb-1.5 pt-2">
        {([['log', 'Activity'], ['tools', 'Tools']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-[5px] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]
                        transition-colors
                        ${tab === k ? 'bg-black/[0.06] text-ink' : 'text-faint hover:text-dim'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[9px] text-faint">
          {tab === 'log'
            ? `${agentTurns} agent`
            : `${toolManifest.length} tools`}
        </span>
      </div>

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
    </div>
  )
}

/**
 * One row per entry, the way an agent run reads: a glyph for the kind of
 * call, the tool as a label, and what it touched as a chip. Rows with node
 * ids select them on click; rows with an error open on click to show it.
 * After the tool chips at beautifului.dev (MIT).
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
  if (/^(insert|write|create|set|update|patch|rename|move|remove|delete|duplicate|group|ungroup|reorder|paste|nudge|fill|text|style|resize|generate|apply)/.test(tool)) return 'write'
  return 'run'
}

const IDS = /^[a-z]+\d+$/

function Row({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false)
  const ids = e.detail.split(', ').filter(id => IDS.test(id))
  const chip = ids.length
    ? `${ids.length} node${ids.length === 1 ? '' : 's'}`
    : e.detail
  const kind = e.error ? 'run' : kindOf(e.tool)

  return (
    <li style={{ animation: 'fade-up 240ms var(--ease-out-strong) both' }}>
      <button
        onClick={() => {
          if (ids.length) useEditor.getState().select(ids)
          if (e.error || (!ids.length && e.detail.length > 28)) setOpen(o => !o)
        }}
        className="group flex w-full items-center gap-1.5 rounded-[6px] px-1 py-[3px] text-left transition-colors hover:bg-hover"
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
          <span className={`min-w-0 flex-1 truncate rounded-[5px] bg-field px-1.5 py-0.5 text-[10px] leading-4
                            ${ids.length ? 'font-mono text-ink-2' : 'text-ink-2'}`}>
            {chip}
          </span>
        )}
        {e.error && (
          <span className="shrink-0 rounded-[5px] bg-[#fdf0f3] px-1.5 py-0.5 font-mono text-[9px] text-red">failed</span>
        )}
      </button>
      {open && (e.error || e.detail) && (
        <p className="ml-[22px] mr-1 mt-0.5 rounded-[6px] bg-field px-2 py-1.5 text-[10.5px] leading-relaxed text-ink-2">
          {e.error ?? e.detail}
        </p>
      )}
    </li>
  )
}

/** what the agent can actually do, read off the same manifest we register */
function Tools() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="flex flex-col gap-px">
      {toolManifest.map(t => (
        <li key={t.name}>
          <button
            onClick={() => setOpen(open === t.name ? null : t.name)}
            className="flex w-full items-baseline gap-1.5 rounded-[4px] px-1 py-[3px]
                       text-left transition-colors hover:bg-black/[0.04]"
          >
            <span
              className={`shrink-0 font-mono text-[9px] ${t.readOnly ? 'text-faint' : 'text-[var(--color-agent)]'}`}
              title={t.readOnly ? 'reads only' : 'writes'}
            >
              {t.readOnly ? 'get' : 'set'}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink">
              {t.name}
            </span>
          </button>
          {open === t.name && (
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
  )
}
