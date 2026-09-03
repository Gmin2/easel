import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../doc/store'
import type { LogEntry, Source } from '../doc/store'
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
            : <ol className="flex flex-col gap-px">
                {[...log].reverse().map(e => <Row key={e.n} e={e} />)}
              </ol>}
      </div>
    </div>
  )
}

const TINT: Record<Source, string> = {
  human: 'text-dim',
  agent: 'text-[var(--color-agent)]',
}

function Row({ e }: { e: LogEntry }) {
  const ids = e.detail.split(', ').filter(id => /^[a-z]+\d+$/.test(id))

  return (
    <li>
      <button
        disabled={!ids.length}
        onClick={() => useEditor.getState().select(ids)}
        className="group flex w-full items-baseline gap-1.5 rounded-[4px] px-1 py-[3px]
                   text-left transition-colors enabled:hover:bg-black/[0.04]"
      >
        <span
          className={`shrink-0 font-mono text-[9px] uppercase ${TINT[e.by]}`}
          title={e.by === 'agent' ? 'over webmcp' : 'you'}
        >
          {e.by === 'agent' ? '· ai' : '· me'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink">
          {e.tool}
          {e.count && e.count > 1 && (
            <span className="text-faint"> ×{e.count}</span>
          )}
          {e.detail && (
            <span className="text-faint"> {e.detail}</span>
          )}
        </span>
        {e.error && (
          <span className="shrink-0 font-mono text-[9px] text-[#dc4f70]" title={e.error}>
            failed
          </span>
        )}
      </button>
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
