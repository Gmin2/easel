import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * The composer, which is every prompt in the app.
 *
 * One bar on the home page and one in the editor, so they share the shape:
 * a plus for what to make, the field, a model picker, and send. Typing `/`
 * opens commands and `@` opens mentions, both as a list that grows up from
 * the bar's top edge. The bar knows nothing about what a prompt does; it
 * hands the text back and shows whatever status it is given.
 *
 * After the prompt bar and search list at beautifului.dev (MIT), on our own
 * tokens.
 */

export interface Row {
  id: string
  label: string
  desc?: string
  icon?: ReactNode
  /** the chip after the label, in mono: a tag, a size */
  hint?: string
}

export interface Model { id: string; label: string; hint?: string }

interface Props {
  value: string
  onChange(v: string): void
  onSend(text: string): void
  placeholder: string
  busy?: boolean
  /** the line shown while busy, shimmering */
  status?: string | null
  error?: string | null
  note?: string | null
  models: Model[] | null
  model: string | null
  onModel(id: string): void
  /** the plus menu; none means no plus button */
  plus?: Row[]
  plusActive?: string
  onPlus?(id: string): void
  /** the slash menu */
  commands?: Row[]
  onCommand?(row: Row): void
  /** show the commands as suggestions when the field is empty and focused */
  suggest?: boolean
  /** the at menu; picking one writes `@Label` into the draft */
  mentions?: Row[]
  onMention?(row: Row): void
  /** small chips left of the model picker, the bar's own vocabulary */
  chips?: ReactNode
  autoFocus?: boolean
  className?: string
}

type Menu = { kind: 'slash' | 'at' | 'suggest'; query: string; start: number }

/** the last `@word` or `/word` being typed, if the caret is on it */
function tokenAt(draft: string): Menu | null {
  const m = /(^|\s)([@/])([^\s@/]*)$/.exec(draft)
  if (!m) return null
  return { kind: m[2] === '@' ? 'at' : 'slash', query: m[3].toLowerCase(), start: (m.index ?? 0) + m[1].length }
}

