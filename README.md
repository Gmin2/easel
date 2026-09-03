# Easel

A browser design canvas where people and agents build websites together.
Entry for The WebMCP Challenge.

Every node on the canvas is a real HTML element with a real CSS object. You
draw and restyle by hand; an agent reads and writes the same nodes through
WebMCP tools registered on `document.modelContext`. No install, no local
server, no screenshot in the middle.

See [PLAN.md](./PLAN.md) for the product and [BUILD.md](./BUILD.md) for how it
is being built.

## running it

```
pnpm install
pnpm dev
```

## the editor

| | |
| --- | --- |
| `V` | select |
| `H` | pan, or hold space |
| `A` | artboard |
| `F` | frame |
| `T` | text |
| `B` | button |
| `I` | image |
| double click | edit text, or step into a frame |
| `⌘G` / `⇧⌘G` | group, ungroup |
| `⌘]` / `⌘[` | forward, backward (`⇧` for front and back) |
| `⌘\` | hide the panels |

Wheel pans, `⌘`-wheel zooms at the pointer, and the percentage in the bottom
corner zooms to fit.

## layout

```
src/doc/      the document: types, ids, css geometry, operations, html, store
src/canvas/   the wall: camera, dom rendering, gestures, handles, snapping
src/panels/   the chrome: tool rail, layers, inspector, colour, menus
```

The editor chrome, the colour picker, the value fields, the snapping and the
resize maths are ported from the `boards` editor in
[whippan](https://github.com/) — a Skia canvas motion tool. Its render path
does not survive the port, because Easel's nodes have to be DOM for the agent
story to be true, but its interaction model does.
