import { useEditor } from '../doc/store'
import type { Camera } from '../doc/types'

/**
 * The agent's cursor, the way a collaborator's shows in a multiplayer tool.
 *
 * It springs to wherever the last node landed and idles with a pulse while
 * the model is still writing, so a generation reads as someone building on
 * the board rather than a spinner followed by a wall of nodes.
 */
export default function AgentCursor({ cam }: { cam: Camera }) {
  const c = useEditor(s => s.cursor)
  if (!c) return null
  const x = c.x * cam.zoom + cam.pan.x
  const y = c.y * cam.zoom + cam.pan.y
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-40"
      style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 420ms cubic-bezier(.2,.8,.2,1)' }}
    >
      <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        <path d="M2 1.5L2 16.2L5.9 12.6L8.4 18.4L11.2 17.2L8.8 11.6L14.2 11.4Z" fill="#2563eb" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <div className="ml-3.5 -mt-1 flex items-center gap-1.5 rounded-full bg-[#2563eb] py-0.5 pl-2 pr-2.5 text-[10px] font-medium text-white shadow">
        <span className={`size-1.5 rounded-full bg-white ${c.busy ? 'animate-pulse' : 'opacity-60'}`} />
        {c.label}
      </div>
    </div>
  )
}
