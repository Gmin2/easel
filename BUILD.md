# Build plan

How PLAN.md gets built, in order. Ship each step working before starting the
next one.

## what we are porting, and what we are not

The editor UI comes from `whippan/apps/boards`. That app is a **motion film
editor whose pixels are painted by a Rust/WASM Skia engine**: `render(stage,
anim, t)` emits paint commands, CanvasKit draws them into one `<canvas>`, and
hit testing parses those same commands back into boxes.

Easel needs the opposite: **nodes that are real DOM elements**, because the
whole WebMCP pitch is that an agent writes real HTML and CSS into real nodes
and `get_html` hands back exactly what is on screen. So the port is:

| from boards | into easel |
| --- | --- |
| `index.css` theme, tokens, `inset-control` | verbatim |
| `color.ts`, `icons.tsx` | verbatim |
| `NumField`, `ColorRow`, `ColorPicker`, `ContextMenu` | verbatim |
| `Overlay.tsx` (already SVG over the canvas) | keep the vocabulary, drop seams |
| `handles.ts`, `snap.ts` | keep the math, retarget to top-left boxes |
| `TextEditor.tsx` | keep the pattern, edit the DOM node in place |
| `Canvas.tsx` camera + gesture state machine (~75% of it) | keep |
| `Canvas.tsx` Skia surface, `paintFrame`, `withGround` | **replaced** by DOM |
| `measure.ts` (`measure`, `cmdBounds`, `pathBounds`) | **replaced** by `getBoundingClientRect` |
| `LeftPanel` tree rows, drag-reorder, inline rename | keep, retarget to our tree |
| `Inspector` section and field layout | keep the layout, new fields (CSS) |
| `ToolRail` | keep, new tool set |
| motion: `Timeline`, `MotionInspector`, `StaggerStrip`, `SeamInspector`, `motion/`, `motion.ts`, `tracks.ts`, `transitions.ts`, `taste.ts`, `devices.ts`, `grammar.ts` | **not ported** |
| film/server: `SignIn`, `FilmMenu`, `api.ts`, `ai.ts`, `engine/`, `ExportDialog` | **not ported** |
| `blocks.ts` (motion-film prefabs: pill, lit-subject, glass panel) | **rewritten** as web sections |

Motion is removed by never porting it, which is cleaner than deleting it after
the fact. No `mode`, no `playhead`, no `anim`, no `dur`, no `fps`, no scene
transitions, and one frame per artboard instead of boards' 2–5 time samples.

## the one deviation from PLAN.md

PLAN.md put freeform absolute positioning out of scope and said artboards use
flow layout with flex and grid. **We are starting absolute.** Reasons:

- it is what makes the ported drag, resize, snap and handle code work at all,
  and that interaction quality is the demo
- `style` is still a plain CSS object, so nothing is painted into a corner:
  a flow container is just a node whose style says `display: flex` and whose
  children have no `left`/`top`
- `write_html` in phase 2 lands agent HTML as flow children inside a frame, so
  the agent gets real layout and the human gets direct manipulation

If this is wrong, say so before phase 2 — it is cheap to change now.

## document model

One flat map, ids as the only reference. Agents hold ids, lookups are O(1),
reparenting is a pointer change, and `get_node` can return children ids
directly.

```ts
interface Node {
  id: string
  type: 'artboard' | 'frame' | 'text' | 'image' | 'button' | 'link'
  name: string                      // what the layers panel shows
  tag: string                       // div, h1, p, button, a, img
  props: Record<string, string>     // href, src, alt, placeholder
  style: Record<string, string>     // plain css, applied inline
  text?: string                     // leaf text content
  children: string[]
  parent: string | null
}

interface Doc {
  nodes: Record<string, Node>
  artboards: string[]               // ordered
}
```

Geometry is not a separate field. `x/y/w/h` live in `style.left/top/width/
height` and the editor reads and writes them through `geoOf` / `setGeo`
helpers, so the CSS is the single source of truth and `get_html` is always
exactly what is on screen. Boxes are **top-left** based, not boards' centre
based — that is what CSS wants.

Every mutation goes through a store action. The UI calls them and, in phase 2,
so does every WebMCP tool. One code path for human and agent.

## phase 1 — the editor shell

No backend, no agent, no network. A design tool that stands on its own.

1. **deps and theme** — zustand, fonts, `index.css` ported verbatim
2. **doc** — `types.ts`, `ids.ts`, `ops.ts` (add, delete, duplicate, reorder,
   group, reparent), `geo.ts`, `html.ts` (node tree to html and css)
3. **store** — zustand store, snapshot undo and redo, all actions
4. **canvas** — camera, DOM render of the node tree, gesture state machine,
   DOM hit testing, box measurement, snapping, handles, overlay, inline text
5. **panels** — ToolRail, LeftPanel layers, RightPanel and Inspector,
   ContextMenu, and the ported primitives
6. **shortcuts** — the boards keyboard map minus motion

Done when: draw artboards and nodes by hand, select, drag, resize, snap, edit
text inline, restyle from the inspector, reorder and group in the layers
panel, undo everything, pan and zoom.

## phase 2 — WebMCP

7. `document.modelContext` registration, one AbortController, idempotent
8. the read tools, then the write tools, each calling store actions
9. activity log panel, agent-edited nodes highlight
10. `request_pointer` and `propose`
11. publish to a Cloudflare Worker with KV
12. `easel-bridge` stdio MCP server plus local websocket

## phase 3 — submission

13. web section blocks, export dialog for HTML and JSX
14. deploy, test in ChatGPT desktop and Chrome 149+
15. video, README, LICENSE, devpost text
