# Easel

A design canvas in the browser where a person and an agent edit the same page.
Entry for The WebMCP Challenge.

**[easel-flax.vercel.app](https://easel-flax.vercel.app)**

Every node on the canvas is a real HTML element with a real CSS object. You
draw and restyle by hand; an agent reads and writes those same nodes through 22
tools on `document.modelContext`. No desktop app, no local MCP server, no
screenshot in the middle.

That last part is the whole idea. The nearest thing to Easel is
[Paper](https://paper.design), which is excellent and also exposes its file
over MCP — but it needs a native app installed to broker the connection. Easel
*is* the page, so the agent talks to it in place.

## why the document is HTML

Because it removes the translation layer that every other design tool has to
maintain.

An agent does not learn a node format: it calls `write_html` with a fragment
and gets back the ids and the boxes. It does not ask what a style means: the
style *is* CSS. And "export to code" is not a feature to build, because the
canvas was already the thing being exported — `Copy as React` hands over what
is on screen, character for character.

It also means reads are honest. Every tool returns the browser's **measured**
layout, not the CSS it was handed. An agent that writes `display: flex` reads
back three boxes at real coordinates and can see what it did. A tool painting
into a canvas cannot offer that.

We checked this against Paper by reading its live DOM, and it turns out to work
the same way underneath: 257 of its 277 nodes are `position: absolute` with
explicit sizes, and flex is used inside frames. Notes in
[PAPER.md](./PAPER.md).

## running it

```
pnpm install
pnpm dev
```

WebMCP ships in ChatGPT's browser, and in Chrome behind
`chrome://flags/#enable-webmcp-testing`. Anywhere else the page installs the
spec polyfill so the tools still register and can be driven from the console —
there is just no agent attached.

```js
// works in any browser, with or without WebMCP
await easelCall('write_html', { parentId: 'board1', html: '<h1>Hello</h1>' })
easelTools            // the manifest
easel.getState().doc  // the live document
```

One quirk if you drive the real API by hand: `executeTool` wants a JSON
**string**, not an object. Passing an object throws `Failed to parse input
arguments`.

```js
const tools = await document.modelContext.getTools()
const t = tools.find(x => x.name === 'get_document')
JSON.parse(await document.modelContext.executeTool(t, '{}'))
```

## the tools

Reading is free; the rest goes on the same undo stack your `⌘Z` uses.

| | |
| --- | --- |
| `get_document` | the design as HTML, every element carrying its id |
| `get_node` | one node, plus the box the browser laid it out at |
| `get_selection` | **what the person has selected** — how the agent learns what "this" means |
| `find_nodes` | search by layer name, text or tag |
| `write_html` | the main way to build; flow layout works, semantic tags are kept |
| `set_style` | patch CSS; an empty value hands a property back to the browser |
| `set_text`, `set_attributes` | content, tag, layer name, attributes |
| `set_image` | point an image at a URL or a `data:` URI |
| `generate_image` | make one from a prompt, at the node's size |
| `set_tokens` | CSS custom properties on an artboard |
| `apply_effect` | ten named effects, all of them plain CSS |
| `create_artboard`, `manage_pages` | screens, and named walls of them |
| `delete_nodes`, `duplicate_nodes`, `move_node`, `group_nodes` | structure |
| `select_nodes` | point at something instead of describing where it is |
| `export_code` | html, a standalone page, React, or React with Tailwind |
| `extract_colours` | the palette the CSS actually uses |
| `undo` | the shared stack, so it undoes whoever went last |

Every tool calls the same store action the buttons call. There is no second
code path to drift, which is why an agent's write is undoable and why the
activity feed can attribute both of you.

## effects export

Ten of them — mesh gradient, aurora, liquid metal, heatmap, film grain, paper
texture, halftone, dither, fluted and frosted glass — built from layered
gradients, inline SVG turbulence and backdrop filters.

Paper renders its shaders into WebGL canvases, which look lovely and cannot be
handed to anyone: a canvas is pixels, so "copy as React" can only give you back
a canvas plus a shader to host. These are CSS, so they copy out with the design
and render anywhere. The page export carries their keyframes too, because an
animated design whose animation stayed behind in our stylesheet was not really
exported.

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
corner zooms to fit. Selection has eight handles: corners are drawn, edges are
grabbable anywhere along their length, and a handle writes only the axes it
moves — so dragging the side of a paragraph rewraps it while dragging its
bottom pins the height.

A selection rides in the URL, so an agent that called `select_nodes` has also
written you a link.

## layout

```
src/doc/      the document: types, ids, css geometry, operations, html, store
src/canvas/   the wall: camera, dom rendering, gestures, handles, snapping
src/panels/   the chrome: tool rail, layers, inspector, activity, tokens
src/mcp/      the agent's half: 22 tools on document.modelContext
src/lib/      colour, css, effects, palette, png, image generation
```

The editor chrome, the colour picker, the value fields, the snapping and the
resize maths are ported from the `boards` editor in whippan, a Skia canvas
motion tool. Its render path did not survive the port — Easel's nodes have to
be DOM for any of the above to be true — but its interaction model did.

See [PLAN.md](./PLAN.md) for the product, [BUILD.md](./BUILD.md) for how it was
built, and [PAPER.md](./PAPER.md) for what we measured of the state of the art.
