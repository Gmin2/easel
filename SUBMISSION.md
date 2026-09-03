# Submission

Everything a judge reads, plus the script for the video. Copy the sections
into Devpost as they are.

---

## Tagline

A design canvas where you and your agent edit the same HTML, in the page.

## Links

- Live: https://easel-flax.vercel.app
- Video: _(paste the YouTube link)_
- Repo: https://github.com/Gmin2/easel

---

## What it does

Easel is a design tool that runs in a browser tab. You draw artboards, frames,
type and buttons; you drag, resize, snap, group, restyle and export. It behaves
like a design tool because that is what it is.

The difference is that every node on the canvas is a real HTML element with a
real CSS object, and an agent can read and write those same nodes through 25
tools registered on `document.modelContext`. You are not describing your design
to a model and getting a picture back. You are both holding the same document.


So the loop looks like this: you draw the hero, ask the agent for a pricing row
underneath, it writes real flex layout, you nudge the gap by hand, it recolours
against your theme tokens, you undo its last move with `⌘Z` because it is the
same undo stack. Nobody screenshots anything.

## Why WebMCP is the right fit

The nearest tool to Easel is Paper, which is a better design tool than ours in
most respects and is built the same way underneath — real HTML, real CSS, an
MCP server over the live document. That similarity is what makes the one
difference between us worth stating precisely.

Paper's MCP server is a loopback endpoint on `127.0.0.1`, served by the Paper
desktop app while it is running, and its documentation says plainly that the
app is required. The requirement is earned rather than lazy: those tools
enumerate the fonts installed on the machine, read image files off local disk,
and render through the live canvas to produce screenshots, PDFs and video. A
design tool that capable has to be a program on a computer.

There is a browser path, and it is the most useful thing we found in a week of
reading. Paper has a WebMCP integration that embeds `app.paper.design` in an
iframe and calls `document.modelContext.getTools` — the same API Easel
registers on. Its README lists the conditions: Chrome 150 or newer,
registration for the WebMCP origin trial, and "Paper must allow your origin to
use our WebMCP tools", with the example marked "Available for Paper partners".
So the capability is real, and the access is a partner programme.

Easel needs a tab. No install, no loopback port, no allowlist, and nothing
brokering between the agent and the document, because the page is the server.
That is the gap WebMCP exists to close, and it closes it for whoever opens the
link rather than for whoever was approved. Paper's free tier also allows a
hundred MCP tool calls a week — a sensible thing to charge for when you are
running a server. We are not running one, so an agent can read as often as it
needs to and there is nothing to meter.

It goes further than convenience. Because the document is HTML in a live
browser, every tool can return the **measured** layout rather than the CSS it
was handed. An agent that writes `display: flex` reads back three boxes at real
coordinates and can see what it did. A design tool painting into a canvas
cannot give an agent that, no matter how good its API is — it has no browser
inside it to ask.

The same fact shows up from the other side of the problem. Paper's
`update_styles` returns the declarations it had to drop under `ignoredStyles`,
and the app carries an "Other styles" panel for agent-written CSS that has no
editable control yet. Both are honest engineering around something real: an
agent can write any CSS, and an editor models a subset of it. Being the page is
how we avoid needing either — a declaration is applied as written, and the next
read says in numbers what it did.

## How humans and agents share the work

Three deliberate decisions:

**One code path.** Every tool calls the same store action the buttons call.
There is no agent-only route to drift out of step, which is why an agent's
write is undoable, and why `undo` undoes whichever of you went last.

**`get_selection`.** When you say "make this bigger", the agent calls it and
finds out what you meant. It also works in reverse: `select_nodes` lets the
agent point at what it is talking about rather than describing where it is, and
a selection rides in the URL so it is a link you can send.

**Attribution.** The activity feed shows who did what, most recent first, with
agent turns tinted. Human edits are attributed by wrapping the store's actions
rather than by logging at each call site, so nothing can forget to. Repeats fold
together, so a drag reads as `patchStyle ×12` and not two hundred lines.
Clicking any entry selects what it touched — "the agent changed something" is
one click from "this, here".

## Asking for a design, not a picture of one

You do not need an agent attached to ask for something. Easel generates three
things in the page: a design, an image, an SVG.

The design path is the one that matters, and it is the same argument as the
rest of the tool. The model writes an HTML fragment with inline CSS — the
material the document is already made of — so what lands on the canvas is
nodes. Selectable, draggable, restylable, readable back through `get_node`,
handed over unchanged by `Copy as React`. Nothing is imported, flattened or
traced, and generating is not a different kind of edit from drawing, which is
why the person can take over mid-sentence. Images come back as bytes rather
than a URL we point at, so a generated image can become a `data:` URI and the
file stays self-contained without us. SVGs come back as paths, so a generated
icon recolours from its wrapper's `color` like any other element.

Paper has no in-app text-to-design at all. Prompt-to-layout there happens only
through an external agent over MCP, on the reasonable bet that your agent
already lives in your editor; a canvas-aware assistant is on their roadmap, in
progress. Easel has both: a landing prompt and starter cards on first load, plus
`⌘⇧I` / `⌘⇧J` prompt bars on the canvas, and agent tools
`generate_design`, `generate_image`, `generate_svg` over `/api/design`,
`/api/image`, `/api/svg`. Keys stay server-side; generated images embed as
`data:` URIs so the export is self-contained.

## How we built it

React, TypeScript, Vite, Zustand, Tailwind. The editor needs no backend; the
generation routes are serverless functions so that provider keys never reach
the browser.

