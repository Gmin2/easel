import { useEffect, useRef, useState } from 'react'
import {
  cssRgb, hexToRgb, hslToRgb, hsvToRgb, oklchToRgb, rgbToHex, rgbToHsl,
  rgbToHsv, rgbToOklch,
} from '../lib/color'
import NumField from './NumField'
import type { HSV } from '../lib/color'

interface Props {
  hex: string
  alpha: number
  onChange(hex: string, alpha: number): void
  onClose(): void
}

/** drag anywhere in a box and get back 0..1 coordinates */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const emit = (e: PointerEvent | React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onMove(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    )
  }
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    emit(e)
    const move = (ev: PointerEvent) => emit(ev)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { ref, onPointerDown: down }
}

function Row({ label, values, precision, onEdit, onCopy }: {
  label: string[]
  values: number[]
  precision: number[]
  onEdit(i: number, v: number): void
  onCopy(): void
}) {
  return (
    <div className="flex items-start gap-1.5">
      <div className="grid flex-1 grid-cols-3 gap-1.5">
        {values.map((v, i) => (
          <div key={i}>
            <NumField
              value={v}
              precision={precision[i]}
              step={precision[i] >= 3 ? 0.005 : precision[i] >= 1 ? 0.5 : 1}
              onChange={n => onEdit(i, n)}
            />
            <p className="mt-1 text-center text-[10px] text-dim">{label[i]}</p>
          </div>
        ))}
      </div>
      <button onClick={onCopy} title="copy"
              className="inset-control grid h-[26px] w-[26px] shrink-0 place-items-center
                         text-dim transition-colors hover:text-ink">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.25" y="4.25" width="6.5" height="6.5" rx="1.5" />
          <path d="M7.75 1.25h-5a1.5 1.5 0 0 0-1.5 1.5v5" />
        </svg>
      </button>
    </div>
  )
}

