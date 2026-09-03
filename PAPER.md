# Paper, audited

Paper (paper.design) is the closest thing that exists to Easel: a design tool
whose canvas is real HTML and CSS, with an MCP server that lets an agent read
and write the document. It is a genuinely excellent product, built by a funded
team — Accel and ICONIQ, a $34M Series A, around twelve people, shipping since
September 2025 — and most of what follows is us taking notes on work that is
ahead of ours.

This file exists because a claim about a competitor is only worth making if you
can say where it came from. Everything below is labelled by source:

- **measured** — we read it out of the live page's DOM
- **documented** — first-party docs on paper.design
- **captured** — a live `tools/list` response from a running Paper MCP server
- **quoted** — a founder demo transcript, or verbatim docs copy
- **roadmap** — Paper's own build log and roadmap, so intent rather than
  shipped behaviour

Where a fact only exists in one of the softer categories, it says so. The
property panel still does not render for us in view-only mode, so the exact
control inventory per section remains the one thing we know only from
screenshots Paper published itself.

## The MCP surface

**Captured.** The server is a streamable HTTP endpoint at
`http://127.0.0.1:29979/mcp`, with a stdio transport alongside it via a local
binary at `~/.paper/bin/paper mcp` — the binary is what Paper's official
Cursor, Claude and Codex plugins configure, so most users are on stdio without
knowing the loopback port exists.

**The desktop app is required**, and this is the load-bearing fact of the whole
audit. Documented, verbatim: *"To get started with the Paper MCP server, you
need to have the Paper Desktop app installed."* The server is not a service
that happens to run locally; it is the running editor process, and it operates
on the document currently open in memory rather than on a stored file. The
dependency is real rather than incidental, because three things Paper's tools
do can only be done by a process with a machine and a renderer underneath it:

- it enumerates the operating system's fonts — `get_font_family_info`
  *"looks up fonts on the user's machine and Google Fonts"*
- it reads local files — `write_html` accepts image URLs of the form
  `paper-asset:///absolute/path`
- it renders through the live canvas, which is what makes `get_screenshot`,
  `export` and `export_combined_pdf` possible at all

So Paper's agent access is as portable as the machine it is installed on. That
is not a flaw in Paper's design; it is the consequence of the tools being that
capable. It is also exactly the constraint WebMCP was written to remove.

### Twenty documented tools, thirty-four live

**Captured against documented.** Paper's public docs describe 20 tools. A live
`tools/list` returns 34. The ones we can name that are absent from the docs
cover file and page navigation (`open_file`, `list_files`, `create_file`,
`create_page`), search (`find_nodes`), comment threads
(`list_comment_threads`, `get_comment_thread`, `list_comment_thread_authors`,
`set_comment_thread_status`), design tokens (`get_tokens`, `create_tokens`,
`set_tokens`) and `export_combined_pdf`. That accounts for thirteen of the
fourteen; we could not attribute the last one, so treat "roughly a third of the
surface is undocumented" as the claim rather than an exact tally.

The full captured list, grouped:

- navigate — `open_file`, `list_files`, `create_file`, `create_page`
- read — `get_basic_info`, `get_selection`, `get_node_info`, `get_children`,
  `get_tree_summary`, `get_computed_styles`, `get_jsx`, `get_screenshot`,
  `get_fill_image`, `find_nodes`
- comments — `list_comment_threads`, `get_comment_thread`,
  `list_comment_thread_authors`, `set_comment_thread_status`
- environment — `get_font_family_info`, `get_guide`
- out — `export`, `export_combined_pdf`
- write — `write_html`, `create_artboard`, `delete_nodes`, `set_text_content`,
  `rename_nodes`, `update_styles`, `duplicate_nodes`, `move_nodes`,
  `finish_working_on_nodes`
- tokens — `get_tokens`, `create_tokens`, `set_tokens`

Thirty-three of the thirty-four accept an optional `fileId`, described as being
for when *"several are open at once (e.g. multiple agents from the same session
working in parallel)"*. Paired with desktop tabs, that is Paper's whole
multi-agent concurrency story: parallelism is spatial, one agent per open file,
rather than several agents contending for one document.

### How nodes are addressed

**Captured.** Nodes are opaque short string ids — `A-01`, `XX-0`. There are no
selectors, no XPath and no paths anywhere in the 34 schemas, which means an
agent cannot express "the second button inside the header" as a query; it has
to walk there and hold the id. `find_nodes` is the selector substitute,
querying by computed style and/or text content.