The document is a flat map of nodes, each one a tag, an attribute bag and a
camelCase CSS object. Geometry is not a parallel set of fields: a node's
position and size live in `style.left/top/width/height`, so a drag and a
hand-typed `left: 40px` are the same edit and the export is always exactly what
is on screen. The canvas renders that tree as DOM inside a transformed div and
measures it back with `getBoundingClientRect`.

The editor chrome, colour picker, value fields, snapping and resize maths are
ported from a Skia-canvas motion tool we had already built. Its render path did
not survive the port — the nodes have to be DOM for any of the agent story to
be true — but its interaction model did.

Two things we measured rather than assumed:

- We read Paper's live DOM to check its layout model before committing to ours.
  257 of its 277 nodes are `position: absolute` with explicit sizes, with flex
  used inside frames. The hybrid we had chosen turned out to be what the state
  of the art actually does.
- The keyless image endpoint we tried first answers `<img>` requests with 200
  but `fetch` with 403, and sends no `access-control-allow-origin`. So setting
  `crossOrigin` makes even the `<img>` fail to decode, and the bytes cannot be
  read out of the page at all. That measurement is why generation goes through
  a route of our own: bytes we hold can become a `data:` URI, and a document
  made of `data:` URIs renders wherever it is pasted with nothing of ours still
  running. `set_image` takes a `data:` URI for the same reason — an agent that
  makes its own image hands over bytes rather than a link that can rot.

## Effects that survive being exported

Ten effects — mesh gradient, aurora, liquid metal, heatmap, film grain, paper
texture, halftone, dither, fluted and frosted glass — built from layered
gradients, inline SVG turbulence and backdrop filters.

Paper has thirty of these, all open source, and they look considerably better
than ours. Its Copy as React returns a real, zero-dependency component with the
exact props you were looking at, so the honest comparison is not about whether
they export. It is about what the code renders into. A canvas is pixels, so a
shader cannot be restyled node by node, inspected as CSS, or reached by the
colour picker and the tokens that dress the rest of the file. Ours are
gradients, filters and inline SVG turbulence — every property tunable by hand
or by an agent, and they copy out with the design and render anywhere. The page
export carries their keyframes too.

## Challenges

The hard call was rendering. We were porting the UI of a tool that paints into a
Skia canvas via WASM, and the fastest path would have been to port that too. But
WebMCP tools that hand an agent a pixel buffer are not much use, and none of the
"the document is HTML" advantages above would have been available. Throwing away
the renderer and keeping the interaction model was the decision the whole
project rests on.

The subtler one was context discipline. An embedded image is a hundred kilobytes
of base64, and `get_document` returning it would spend a model's entire context
on something it can do nothing with. Long attribute values are summarised in
everything an agent reads, while the real export still carries the bytes.

## What's next

Components with slots, importing real code components, and publishing an
artboard to a URL. Grid alongside flex in the inspector. And the spec gap we
kept wanting: streaming progress, so a long agent edit can show its work on the
canvas as it goes.

---

## Video script — under 3 minutes

Lead with the turn-taking, because that is the thing nothing else does. Record
in ChatGPT's browser so a real agent is calling the tools.

**0:00 — the moment.** Cold open, no titles. Canvas with a hero on it. Type
into the agent: *"add a three-card pricing row under the headline."* Cards
appear on the canvas as it writes. Say only: "That is a design tool in a browser
tab, and an agent editing it directly. No plugin, no desktop app."

**0:20 — it is really HTML.** Select a card, open the inspector, point at the
CSS. Hit `Copy as React` and paste into an editor. "There is no export step,
because the canvas was already this."

**0:40 — turns.** Drag a card by hand. Point at the activity feed: your edit
and the agent's, interleaved, attributed. Ask the agent *"tighten the gap and
match the brand colour"* — watch it change. Press `⌘Z`. "Same undo stack. It
undoes whoever went last."

**1:10 — it can see.** Ask *"is anything overflowing the artboard?"* It calls
`get_node` and answers from measured boxes. "It is reading the browser's
layout, not the CSS it wrote. That is what being in the page buys you."

**1:35 — "this".** Select a heading yourself. Say *"make this the same size as
the card titles."* It calls `get_selection` to find out what you meant.

**1:45 — leave a note, get it done.** Select the headline, press C, type
*"five words max."* Pin a second on a button: *"our green."* Ask the agent:
*"resolve the open comments."* It calls `list_comments`, edits each node, and
resolves each pin with a reply. "People point. Agents act. The page keeps the
record."

**1:55 — the rest, fast.** `⌘⇧I` for an image, an effect copied out as CSS, a
theme token changed, a second page.


**2:25 — close.** Back to the full canvas. "Easel. The design tool is the page,
so the agent is already in it." Show the URL.

### Recording notes

- Enable `chrome://flags/#enable-webmcp-testing` if not in ChatGPT's browser.
- Have the file pre-seeded with the hero so 0:00 is not an empty canvas.
- An edit takes 15 to 30 seconds, so cut the wait.
- Keep the activity feed visible for the whole take; it is the proof.
- Do not narrate the tool names. Show the canvas changing.

---

## Checklist

- [x] live URL over https, tools register there — 25 tools verified locally,
      including generation, measured layout reads, and a shared undo
- [ ] tested in ChatGPT desktop, and Chrome with the flag
- [x] repo public with a LICENSE at the top level
- [ ] YouTube video public, under 3 minutes, narrated, strongest moment first
- [ ] description covers the fit, the UX, the shared work, and the build
- [ ] nothing touched after the deadline
