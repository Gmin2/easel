import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ColorPicker from './ColorPicker'

interface Props {
  hex: string
  alpha: number
  label?: string
  onChange(hex: string, alpha: number): void
}

const PICKER_W = 530

/**
 * A hex swatch that opens the picker. The picker renders through a portal
 * rather than inside the row: the inspector scrolls, and a scroll container
 * clips its children on both axes, so an in-flow popover simply vanishes.
 */
export default function ColorRow({ hex, alpha, label, onChange }: Props) {
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const flat = hex.replace('#', '').toUpperCase()

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = () => {
      const r = btn.current!.getBoundingClientRect()
      setAt({
        x: Math.max(12, r.left - PICKER_W - 16),
        y: Math.min(Math.max(12, r.top - 40), window.innerHeight - 430),
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // clicking anywhere else puts it away
  useLayoutEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!btn.current?.contains(e.target as HTMLElement)) setOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('pointerdown', away), 0)
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', away) }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen(o => !o)}
        className={`inset-control flex h-[26px] w-full items-center gap-2 px-2
                    transition-colors hover:bg-black/[0.02]
                    ${open ? 'border-[#2d52f0] ring-2 ring-[#2d52f0]/25' : ''}`}
      >
        {/* checkerboard behind the swatch so white and transparent read apart */}
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/25"
          style={{
            backgroundImage:
              `linear-gradient(${hex}, ${hex}),
               linear-gradient(45deg, #d8d8d8 25%, transparent 25%, transparent 75%, #d8d8d8 75%),
               linear-gradient(45deg, #d8d8d8 25%, #fff 25%, #fff 75%, #d8d8d8 75%)`,
            backgroundSize: '100% 100%, 6px 6px, 6px 6px',
            backgroundPosition: '0 0, 0 0, 3px 3px',
            opacity: alpha < 1 ? 1 : undefined,
          }}
        />
        <span className="tabular-nums">{label ?? flat}</span>
        <span className="ml-auto text-dim tabular-nums">{Math.round(alpha * 100)} %</span>
      </button>
      {open && createPortal(
        <div className="fixed z-[100]" style={{ left: at.x, top: at.y }}
             onPointerDown={e => e.stopPropagation()}>
          <ColorPicker hex={flat} alpha={alpha} onClose={() => setOpen(false)}
                       onChange={(h, a) => onChange('#' + h, a)} />
        </div>,
        document.body,
      )}
    </>
  )
}