export default function ColorPicker({ hex, alpha, onChange, onClose }: Props) {
  const start = useRef({ hex, alpha })
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }))
  const [a, setA] = useState(alpha)
  const [space, setSpace] = useState<'srgb' | 'p3'>('srgb')
  const [draft, setDraft] = useState<string | null>(null)

  const rgb = hsvToRgb(hsv)
  const current = rgbToHex(rgb)

  useEffect(() => { onChange(current, a) }, [current, a])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sv = useDrag((x, y) => setHsv(h => ({ ...h, s: x, v: 1 - y })))
  const hue = useDrag((_, y) => setHsv(h => ({ ...h, h: (1 - y) * 360 })))
  const opa = useDrag((_, y) => setA(1 - y))

  const [L, C, H] = rgbToOklch(rgb)
  const [hh, ss, ll] = rgbToHsl(rgb)
  const pure = cssRgb(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))
  const copy = (s: string) => navigator.clipboard?.writeText(s).catch(() => {})

  const commit = (text: string) => {
    const [h, pct] = text.split('/').map(s => s.trim())
    const parsed = hexToRgb(h)
    if (parsed) setHsv(rgbToHsv(parsed))
    const p = parseFloat((pct ?? '').replace('%', ''))
    if (!Number.isNaN(p)) setA(Math.min(1, Math.max(0, p / 100)))
    setDraft(null)
  }

  const pick = async () => {
    const EyeDropper = (window as unknown as {
      EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> }
    }).EyeDropper
    if (!EyeDropper) return
    try {
      const res = await new EyeDropper().open()
      const parsed = hexToRgb(res.sRGBHex)
      if (parsed) setHsv(rgbToHsv(parsed))
    } catch { /* dismissed */ }
  }

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      className="w-[530px] overflow-hidden rounded-[10px] border border-black/10
                 bg-panel shadow-[0_16px_50px_-12px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center gap-1 border-b border-hair px-2 py-1.5">
        {([['srgb', 'sRGB'], ['p3', 'Display P3']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSpace(k)}
            className={`h-[26px] rounded-[6px] px-2.5 transition-colors
                        ${space === k ? 'bg-surface font-medium shadow-[0_1px_2px_rgba(0,0,0,0.07)]'
                                      : 'text-dim hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
        <button onClick={pick} title="eyedropper"
                className="ml-auto grid h-7 w-7 place-items-center text-dim
                           transition-colors hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 3.6l2.9 2.9M10.9 2.2a1.9 1.9 0 0 1 2.9 2.9l-.8.8-2.9-2.9z" />
            <path d="M10.2 6.5L4.6 12.1l-2.4.7.7-2.4 5.6-5.6" />
          </svg>
        </button>
        <button title="more" className="grid h-7 w-7 place-items-center text-dim
                                        transition-colors hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.4"
               strokeLinecap="round">
            <path d="M3 5h10M3 8h10M3 11h10" />
          </svg>
        </button>
        <button onClick={onClose} title="close"
                className="grid h-7 w-7 place-items-center text-dim transition-colors hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.4"
               strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex gap-3 p-3">
        {/* saturation / value field */}
        <div {...sv} ref={sv.ref}
             className="relative h-[210px] w-[232px] cursor-crosshair rounded-[3px]"
             style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}>
          <span className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2
                           -translate-y-1/2 rounded-full border-2 border-white
                           shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`,
                         background: cssRgb(rgb) }} />
        </div>

        {/* alpha, on the checkerboard */}
        <div {...opa} ref={opa.ref} className="relative h-[210px] w-[14px] cursor-pointer rounded-[3px]"
             style={{
               backgroundImage:
                 `linear-gradient(to bottom, ${cssRgb(rgb, 1)}, ${cssRgb(rgb, 0)}),
                  linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%),
                  linear-gradient(45deg, #ccc 25%, #fff 25%, #fff 75%, #ccc 75%)`,
               backgroundSize: '100% 100%, 8px 8px, 8px 8px',
               backgroundPosition: '0 0, 0 0, 4px 4px',
             }}>
          <span className="pointer-events-none absolute left-1/2 h-2.5 w-[18px] -translate-x-1/2
                           -translate-y-1/2 rounded-[3px] border border-black/25 bg-white"
                style={{ top: `${(1 - a) * 100}%` }} />
        </div>

        {/* hue */}
        <div {...hue} ref={hue.ref} className="relative h-[210px] w-[14px] cursor-pointer rounded-[3px]"
             style={{ background: 'linear-gradient(to top, #f00, #f0f, #00f, #0ff, #0f0, #ff0, #f00)' }}>
          <span className="pointer-events-none absolute left-1/2 h-2.5 w-[18px] -translate-x-1/2
                           -translate-y-1/2 rounded-[3px] border border-black/25 bg-white"
                style={{ top: `${(1 - hsv.h / 360) * 100}%` }} />
        </div>

        <div className="flex-1">
          <div className="flex h-[74px] overflow-hidden rounded-[5px] border border-black/10">
            <button
              onClick={() => {
                const p = hexToRgb(start.current.hex)
                if (p) setHsv(rgbToHsv(p))
                setA(start.current.alpha)
              }}
              className="flex-1"
              style={{ background: `#${start.current.hex}`, opacity: start.current.alpha }}
              title="restore previous"
            />
            <div className="flex-1" style={{ background: cssRgb(rgb), opacity: a }} />
          </div>
          <div className="mb-3 mt-1.5 flex text-[11px] text-dim">
            <span className="flex-1 text-center">Previous</span>
            <span className="flex-1 text-center">New</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <Row label={['L', 'C', 'H']} values={[L, C, H]} precision={[1, 3, 1]}
                 onEdit={(i, v) => {
                   const next: [number, number, number] = [L, C, H]
                   next[i] = v
                   setHsv(rgbToHsv(oklchToRgb(next)))
                 }}
                 onCopy={() => copy(`oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`)} />
            <Row label={['H', 'S', 'L']} values={[hh, ss, ll]} precision={[1, 1, 1]}
                 onEdit={(i, v) => {
                   const next: [number, number, number] = [hh, ss, ll]
                   next[i] = v
                   setHsv(rgbToHsv(hslToRgb(next)))
                 }}
                 onCopy={() => copy(`hsl(${hh.toFixed(1)} ${ss.toFixed(1)}% ${ll.toFixed(1)}%)`)} />
            <Row label={['R', 'G', 'B']} values={[rgb.r, rgb.g, rgb.b]} precision={[0, 0, 0]}
                 onEdit={(i, v) => {
                   const next = { ...rgb }
                   next[(['r', 'g', 'b'] as const)[i]] = Math.min(255, Math.max(0, v))
                   setHsv(rgbToHsv(next))
                 }}
                 onCopy={() => copy(`rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)})`)} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-3">
        <input
          value={draft ?? `${current} / ${Math.round(a * 100)}%`}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="inset-control h-[30px] flex-1 px-2 tabular-nums outline-none
                     focus:border-[#2d52f0] focus:ring-2 focus:ring-[#2d52f0]/25"
        />
        <div className="inset-control flex h-[30px] w-[26px] flex-col items-center justify-center
                        text-dim">
          <button onClick={() => setA(v => Math.min(1, v + 0.01))} className="leading-none hover:text-ink">
            <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4.5 5 1 9 4.5" /></svg>
          </button>
          <button onClick={() => setA(v => Math.max(0, v - 0.01))} className="mt-0.5 leading-none hover:text-ink">
            <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round"><polyline points="1 1.5 5 5 9 1.5" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
