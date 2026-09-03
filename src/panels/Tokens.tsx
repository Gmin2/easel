import { useState } from 'react'
import { Section } from './Inspector'
import { useEditor } from '../doc/store'
import { looksColour, tokenName, tokensOf } from '../lib/tokens'
import type { Node } from '../doc/types'

/**
 * The theme panel.
 *
 * Tokens live in the artboard's own style as custom properties, so this panel
 * is a view of the CSS rather than a registry beside it. Nothing here can fall
 * out of step with the design, and nothing has to be resolved at export time
 * because `var(--brand)` was always going to work in a browser.
 */
export default function Tokens({ board }: { board: Node }) {
  const tokens = tokensOf(board.style)
  const doc = useEditor(s => s.doc)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')

  const patch = (k: string, v: string) =>
    useEditor.getState().patchStyle([board.id], { [k]: v })

  const add = () => {
    const key = tokenName(name)
    if (!key || !value.trim()) return
    patch(key, value.trim())
    setName('')
    setValue('')
    setAdding(false)
  }

  /** every node whose css mentions this token */
  const users = (key: string) =>
    Object.values(doc.nodes).filter(n =>
      Object.values(n.style).some(v => v.includes(`var(${key})`)))

  const entries = Object.entries(tokens)

  return (
    <Section label="Theme">
      {entries.length === 0 && !adding && (
        <p className="mb-1.5 text-[10px] leading-relaxed text-faint">
          No tokens yet. A token is a CSS custom property on this artboard, so
          anything inside can use <span className="font-mono">var(--name)</span>.
        </p>
      )}

      <div className="flex flex-col gap-px">
        {entries.map(([key, v]) => {
          const used = users(key)
          return (
            <div key={key} className="group flex items-center gap-1.5 px-1 py-[3px]">
              {looksColour(v) && (
                <span
                  className="size-[13px] shrink-0 rounded-[3px] border border-black/15"
                  style={{ background: v }}
                />
              )}
              <button
                onClick={() => used.length && useEditor.getState().select(used.map(n => n.id))}
                title={used.length ? `select the ${used.length} using it` : 'nothing uses this yet'}
                className="min-w-0 shrink-0 truncate font-mono text-[10.5px] text-ink
                           hover:underline"
              >
                {key}
              </button>
              <input
                value={v}
                onChange={e => patch(key, e.target.value)}
                className="ml-auto w-[74px] min-w-0 rounded-[4px] bg-transparent px-1 text-right
                           font-mono text-[10.5px] outline-none focus:bg-black/[0.05]"
              />
              <button
                onClick={() => patch(key, '')}
                title="remove"
                className="shrink-0 text-faint opacity-0 transition-opacity
                           hover:text-ink group-hover:opacity-100"
              >
                −
              </button>
            </div>
          )
        })}
      </div>

      {adding ? (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus
            placeholder="brand"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
            className="inset-control h-[26px] min-w-0 flex-1 px-2 font-mono text-[11px] outline-none
                       focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
          />
          <input
            placeholder="#ff5c38"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
            className="inset-control h-[26px] min-w-0 flex-1 px-2 font-mono text-[11px] outline-none
                       focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1.5 flex h-[26px] w-full items-center gap-1.5 rounded-[6px] px-2
                     text-dim transition-colors hover:bg-black/[0.04] hover:text-ink"
        >
          Token<span className="ml-auto">+</span>
        </button>
      )}
    </Section>
  )
}