Three details worth stealing. `duplicate_nodes` returns a `descendantIdMap`
mapping every original descendant id to its clone, which is the thing that
makes a copy immediately editable instead of a black box you have to re-read.
Nodes report both `worldX`/`worldY` and parent-relative `x`/`y`, so an agent
never has to do the frame arithmetic itself. And agents are instructed never to
show raw ids to the user, which is a small thing that separates an agent that
sounds like a person from one that sounds like a database.

**Documented.** Rate limits: the free tier allows 100 MCP tool calls per week.
Pro, at $20 per editor per month, allows a million.

## Paper's WebMCP path, and why it is gated

This is the detail that matters most for us, so it is worth stating precisely
rather than triumphantly.

Paper does have a browser integration. [`paper-design/webmcp-agent-example`](https://github.com/paper-design/webmcp-agent-example)
embeds `https://app.paper.design` in an iframe with `allow="tools; ..."` and
calls `document.modelContext.getTools({ fromOrigins: ["https://app.paper.design"] })`
— the same API Easel registers on. So the capability is not hypothetical, and
Paper is clearly paying attention to the spec.

But its own README lists three gates: Chrome 150 or newer, registration for the
WebMCP origin trial, and — decisively — *"Paper must allow your origin to use
our WebMCP tools"*, with the whole example marked *"Available for Paper
partners."*

The honest framing is not that Paper cannot do WebMCP. It is that Paper's
browser path is a partner programme: it requires their permission, per origin,
plus an origin trial registration. Easel is WebMCP-native and open to anyone
who loads the page. That is the difference, and it is a difference about
distribution rather than about capability.

## The document and layout model

**Quoted.** The canvas is real DOM and CSS, and the founder is unambiguous
about why: *"we use HTML and CSS as the actual rendering engine... There's no
translation there. The agent writes HTML, paper can render HTML."* Paper's own
Figma comparison page puts it as "Real HTML/CSS — web-native, no translation
step" against Figma's "Proprietary model (WebGL-based canvas)".

**Measured**, from reading `app.paper.design`. Design nodes are ordinary DOM
elements carrying a `data-node-id` attribute and an inline `style`, which is
the same shape as Easel's `data-easel` plus inline style. Of 277 nodes on the
page we read:

| what | count |
| --- | --- |
| `position: absolute` | 257 |
| explicit `left` / `top` | 251 |
| explicit `width` / `height` | 265 / 268 |
| `display: flex` | 50 |
| static (in flow) | 18 |

A representative frame, verbatim:

```
height: 68px; width: 398px; border-radius: 18px; top: 572.617px;
left: 213.742px; display: flex; flex-direction: row;
justify-content: center; align-items: center; padding-inline: 4px;
position: absolute; box-shadow: ...; background-color: rgb(250, 250, 250);
```

So Paper is **absolute placement with flex inside**, and the documented rules
now corroborate what we had only measured. **Documented:** flex is the primary
layout mode, and agents are explicitly forbidden from emitting CSS Grid,
`margin`, `display: inline` or HTML tables — padding and gap only, `border-box`
everywhere. Absolute positioning is fully supported and is the recommended tool
for decorative elements. Grid is **roadmap**, not shipped.

This settles the question `BUILD.md` left open. The hybrid Easel already ships
— absolute roots, flow layout inside them — is what the tool we are being
measured against actually does, so the deviation from `PLAN.md` is not a
shortcut. It is the shape of the problem.

Other model details, all documented:

- An artboard defaults to `display: flex; flex-direction: column`. Device
  presets are Desktop 1440×900, Tablet 768×1024, Mobile 390×844. New artboards
  auto-place into the best empty spot on the wall, 80px apart.
- Sizing is the usual three-way model wearing CSS names: fixed pixels,
  `fit-content` (hug), and fill. The *intent* is stored rather than only the
  computed result, which is why `move_nodes` can promise to preserve
  *"width/height intents like filling available space"* when it reparents.
- Two custom HTML extensions. A `layer-name` attribute names a layer, and
  `<x-paper-clone node-id="A-01" style="..." />` slots an existing node into
  new HTML so the agent does not have to re-emit it — a token optimisation, and
  a neat one.
- `update_styles` drops declarations that are inert in a node's context and
  returns their keys under `ignoredStyles`. That is an honesty affordance we
  should copy in spirit: telling an agent what you ignored is worth more than
  silently accepting it.
- There is an **"Other styles"** panel, described as *"a panel to view all
  agent-added styles that aren't editable properties yet"*.

Those last two are the same admission from two directions. Because the agent
writes arbitrary CSS but the editor models a subset of it, Paper needs a
channel for the CSS it accepted but cannot show you, and another for the CSS it
could not accept at all. Easel does not have that gap, not because we were
cleverer but because the page *is* the document: anything the browser applies
is in the inspector's reach, and anything it ignores is visibly ignored.

**Measured**, two things still worth copying. Paper's nodes are `div` almost
exclusively (275 of 277) — it does not use semantic tags, so Easel emitting
`h1`, `p`, `button` and `a` is a real advantage both for the published page and
for the agent reading it back. And canvas nodes carry `content-visibility` and
`contain`, which is how a few hundred live DOM nodes stay cheap to scroll. We
will want that when documents get big.

## The instructions Paper ships to agents

This is the most transferable thing in the audit, and probably Paper's real
moat. Guidance reaches the agent through three channels: a `serverDescription`
injected into the host's system prompt, a `get_guide` tool with three topics
(`paper-mcp-instructions`, `mobile-status-bar`, `figma-import`), and the guide
body itself. **Quoted**, the founder calls it the secret sauce: *"we actually
give instructions to the model not to do these common mistakes... we had the
more senior designers on the team distill their knowledge into the
instructions."*

The substance, because it is worth having on our own terms:

**Mandatory review checkpoints.** Screenshot after each section, evaluate six
named criteria — spacing, typography, contrast, alignment, clipping, repetition
— and summarise to a one-line verdict. Plus a rule about recovery: *"do not
delete the entire piece of work and start over unless it's truly the only path.
Starting over is very frustrating to the user."*

**Write small, write often.** One visual group per `write_html` call; more than
about fifteen lines means break it up; never batch a whole component. The
reasoning is about the person watching, not the model: *"Watching a design
build up element by element is satisfying and builds trust. A 60-second wait
followed by a fully formed design feels like a black box."*

**A design brief before any HTML** — five or six hex values with roles, type
choices, a spacing rhythm, and one sentence of direction.

**Taste rules**, distilled from designers rather than derived from a model:
default to removal over addition; vary spacing deliberately and allow
asymmetry; default to light mode; one intense colour moment rather than five;
body text never pure black and never plain grey; avoid text at 12px or below;
realistic placeholder content; and an explicit ban on the "modern SaaS" look,
meaning bright purple or lime on dark navy. Their heuristic for timelessness is
the best line in the whole guide: *"if the accent color could plausibly appear
in a physical artifact — a poster, a book cover, a piece of clothing, an
interior, a street sign — it's probably timeless. If it only exists on screens,
be skeptical."*

**Vertical lane alignment.** Fixed-width slots with `flexShrink: 0` for icons,
indicators and actions, *"even when a slot is empty in some rows. Never rely on
gap alone."* This is the specific, unglamorous rule that separates a repeated
row that looks designed from one that looks generated.

**Units and prerequisites.** `get_font_family_info` is mandatory before any
typographic styling. `px` for font-size, `em` for letter-spacing, `px` for
line-height.

And one rule about screenshots that we agree with completely: *"Never use
screenshots as inputs to building code, only use screenshots to verify quality
of results."*

## AI features

**Documented and quoted.** Create image is `⌘⇧I`, create SVG is `⌘⇧J` (Quiver
Arrow 1.1, and the output is path-editable rather than an opaque asset), upload
image is `⌘⇧K`. Image models have rotated over time: Flux 2, Nano Banana Pro
(Gemini 3), Nano Banana 2, OpenAI GPT Image 2, OpenAI Image Edit 1.5, Seedream
4.5, and xAI's generator.

"Variety pack" is worth understanding correctly, because the name reads like a
model and it is not one. It is a fan-out mode: *"this will use four different
models at once and you can quickly explore the possibility space... we kind of
rotate which models are in there."* Image editing preserves aspect ratio and
sizing between prompts, and any canvas object can be copied as PNG and fed back
in as generation input. Right-click also offers **Vectorize** (raster to SVG)
and **Extract colors**.

**There is no in-app text-to-design.** Prompt-to-layout in Paper happens only
through an external agent over MCP; there is no agent chat panel in the app at
all. A "canvas-aware agent assistant" is on the **roadmap**, in progress. This
is the one place where a solo hackathon entry can be ahead of a funded team, and
it is worth being precise about rather than smug: Paper's bet is that your
agent already lives in your editor, so the app does not need one.

## Shaders

**Documented.** Thirty open-source WebGL2 shaders ship as
`@paper-design/shaders` (Apache 2.0, roughly 3.4k stars), authored visually
inside Paper: mesh-gradient, static-mesh-gradient, static-radial-gradient,
dithering, image-dithering, dot-grid, dot-orbit, fluted-glass, gem-smoke,
god-rays, grain-gradient, halftone-cmyk, halftone-dots, heatmap,
lens-distortion, liquid-metal, metaballs, neuro-noise, paper-texture,
perlin-noise, pulsing-border, simplex-noise, smoke-ring, spiral, swirl,
voronoi, warp, water, waves, color-panels. Each takes sizing parameters
(`fit`, `scale`, `rotation`, offsets) and motion parameters (`speed`, `frame`),
and ships named presets. Right-click and Copy as React yields a
`@paper-design/shaders-react` component with the exact props you were looking
at. **Quoted:** *"this is our marketing budget. We don't think of this as
product development."*

Our effects are CSS and theirs are WebGL, and the fair version of that
comparison is narrower than we had it. The React component Paper exports is
real, reusable, zero-dependency code — it is not a screenshot and not a
lock-in. The limitation is what the code renders *into*: a canvas. So the
result is not restylable node by node, not inspectable as CSS, and not
something the rest of the design's tokens or the person's colour picker can
reach. Ours look less impressive and stay part of the document. Both of those
are true at once.

## Colour

**Documented and shown.** The colour system is OKLCH/Oklab based and
perceptually uniform, with a picker that has per-gamut tabs and automatic gamut
detection, previous/new comparison, and copyable `L C H`, `L A B` and `R G B`
triplets. The eyedropper is `I`, and holding `⇧` while eyedropping adds
gradient colours.

The genuinely differentiated part is not OKLCH, which everyone is adopting; it
is that **sRGB and Display P3 coexist per element** — *"mix `oklch()`,
`display-p3`, and hex per element, just like production CSS"* — where Figma has
a file-wide toggle. There is also a **Selection colors** panel that bulk-changes
a colour across many elements and shows how many elements use each one.

Easel's ported picker has the P3 tabs and `L C H` / `H S L` / `R G B` rows, so
the readouts are close to parity; we have HSL where Paper has Oklab, and we do
not do per-element gamut.

## Tokens

**Documented.** Ten types, matching the enum in their MCP schemas: breakpoint,
color, container, fontFamily, fontSize, fontWeight, letterSpacing, lineHeight,
radius, spacing. The framing is deliberately unmysterious: *"Tokens—also known
as CSS variables... If you use Tailwind, Paper's token system maps directly to
how it works."*

Tokens are created in a **Theme tab** in the left panel, or by an agent, either
from a design or from the CSS custom properties already in your codebase. They
can alias each other through `var(--other-token)`. They do not stay linked
across files. `get_tokens` can emit three formats — json, a vanilla `:root`
stylesheet, or a Tailwind v4 `@theme { }` block — which is the same instinct
behind our `export_code` formats. **Roadmap:** reusable theme classes, and
multiple theme modes such as dark and compact.

## What Paper has not built

**Quoted and roadmap.** No components or instances — the founder: *"we don't
have components in paper yet. It's this common complaint"*. No interactive
prototyping, and the plan is not hotspot linking but iframe embeds of
externally hosted prototypes plus comments. No version history or branching;
their version-control story is git in your own repository. No third-party
plugin API. No CSS Grid. And no native Tailwind rendering — today Tailwind is a
conversion at export time, with real-time Tailwind rendering in progress
alongside the Tailwind team.

Useful calibration for us: components, grid, prototyping and version history
are unbuilt in Paper too. "Match Paper" is a smaller target than its toolbar
suggests.

## Where Paper is well ahead of us

Saying this plainly is what makes the rest of this file credible.

Thirty-four tools to our twenty-two. Thirty polished WebGL shaders to our ten
CSS effects. Real-time multiplayer with agent presence, where we have one
person and one agent in one tab. Comment threads an agent can read and resolve,
which is a collaboration primitive we do not have at all. A pen tool and vector
path editing. P3 and OKLCH colour throughout, per element. Font enumeration
from the machine. PDF and video export. A browser extension with about thirty
thousand users. Desktop tabs, folders, multi-file navigation. A property panel
substantially deeper than ours.

## What we take from it

Three things.

The layout model is settled, not chosen: absolute roots with flow layout inside
them is what a real HTML canvas converges on, and both tools got there
independently.

The instructions are the product. Paper's tool schemas are good, but the reason
its output looks designed is the guidance it ships alongside them — and that is
the cheapest thing in this entire audit to copy, so we have (`src/mcp/guide.ts`).

And the gap that is actually ours is distribution, not features. Paper's MCP
server needs its desktop app because its tools are powerful enough to need a
machine; its browser path is real but gated behind an origin trial and a
per-origin partner allowlist. Easel needs a tab. That is the whole reason to
build this on WebMCP, and it is worth arguing with those specifics rather than
as a slogan.