export default function Composer({
  value, onChange, onSend, placeholder, busy, status, error, note,
  models, model, onModel, plus, plusActive, onPlus, commands, onCommand, suggest,
  mentions, onMention, chips, autoFocus, className,
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)
  const [plusOpen, setPlusOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  useEffect(() => { if (autoFocus) field.current?.focus() }, [autoFocus])

  // the field grows with the draft, to a point
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(160, el.scrollHeight)}px`
  }, [value])

  const token = tokenAt(value)
  const menu: Menu | null = dismissed ? null
    : token && ((token.kind === 'slash' && commands?.length) || (token.kind === 'at' && mentions?.length)) ? token
    : suggest && focused && !value.trim() && commands?.length ? { kind: 'suggest', query: '', start: 0 }
    : null

  const rows = (() => {
    if (!menu) return []
    const pool = menu.kind === 'at' ? mentions ?? [] : commands ?? []
    if (!menu.query) return pool.slice(0, 8)
    return pool.filter(r =>
      r.label.toLowerCase().includes(menu.query) || r.desc?.toLowerCase().includes(menu.query)).slice(0, 8)
  })()

  const pick = (row: Row) => {
    if (!menu) return
    if (menu.kind === 'at') {
      onChange(`${value.slice(0, menu.start)}@${row.label} `)
      onMention?.(row)
    } else {
      onChange(menu.kind === 'slash' ? value.slice(0, menu.start) : value)
      onCommand?.(row)
    }
    setDismissed(false)
    field.current?.focus()
  }

  const send = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
  }

  const canSend = !!value.trim() && !busy && !!model
  const modelLabel = models?.find(m => m.id === model)?.label ?? (models ? 'No model' : 'Loading…')

  return (
    <div className={className ?? 'relative'} onPointerDown={e => e.stopPropagation()}>
      {menu && rows.length > 0 && (
        <List
          rows={rows}
          active={active}
          onHover={setActive}
          onPick={pick}
          hint={menu.kind === 'at' ? 'Type to search nodes on the artboard'
            : menu.kind === 'slash' ? 'Type to search commands'
            : 'Suggestions · type to search'}
        />
      )}

      {plusOpen && plus && (
        <Popover side="left" onClose={() => setPlusOpen(false)}>
          {plus.map(r => (
            <button
              key={r.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onPlus?.(r.id); setPlusOpen(false); field.current?.focus() }}
              className="relative flex h-8 w-full items-center gap-2.5 rounded-[6px] px-2 text-left hover:bg-hover"
            >
              {r.icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{r.icon}</span>}
              <span className="shrink-0 text-[12.5px] font-medium text-ink">{r.label}</span>
              {r.desc && <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{r.desc}</span>}
              <Check on={r.id === plusActive} />
            </button>
          ))}
        </Popover>
      )}

      {modelOpen && (
        <Popover side="right" onClose={() => setModelOpen(false)}>
          {(models ?? []).map(m => (
            <button
              key={m.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onModel(m.id); setModelOpen(false); field.current?.focus() }}
              className="flex h-[30px] w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-hover"
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{m.label}</span>
              {m.hint && <span className="shrink-0 font-mono text-[10px] text-ink-3">{m.hint}</span>}
              <Check on={m.id === model} />
            </button>
          ))}
          {models && !models.length && (
            <div className="flex h-8 items-center px-2 text-[12px] text-ink-3">No models on this deployment</div>
          )}
        </Popover>
      )}

      <div className="relative isolate flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-1.5
                      shadow-card transition-colors duration-150 focus-within:border-line-strong">
        {busy && status && (
          <div className="flex h-7 items-center gap-2 px-1.5">
            <Sparkle />
            <span className="shimmer text-[12.5px]">{status}</span>
          </div>
        )}

        <div className="flex items-end gap-1">
          {plus && (
            <button
              title="what to make"
              aria-expanded={plusOpen}
              onClick={() => { setModelOpen(false); setPlusOpen(o => !o) }}
              className={`grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-[background-color,color,transform]
                          duration-150 hover:bg-hover hover:text-ink active:scale-[0.94]
                          ${plusOpen ? 'bg-hover text-ink' : ''}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}

          <textarea
            ref={field}
            rows={1}
            value={value}
            disabled={busy}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={e => { onChange(e.target.value); setActive(0); setDismissed(false); setPlusOpen(false); setModelOpen(false) }}
            onKeyDown={e => {
              if (menu && rows.length) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive(a => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
                  return
                }
                if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                  e.preventDefault()
                  pick(rows[active])
                  return
                }
              }
              if (e.key === 'Escape') {
                if (menu) { e.preventDefault(); setDismissed(true); return }
                e.currentTarget.blur()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            className="min-h-7 w-full min-w-0 resize-none bg-transparent px-1 py-[5px] text-[13px] leading-[18px]
                       text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 disabled:opacity-60"
          />

          {chips}

          <button
            aria-expanded={modelOpen}
            title="model"
            disabled={busy}
            onClick={() => { setPlusOpen(false); setModelOpen(o => !o) }}
            className="flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-[12px] font-medium text-ink-2
                       transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            <span className="max-w-[120px] truncate">{modelLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-ink-3">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <button
            title="send  ↵"
            disabled={!canSend}
            onClick={send}
            className="grid size-7 shrink-0 place-items-center rounded-[8px] transition-[background-color,color,transform]
                       duration-200 enabled:active:scale-[0.94]"
            style={{
              background: canSend ? 'var(--color-ink)' : 'var(--color-line-strong)',
              color: canSend ? '#fff' : 'var(--color-ink-2)',
            }}
          >
            {busy ? (
              <span className="size-3 rounded-full border-[1.5px] border-black/20 border-t-black/70"
                    style={{ animation: 'spin 700ms linear infinite' }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>

        {(error || note) && (
          <p className={`px-1.5 pb-0.5 text-[11px] leading-relaxed ${error ? 'text-red' : 'text-ink-3'}`}>
            {error ?? note}
          </p>
        )}
      </div>
    </div>
  )
}

/** the list that grows up from the bar: commands, mentions, or suggestions */
function List({ rows, active, onHover, onPick, hint }: {
  rows: Row[]; active: number; onHover(i: number): void; onPick(r: Row): void; hint: string
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
      style={{ animation: 'pop-in 180ms var(--ease-out-strong) both', transformOrigin: 'bottom center' }}
    >
      {rows.map((r, i) => (
        <button
          key={r.id}
          onMouseDown={e => e.preventDefault()}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(r)}
          className={`flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left transition-colors duration-100
                      ${i === active ? 'bg-hover' : ''}`}
        >
          {r.icon && <span className="grid size-5 shrink-0 place-items-center text-ink-2">{r.icon}</span>}
          <span className="shrink-0 text-[12.5px] font-medium text-ink">{r.label}</span>
          {r.desc && <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{r.desc}</span>}
          {r.hint && <span className="shrink-0 font-mono text-[10px] text-ink-3">{r.hint}</span>}
        </button>
      ))}
      <div className="mt-1 border-t border-line px-2 pb-1 pt-1.5 text-[11px] text-ink-3">{hint}</div>
    </div>
  )
}

function Popover({ side, onClose, children }: { side: 'left' | 'right'; onClose(): void; children: ReactNode }) {
  return (
    <>
      <span className="fixed inset-0 z-[9]" onPointerDown={onClose} />
      <div
        className={`absolute bottom-full z-10 mb-2 min-w-[184px] rounded-[10px] bg-surface p-1 shadow-raised
                    ${side === 'left' ? 'left-0' : 'right-0'}`}
        style={{ animation: 'pop-in 180ms var(--ease-out-strong) both', transformOrigin: `bottom ${side}` }}
      >
        {children}
      </div>
    </>
  )
}

const Check = ({ on }: { on: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
       strokeLinejoin="round" className={`shrink-0 text-ink ${on ? '' : 'invisible'}`}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const Sparkle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-ink-3" aria-hidden>
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  </svg>
)
