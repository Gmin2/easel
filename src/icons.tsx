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

// the home page set, from nucleo ui

export const Magnifier = (p: P) => S(p, 12, <>
  <line x1="7.652" y1="7.652" x2="10.75" y2="10.75" />
  <circle cx="5" cy="5" r="3.75" />
</>)

export const Clock = (p: P) => S(p, 12, <>
  <circle cx="6" cy="6" r="4.75" />
  <polyline points="6 3.5 6 6 8 7.25" />
</>)

export const GraduationCap = (p: P) => S(p, 18, <>
  <path d="M9.458 2.361 15.79 5.621c.613.316.613 1.192 0 1.508l-6.332 3.26a1.01 1.01 0 0 1-.916 0L2.21 7.129c-.613-.316-.613-1.192 0-1.508l6.332-3.26a1.01 1.01 0 0 1 .916 0Z" />
  <path d="M16.25 6.375c-.171.74-.318 1.722-.281 2.875.027.834.144 1.562.281 2.156" />
  <path d="M4.25 11.554V14c0 1.104 2.127 2 4.75 2s4.75-.896 4.75-2v-2.446" />
</>)

export const Users = (p: P) => S(p, 18, <>
  <path d="M5.75 8.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  <path d="M9.609 15.123c.523-.175.83-.744.636-1.259-.685-1.818-2.436-3.112-4.494-3.112s-3.809 1.294-4.494 3.112c-.194.516.113 1.085.636 1.259.962.321 2.281.628 3.859.628s2.896-.307 3.857-.628Z" />
  <path d="M12 5.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  <path d="M13.154 13.187c1.068-.103 1.99-.326 2.704-.565.523-.175.83-.744.636-1.259-.685-1.818-2.436-3.112-4.494-3.112-.839 0-1.621.226-2.307.604" />
</>)

export const Grid = (p: P) => S(p, 12, <>
  <rect x="1.25" y="1.25" width="3.75" height="3.75" rx="1" />
  <rect x="7" y="1.25" width="3.75" height="3.75" rx="1" />
  <rect x="1.25" y="7" width="3.75" height="3.75" rx="1" />
  <rect x="7" y="7" width="3.75" height="3.75" rx="1" />
</>)

export const Archive = (p: P) => S(p, 12, <>
  <path d="m10.25,4.5v4.25c0,1.105-.895,2-2,2h-4.5c-1.105,0-2-.895-2-2v-4.25" />
  <rect x=".75" y="1.25" width="10.5" height="3" rx="1" ry="1" />
  <line x1="5" y1="6.75" x2="7" y2="6.75" />
</>)

export const Gear = (p: P) => S(p, 12, <>
  <circle cx="6" cy="6" r="1.75" />
  <path d="M6 .75v1.5M6 9.75v1.5M.75 6h1.5M9.75 6h1.5M2.29 2.29l1.06 1.06M8.65 8.65l1.06 1.06M2.29 9.71l1.06-1.06M8.65 3.35l1.06-1.06" />
</>)

export const ListIcon = (p: P) => S(p, 18, <>
  <circle cx="3.75" cy="5.25" r="1.5" />
  <circle cx="3.75" cy="12.75" r="1.5" />
  <line x1="8.75" y1="5.25" x2="16.25" y2="5.25" />
  <line x1="8.75" y1="12.75" x2="16.25" y2="12.75" />
</>)

export const Pen = (p: P) => S(p, 18, <>
  <path d="M12.047 4.932 14.763 6.982" />
  <path d="M6.533 15.25a.25.25 0 0 1-.25-.232c-.008-.109-.18-2.69 1.035-4.298l5.425-7.194a1.947 1.947 0 0 1 2.732-.383 1.947 1.947 0 0 1 .382 2.734l-5.425 7.195c-1.214 1.608-3.829 2.178-3.899 2.178Z" />
  <path d="M3.384 14.615c-1.229-1.039-1.561-1.958-1.623-2.635-.194-2.14 2.196-3.281 2.18-5.669-.01-1.532-1.006-2.77-1.817-3.561" />
</>)

export const User = (p: P) => S(p, 12, <>
  <circle cx="6" cy="3.5" r="2.25" />
  <path d="M1.75 10.75c.25-2.25 2-3.5 4.25-3.5s4 1.25 4.25 3.5" />
</>)
