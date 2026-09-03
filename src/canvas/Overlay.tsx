import { handlePoints } from './handles'
import type { Guide } from './snap'
import type { Board } from './wall'
import { HEADER } from './wall'
import type { Box, Camera, NodeBox } from '../doc/types'

const ACCENT = '#5e92f4'
const GUIDE = '#dc4f70'
const HANDLE = 8.5

interface Props {
  cam: Camera
  boards: Board[]
  /** the primary selection, the only one that gets handles */
  primary: NodeBox | null
  primaryName: string
  /** everything else picked: outlined, not handled */
  others: NodeBox[]
  hover: NodeBox | null
  /** the container you have stepped inside */
  inside: Box | null
  guides: Guide[]
  /** marquee, already in screen pixels */
  band: { x: number; y: number; w: number; h: number } | null
  activeBoard: string | null
  onPickBoard(id: string): void
}

/**
 * Selection chrome. An SVG sheet over the nodes rather than anything painted
 * into them, so a handle is never a real element an agent could stumble into
 * and the design underneath stays untouched html.
 */
export default function Overlay({
  cam, boards, primary, primaryName, others, hover, inside, guides, band,
  activeBoard, onPickBoard,
}: Props) {
  const { pan, zoom } = cam
  const sx = (x: number) => x * zoom + pan.x
  const sy = (y: number) => y * zoom + pan.y
  const rectOf = (b: Box) => ({
    x: sx(b.x), y: sy(b.y), width: Math.max(1, b.w * zoom), height: Math.max(1, b.h * zoom),
  })

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {boards.map(b => (
        <g key={b.id}>
          <rect {...rectOf(b)} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
          <text
            className="pointer-events-auto cursor-pointer"
            x={sx(b.x)} y={sy(b.y) - HEADER * 0.38}
            fontSize={12} fontWeight={activeBoard === b.id ? 600 : 400}
            fill={activeBoard === b.id ? ACCENT : 'rgba(0,0,0,0.45)'}
            onPointerDown={e => { e.stopPropagation(); onPickBoard(b.id) }}
          >
            {b.name}
            <tspan fill="rgba(0,0,0,0.28)" dx={8}>
              {Math.round(b.w)} × {Math.round(b.h)}
            </tspan>
          </text>
        </g>
      ))}

      {inside && (
        <rect {...rectOf(inside)} fill="none" stroke={ACCENT} strokeWidth={1}
              strokeDasharray="4 3" opacity={0.7} />
      )}

      {hover && (!primary || hover.id !== primary.id) && (
        <rect {...rectOf(hover)} fill="none" stroke={ACCENT} strokeWidth={1} />
      )}

      {others.map(o => (
        <rect key={o.id} {...rectOf(o)} fill="none" stroke={ACCENT}
              strokeWidth={1} opacity={0.7} />
      ))}

      {primary && (() => {
        const r = { x: sx(primary.x), y: sy(primary.y), w: primary.w * zoom, h: primary.h * zoom }
        const many = others.length > 0
        return (
          <g>
            <rect x={r.x} y={r.y} width={Math.max(1, r.w)} height={Math.max(1, r.h)}
                  fill="none" stroke={ACCENT} strokeWidth={1.5} />
            {/* an artboard already has its name in the wall header, in accent */}
            {!boards.some(b => b.id === primary.id) && (
              <text x={r.x} y={r.y - 6} fontSize={10} fill={ACCENT}>{primaryName}</text>
            )}
            <g>
              <rect x={r.x + r.w / 2 - 34} y={r.y + r.h + 6} width={68} height={17}
                    rx={4} fill={ACCENT} />
              <text x={r.x + r.w / 2} y={r.y + r.h + 18} fontSize={10} fill="#fff"
                    textAnchor="middle" fontFamily="var(--font-mono)">
                {many
                  ? `${others.length + 1} picked`
                  : `${Math.round(primary.w)} × ${Math.round(primary.h)}`}
              </text>
            </g>
            {!many && handlePoints(r).map(([hx, hy], i) => (
              <rect key={i} x={hx - HANDLE / 2} y={hy - HANDLE / 2}
                    width={HANDLE} height={HANDLE} rx={1.5}
                    fill="#fff" stroke={ACCENT} strokeWidth={1.5} />
            ))}
          </g>
        )
      })()}

      {guides.map((g, i) => (
        <line key={i} stroke={GUIDE} strokeWidth={1}
              x1={g.axis === 'x' ? sx(g.at) : sx(g.from)}
              x2={g.axis === 'x' ? sx(g.at) : sx(g.to)}
              y1={g.axis === 'x' ? sy(g.from) : sy(g.at)}
              y2={g.axis === 'x' ? sy(g.to) : sy(g.at)} />
      ))}

      {band && (
        <rect x={band.x} y={band.y} width={band.w} height={band.h}
              fill={`${ACCENT}22`} stroke={ACCENT} strokeWidth={1} />
      )}
    </svg>
  )
}
