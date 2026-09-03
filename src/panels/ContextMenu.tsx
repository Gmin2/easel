import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface Item {
  /** a separator carries nothing else */
  sep?: true
  label?: string
  /** shown right-aligned, the shortcut that does the same thing */
  keys?: string
  disabled?: boolean
  danger?: boolean
  run?(): void
}

interface Props {
  x: number
  y: number
  items: Item[]
  onClose(): void
}

const W = 232
const ROW = 27
const SEP = 9
const PAD = 5

/**
 * The right-click menu.
 *
 * Everything here is reachable another way; the point is that it is reachable
 * without knowing the shortcut, and that it shows the shortcut so the next time
 * you do. Entries that cannot apply are greyed rather than hidden, so the menu
 * stays the same shape and stays learnable.
 */
export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x, y })
  const [active, setActive] = useState(-1)

  const rows = items.map((it, i) => ({ it, i })).filter(r => !r.it.sep && !r.it.disabled)

  // flip rather than clip: a menu opened near the bottom right of the window
  // should still show all of itself
  useLayoutEffect(() => {
    const h = items.reduce((a, it) => a + (it.sep ? SEP : ROW), 0) + PAD * 2
    const nx = x + W > window.innerWidth - 8 ? Math.max(8, x - W) : x
    const ny = y + h > window.innerHeight - 8 ? Math.max(8, window.innerHeight - 8 - h) : y
    setAt({ x: nx, y: ny })
  }, [x, y, items])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const order = rows.map(r => r.i)
        if (!order.length) return
        const here = order.indexOf(active)
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive(order[(here + step + order.length) % order.length])
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[active]
        if (it?.run && !it.disabled) { onClose(); it.run() }
      }
    }
    // capture, so the app's own shortcuts do not also fire behind the menu
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [items, active, rows, onClose])

  return (
    <div className="fixed inset-0 z-[120]"
         onPointerDown={onClose}
         onContextMenu={e => { e.preventDefault(); onClose() }}>
      <div
        ref={ref}
        onPointerDown={e => e.stopPropagation()}
        style={{ left: at.x, top: at.y, width: W, paddingTop: PAD, paddingBottom: PAD }}
        className="absolute rounded-[9px] border border-black/10 bg-panel
                   shadow-[0_14px_44px_-12px_rgba(0,0,0,0.45)]"
      >
        {items.map((it, i) => it.sep ? (
          <span key={i} className="my-1 block h-px bg-hair" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => { onClose(); it.run?.() }}
            style={{ height: ROW }}
            className={`flex w-full items-center gap-3 px-3 text-left
                        disabled:opacity-35
                        ${it.danger ? 'text-[#c0392b]' : ''}
                        ${active === i && !it.disabled ? 'bg-black/[0.055]' : ''}`}
          >
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.keys && (
              <span className="shrink-0 font-mono text-[10px] text-faint tabular-nums">
                {it.keys}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
