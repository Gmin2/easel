import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A small code listing: a header with a name and a copy button, then
 * numbered lines with light JSON colouring. After the code block at
 * beautifului.dev (MIT), cut down to what a log entry needs.
 */
export default function CodeBlock({ title, code, hint }: { title: string; code: string; hint?: string }) {
  const [copied, setCopied] = useState(false)
  const lines = code.split('\n')

  return (
    <div className="overflow-hidden rounded-[8px] bg-surface shadow-hairline">
      <div className="flex h-7 items-center gap-1.5 border-b border-line px-2 text-[11px]">
        <Braces />
        <span className="min-w-0 truncate font-mono text-ink">{title}</span>
        {hint && <span className="shrink-0 font-mono text-[10px] text-ink-3">{hint}</span>}
        <button
          onClick={() => {
            void navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="-mr-1 ml-auto flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-[11px] text-ink-2
                     transition-colors hover:bg-hover hover:text-ink"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="relative max-h-[260px] overflow-auto py-1.5 font-mono text-[10.5px] leading-[1.6] text-ink-2">
        <span className="pointer-events-none absolute inset-y-0 left-[26px] w-px bg-line" />
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[26px_minmax(0,1fr)] items-start">
            <span className="select-none pr-1 text-right text-[9.5px] text-ink-3">{i + 1}</span>
            <code className="whitespace-pre-wrap break-words pl-2 pr-2">{highlight(line)}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b-?\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/g

/** keys in ink, strings and numbers in orange, the literals in accent */
function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(<span key={k++}>{text.slice(last, at)}</span>)
    const t = m[0]
    if (m[2]) {
      out.push(<span key={k++} className="font-medium text-ink">{m[1]}</span>)
      out.push(<span key={k++}>{m[2]}</span>)
    } else if (t.startsWith('"') || /^-?\d/.test(t)) {
      out.push(<span key={k++} style={{ color: '#c2410c' }}>{t}</span>)
    } else {
      out.push(<span key={k++} className="text-accent-ink">{t}</span>)
    }
    last = at + t.length
  }
  if (last < text.length) out.push(<span key={k++}>{text.slice(last)}</span>)
  return out
}

const Braces = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
  </svg>
)
