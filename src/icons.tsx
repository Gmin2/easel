// nucleo ui set, inlined. the frame, rect and sidebar glyphs are not in the
// library so they are drawn here as plain geometry rather than pulled from
// some other pack.

type P = { size?: number; className?: string }

const S = (p: P, box: number, children: React.ReactNode) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox={`0 0 ${box} ${box}`}
       fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    {children}
  </svg>
)

export const Pointer = (p: P) => S(p, 12,
  <path d="m1.455.814l9.367,3.422c.447.163.434.801-.019.946l-4.258,1.363-1.363,4.258c-.145.454-.782.467-.946.019L.814,1.455c-.146-.399.242-.787.641-.641Z" />)

export const Hand = (p: P) => S(p, 18, <>
  <path d="M10.75,8.25V2.5c0-.69-.564-1.25-1.25-1.25s-1.25,.56-1.25,1.25v5.75" />
  <path d="M13.25,8.25V3.25c0-.69-.564-1.25-1.25-1.25s-1.25,.56-1.25,1.25v5" />
  <path d="M8.25,8.25V3.25c0-.69-.564-1.25-1.25-1.25s-1.25,.56-1.25,1.25V12.053" />
  <path d="M5.75,11.215l-1.768-2.252c-.426-.543-1.215-.635-1.755-.211s-.604,1.131-.211,1.755l2.551,3.924c.738,1.135,2,1.82,3.354,1.82h3.83c2.209,0,4-1.791,4-4V4c0-.69-.564-1.25-1.25-1.25s-1.25,.56-1.25,1.25v4.25" />
</>)

/** artboard: four corner brackets */
export const Frame = (p: P) => S(p, 12, <>
  <path d="M1 4V2.5A1.5 1.5 0 0 1 2.5 1H4" />
  <path d="M8 1h1.5A1.5 1.5 0 0 1 11 2.5V4" />
  <path d="M11 8v1.5a1.5 1.5 0 0 1-1.5 1.5H8" />
  <path d="M4 11H2.5A1.5 1.5 0 0 1 1 9.5V8" />
</>)

export const Rect = (p: P) => S(p, 12,
  <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="1.5" />)

export const SquarePlus = (p: P) => S(p, 12, <>
  <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="2" />
  <line x1="8.25" y1="6" x2="3.75" y2="6" />
  <line x1="6" y1="8.25" x2="6" y2="3.75" />
</>)

export const Image = (p: P) => S(p, 12, <>
  <path d="m2.32,10.516l4.723-4.723c.391-.391,1.024-.391,1.414,0l2.293,2.293" />
  <circle cx="4" cy="4" r="1" fill="currentColor" strokeWidth="0" />
  <rect x="1.25" y="1.25" width="9.5" height="9.5" rx="2" />
</>)

export const ChevronDown = (p: P) => S(p, 12,
  <polyline points="1.75 4.25 6 8.5 10.25 4.25" />)

export const ChevronRight = (p: P) => S(p, 12,
  <polyline points="4.25 10.25 8.5 6 4.25 1.75" />)

export const Plus = (p: P) => S(p, 12, <>
  <line x1="6" y1="1.75" x2="6" y2="10.25" />
  <line x1="1.75" y1="6" x2="10.25" y2="6" />
</>)

export const FileIcon = (p: P) => S(p, 12, <>
  <path d="M6.75 1.25H3.5a1.25 1.25 0 0 0-1.25 1.25v7a1.25 1.25 0 0 0 1.25 1.25h5A1.25 1.25 0 0 0 9.75 9.25V4.25Z" />
  <polyline points="6.5 1.4 6.5 4.25 9.6 4.25" />
</>)

/** panel toggle: a pane with its side rail filled */
export const PanelIcon = (p: P) => S(p, 16, <>
  <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
  <line x1="10" y1="2.5" x2="10" y2="13.5" />
  <rect x="10" y="2.5" width="4.5" height="11" rx="2" fill="currentColor"
        stroke="none" opacity=".85" />
</>)

/** type layer marker, drawn as a letterform rather than a glyph */
export const TypeMark = ({ className }: { className?: string }) => (
  <span className={`select-none font-medium leading-none ${className ?? ''}`}
        style={{ fontSize: 11 }}>Aa</span>
)

/** a button node: a pill with a label bar */
export const ButtonMark = (p: P) => S(p, 12, <>
  <rect x="1.25" y="3.25" width="9.5" height="5.5" rx="2.75" />
  <line x1="4" y1="6" x2="8" y2="6" />
</>)

export const LinkMark = (p: P) => S(p, 12, <>
  <path d="M5 7.5 7.5 5" />
  <path d="M4.2 4.2 3 5.4a1.9 1.9 0 0 0 2.7 2.7l.6-.6" />
  <path d="M8.3 8.3 9.5 7.1a1.9 1.9 0 0 0-2.7-2.7l-.6.6" />
</>)

/** the svg tool: a path with its anchor points showing */
export const Vector = (p: P) => S(p, 12, <>
  <path d="M2.5 9.5c0-4 3-7 7-7" />
  <rect x="1" y="8" width="3" height="3" rx=".5" fill="currentColor" strokeWidth="0" />
  <rect x="8" y="1" width="3" height="3" rx=".5" fill="currentColor" strokeWidth="0" />
</>)

/** the design tool: stacked sections, which is what it writes */
export const Sections = (p: P) => S(p, 12, <>
  <rect x="1.25" y="1.25" width="9.5" height="3" rx="1" />
  <rect x="1.25" y="6" width="5.5" height="4.75" rx="1" />
  <line x1="8.75" y1="6.25" x2="8.75" y2="10.5" />
</>)

export const Menu = (p: P) => S(p, 12, <>
  <line x1="1.75" y1="3.25" x2="10.25" y2="3.25" />
  <line x1="1.75" y1="6" x2="10.25" y2="6" />
  <line x1="1.75" y1="8.75" x2="10.25" y2="8.75" />
</>)

export const Sparkle = (p: P) => S(p, 12, <>
  <polygon points="6.5 1.75 7.845 5.154 11.25 6.5 7.845 7.846 6.5 11.25 5.154 7.846 1.75 6.5 5.154 5.154 6.5 1.75" />
  <path strokeWidth={0} fill="currentColor" d="m3.492,1.492l-.946-.315-.316-.947c-.102-.306-.609-.306-.711,0l-.316.947-.946.315c-.153.051-.257.194-.257.356s.104.305.257.356l.946.315.316.947c.051.153.194.256.355.256s.305-.104.355-.256l.316-.947.946-.315c.153-.051.257-.194.257-.356s-.104-.305-.257-.356h0Z" />
</>)
