import { useEffect, useRef, useState } from 'react'

interface Props {
  label?: string
  value: number
  /** decimals to show while not focused */
  precision?: number
  step?: number
  min?: number
  max?: number
  suffix?: string
  onChange(v: number): void
}

// An editable value field. Commits on enter and on blur, reverts on escape,
// arrows nudge by step (10x with shift), and dragging sideways on the label
// scrubs the value the way every design tool does.
export default function NumField({
  label, value, precision = 0, step = 1, min = -Infinity, max = Infinity,
  suffix, onChange,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const drag = useRef<{ x: number; from: number } | null>(null)

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const shown = draft ?? value.toFixed(precision) + (suffix ?? '')

  const commit = (text: string) => {
    const n = parseFloat(text.replace(/[^0-9.+-]/g, ''))
    if (!Number.isNaN(n)) onChange(clamp(n))
    setDraft(null)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const mult = e.shiftKey ? 10 : 1
      onChange(clamp(d.from + (e.clientX - d.x) * step * mult))
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onChange, step, min, max])

  return (
    <div className="inset-control flex h-[26px] items-center gap-1.5 px-2
                    focus-within:border-[#2d52f0] focus-within:ring-2
                    focus-within:ring-[#2d52f0]/25">
      {label && (
        <span
          onPointerDown={e => {
            e.preventDefault()
            drag.current = { x: e.clientX, from: value }
          }}
          className="shrink-0 cursor-ew-resize select-none text-faint"
        >
          {label}
        </span>
      )}
      <input
        ref={input}
        value={shown}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setDraft(String(value))}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') input.current?.blur()
          if (e.key === 'Escape') { setDraft(null); input.current?.blur() }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const dir = e.key === 'ArrowUp' ? 1 : -1
            const next = clamp(value + dir * step * (e.shiftKey ? 10 : 1))
            onChange(next)
            setDraft(String(next))
          }
        }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
      />
    </div>
  )
}
