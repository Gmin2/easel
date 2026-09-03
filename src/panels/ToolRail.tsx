import { ButtonMark, Frame, Hand, Image, Pointer, Rect, TypeMark } from '../icons'
import type { Tool } from '../doc/store'

interface Props {
  tool: Tool
  onTool(t: Tool): void
  /** with the panels hidden the rail detaches and floats over the canvas */
  floating?: boolean
}

/** the letter that picks each tool, shown in the tooltip so it gets learned */
export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', h: 'hand', a: 'artboard', f: 'frame',
  t: 'text', b: 'button', i: 'image',
}

const GROUPS: { tool: Tool; icon: React.ReactNode; title: string }[][] = [
  [
    { tool: 'select', icon: <Pointer size={14} />, title: 'select  V' },
    { tool: 'hand', icon: <Hand size={16} />, title: 'pan  H' },
  ],
  [
    { tool: 'artboard', icon: <Frame size={15} />, title: 'artboard  A' },
    { tool: 'frame', icon: <Rect size={15} />, title: 'frame  F' },
    { tool: 'text', icon: <TypeMark />, title: 'text  T' },
    { tool: 'button', icon: <ButtonMark size={15} />, title: 'button  B' },
    { tool: 'image', icon: <Image size={15} />, title: 'image  I' },
  ],
]

export default function ToolRail({ tool, onTool, floating }: Props) {
  return (
    <nav className={floating
      ? `absolute left-3 top-[58px] z-30 flex w-rail flex-col items-center rounded-[10px]
         border border-black/10 bg-panel py-1 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]`
      : 'flex h-full w-rail shrink-0 flex-col items-center border-r border-hair bg-panel pt-0.5'}>
      {GROUPS.map((group, gi) => (
        <div key={gi} className="contents">
          {gi > 0 && <span className="my-2 h-px w-5 bg-hair" />}
          {group.map(b => (
            <button
              key={b.tool}
              title={b.title}
              onClick={() => onTool(b.tool)}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors
                          ${tool === b.tool
                            ? 'inset-control text-ink'
                            : 'text-ink/70 hover:bg-black/[0.05] hover:text-ink'}`}
            >
              {b.icon}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
