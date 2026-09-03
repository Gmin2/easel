# Easel

A design canvas in the browser where a person and an agent edit the same page.
Entry for The WebMCP Challenge.

**[easel-flax.vercel.app](https://easel-flax.vercel.app)**

Every node on the canvas is a real HTML element with a real CSS object. You
draw and restyle by hand; an agent reads and writes those same nodes through 25
tools on `document.modelContext`. No desktop app, no local MCP server, no
screenshot in the middle.

That last part is the whole idea. The nearest thing to Easel is
[Paper](https://paper.design), which is excellent, is also built on real
HTML and CSS, and also exposes its document over MCP. Its server is a loopback
endpoint on `127.0.0.1` served by the running desktop app — the docs are
explicit that the app is required, and they are right to be, because the tools
enumerate the machine's fonts, read local files and render through the live
canvas. It has a WebMCP path too, in the browser, and that is the interesting
part: it exists, and it is gated behind Chrome's origin trial plus a per-origin
partner allowlist. Using it needs Paper's permission for your origin.

Easel needs a tab. Nobody's permission, nothing installed, and nothing metering
the calls — Paper's free tier allows a hundred MCP tool calls a week, and we
have no server that could count. Notes on the rest of what we found in
[PAPER.md](./PAPER.md).

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
explicit sizes, and flex is used inside frames. Its documented layout rules for
agents say the same thing, so this is the shape of the problem rather than a
choice either of us made.

There is a quieter version of the same point. A tool that models a subset of
CSS has to decide what to do with the rest of it, and Paper handles that
honestly in two places: `update_styles` returns the declarations it dropped
under `ignoredStyles`, and the app has an "Other styles" panel for
"agent-added styles that aren't editable properties yet". Both are good
answers. We don't have the question — a declaration written here is applied
as written, and what it did to the layout comes back in the next read as
numbers.

## running it

```
pnpm install
cp .env.example .env   # fill whichever keys you have; restart after editing
pnpm dev
```

The editor and the generation routes share one dev server. Keys are read only
inside `api/` — on Vercel as project environment variables, locally by the
Vite middleware in `vite.config.ts`. They never reach the browser bundle.

| variable | backs |
| --- | --- |
| `OPENAI_API_KEY` | text-to-design (default model `gpt-5.1`) |
| `KIMI_API_KEY` | text-to-design (`kimi-k2.6`) |
| `GEMINI_API_KEY` | text-to-design and images (`gemini-flash-latest`, `gemini-3.1-flash-image`) |
| `QUIVER_API_KEY` or `QUIVERAI_API_KEY` | SVG via Quiver Arrow (`arrow-1`) |

Without keys the image path still works through a keyless Pollinations fallback;
design and SVG need at least one provider configured.

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

Any agent that can see the page can use them: ChatGPT's desktop browser
natively, Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. A terminal
agent gets the same tools through Chrome's DevTools protocol, which has a
WebMCP domain that `chrome-devtools-mcp` already wraps:

```
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest --autoConnect --categoryExperimentalWebmcp=true
```

Turn on remote debugging at `chrome://inspect/#remote-debugging`, open Easel in
a tab, and Claude Code can list and call every tool on this page.

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
| `generate_design` | ask a model for an HTML/CSS section and insert it as nodes |
| `generate_svg` | ask Quiver Arrow for inline SVG paths |
| `get_guide` | layout rules, design taste, and how to share the document |
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

The tools ship with instructions, which is the one thing we copied wholesale
from Paper's design rather than from its feature list: `src/mcp/guide.ts`
carries the layout rules, the unit conventions, the taste rules and the
etiquette of sharing a document, because a schema can say what an argument
means and only a guide can say that a repeated row needs fixed-width lanes.

## generation

You can also ask for something without an agent attached. There are three
kinds, and they run through serverless routes in `api/` so the keys never
reach the browser.

A **design** is the interesting one. The model writes an HTML fragment with
inline CSS — the document's own material — so what comes back is not an
import, a layer or a picture. It lands as nodes you can select, drag and
restyle immediately, an agent can read back through `get_node`, and
`Copy as React` hands it over unchanged. An **image** comes back as bytes we
hold rather than a URL we point at, which is what lets a generated image
become a `data:` URI and the document stay self-contained. An **SVG** comes
back as paths, so it recolours from its wrapper's `color` like anything else.

Paper does not have this, and it is a deliberate choice rather than a gap:
prompt-to-layout there happens through an external agent over MCP, on the bet
that your agent already lives in your editor. A canvas-aware assistant is on
their roadmap. Ours is in the page for the same reason the tools are.

**Landing** — a prompt on first load, starter cards, and one click into the
editor with a fresh artboard. **Canvas** — `⌘⇧I` opens the image prompt bar,
`⌘⇧J` the SVG bar; both sit on the bottom of the canvas like Paper's. Agent
tools: `generate_design`, `generate_image`, `generate_svg`. Routes:
`/api/design`, `/api/image`, `/api/svg`. The model chip offers each provider
whose key is present, plus a variety pack that fires them concurrently.
Generated images embed as `data:` URIs so exports stay self-contained.

### templates: real sites as starting points

Twenty four pages from published websites, flattened to the same inline-styled
HTML this document is made of, live in `public/templates/`, one folder each
with the html, the typefaces it uses as `@font-face` rules, and any large
images as files. They are keyed by what the page does, not whose it is: docs
reference, docs landing, dev tool, design tool, corporate cards, DeFi protocol,
wallet, collaboration tool, studio home, about, pricing and projects, personal
portfolio, SaaS landings. Each was rendered in headless Chromium and walked
element by element with computed styles inlined, so it lands through the
ordinary `write_html` path as a few hundred editable nodes in under 100ms, in
its own fonts. The manifest carries a fidelity review score per page.

They do two jobs. `use_template` lands one whole, with no model in the loop,
and the person or agent then changes copy, colours and structure with the
tools they already have. And `generate_design` matches the request against
them by keyword, and when one fits, sends an excerpt as the reference for
structure, spacing and type scale, with the instruction to keep the quality
and replace every word and colour. A request for a docs site stops coming
back as the same three cards every model reaches for.

The flattener and its comparison screenshots are in `../ref-website/`.

## effects export

Ten of them — mesh gradient, aurora, liquid metal, heatmap, film grain, paper
texture, halftone, dither, fluted and frosted glass — built from layered
gradients, inline SVG turbulence and backdrop filters.

Paper has thirty of these and they look far better than ours. They are WebGL,
open source, and its Copy as React hands over a real component with the props
you were looking at — so the fair comparison is narrower than "ours export and
theirs don't". The difference is what the code renders into. A canvas is
pixels, so a shader is not restylable node by node, not inspectable as CSS,
and out of reach of the colour picker and the design tokens that dress the
rest of the file. Ours are gradients, filters and inline SVG turbulence, so
they stay part of the document: the person can tune any property, an agent can
read them back, and they copy out with the design and render anywhere. The page
export carries their keyframes too, because an animated design whose animation
stayed behind in our stylesheet was not really exported.

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
src/mcp/      the agent's half: the tools, and the guide that ships with them
src/lib/      colour, css, effects, palette, png, generation
api/          serverless routes for the generation providers
```

The editor chrome, the colour picker, the value fields, the snapping and the
resize maths are ported from the `boards` editor in whippan, a Skia canvas
motion tool. Its render path did not survive the port — Easel's nodes have to
be DOM for any of the above to be true — but its interaction model did.

See [PLAN.md](./PLAN.md) for the product, [BUILD.md](./BUILD.md) for how it was
built, and [PAPER.md](./PAPER.md) for what we measured of the state of the art.
