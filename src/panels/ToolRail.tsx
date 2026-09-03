import { ButtonMark, Comment, Frame, Hand, Image, Pointer, Rect, Sections, TypeMark, Vector } from '../icons'
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
  t: 'text', b: 'button', i: 'image', c: 'comment',
}

const GROUPS: { tool: Tool; icon: React.ReactNode; name: string; keys: string }[][] = [
  [
    { tool: 'select', icon: <Pointer size={14} />, name: 'Select', keys: 'V' },
    { tool: 'hand', icon: <Hand size={16} />, name: 'Pan', keys: 'H' },
  ],
  [
    { tool: 'artboard', icon: <Frame size={15} />, name: 'Artboard', keys: 'A' },
    { tool: 'frame', icon: <Rect size={15} />, name: 'Frame', keys: 'F' },
    { tool: 'text', icon: <TypeMark />, name: 'Text', keys: 'T' },
    { tool: 'button', icon: <ButtonMark size={15} />, name: 'Button', keys: 'B' },
  ],
  [
    { tool: 'comment', icon: <Comment size={15} />, name: 'Comment', keys: 'C' },
  ],
  [
    { tool: 'image', icon: <Image size={15} />, name: 'Create image', keys: '⌘⇧I' },
    { tool: 'svg', icon: <Vector size={15} />, name: 'Create svg', keys: '⌘⇧J' },
    { tool: 'design', icon: <Sections size={15} />, name: 'Create design', keys: '⌘⇧D' },
  ],
]

export default function ToolRail({ tool, onTool, floating }: Props) {
  return (
    <nav className={floating
      ? `absolute left-3 top-[58px] z-30 flex w-rail flex-col items-center overflow-visible rounded-[10px]
         border border-black/10 bg-panel py-1 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]`
      : 'flex h-full w-rail shrink-0 flex-col items-center overflow-visible border-r border-hair bg-panel pt-0.5'}>
      {GROUPS.map((group, gi) => (
        <div key={gi} className="contents">
          {gi > 0 && <span className="my-1.5 h-px w-5 bg-hair" />}
          {group.map(b => (
            <button
              key={b.tool}
              aria-label={`${b.name}  ${b.keys}`}
              onClick={() => onTool(b.tool)}
              className={`group relative grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors
                          ${tool === b.tool
                            ? 'inset-control text-ink'
                            : 'text-ink/70 hover:bg-black/[0.05] hover:text-ink'}`}
            >
              {b.icon}
              <span
                role="tooltip"
                aria-hidden="true"
                className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 -translate-y-1/2
                           flex items-center gap-2 whitespace-nowrap rounded-md border border-black/10
                           bg-panel px-2 py-1 text-ink opacity-0 shadow-[0_4px_14px_-8px_rgba(0,0,0,0.35)]
                           transition-opacity delay-0 duration-75
                           group-hover:opacity-100 group-hover:delay-200"
              >
                <span>{b.name}</span>
                <span className="font-mono text-[10px] text-faint">{b.keys}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
