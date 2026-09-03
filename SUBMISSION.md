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
real CSS object, and an agent can read and write those same nodes through 22
tools registered on `document.modelContext`. You are not describing your design
to a model and getting a picture back. You are both holding the same document.

So the loop looks like this: you draw the hero, ask the agent for a pricing row
underneath, it writes real flex layout, you nudge the gap by hand, it recolours
against your theme tokens, you undo its last move with `⌘Z` because it is the
same undo stack. Nobody screenshots anything.

## Why WebMCP is the right fit

The nearest tool to Easel is Paper, which is genuinely excellent and also
exposes its file over MCP — but it needs a native desktop app installed to
broker the connection between the agent and the document.

That gap is the entire reason WebMCP exists. Easel *is* the page, so there is
nothing to install, nothing to run locally, and nothing to keep in sync. Open
the tab, and the design tool has an agent in it.

It goes further than convenience. Because the document is HTML in a live
browser, every tool can return the **measured** layout rather than the CSS it
was handed. An agent that writes `display: flex` reads back three boxes at real
coordinates and can see what it did. A design tool painting into a canvas
cannot give an agent that, no matter how good its API is — it has no browser
inside it to ask.

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

## How we built it

React, TypeScript, Vite, Zustand, Tailwind. No backend.

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
- The image generator answers `<img>` requests with 200 but `fetch` with 403,
  and sends no `access-control-allow-origin`. So setting `crossOrigin` makes
  even the `<img>` fail to decode, and inlining the bytes is impossible on that
  route. A plain URL is the only form that works. That is why `set_image` takes
  a `data:` URI: an agent generating its own image can hand over bytes and get a
  self-contained document.

## Effects that survive being exported

Ten effects — mesh gradient, aurora, liquid metal, heatmap, film grain, paper
texture, halftone, dither, fluted and frosted glass — built from layered
gradients, inline SVG turbulence and backdrop filters.

Paper renders its shaders into WebGL canvases. They look better than ours, and
they cannot be handed to anyone: a canvas is pixels, so "copy as React" can only
return a canvas plus a shader you now have to host. Ours are CSS, so they copy
out with the design and render anywhere. The page export carries their keyframes
too.

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

**1:55 — the rest, fast.** Theme token change reflowing colour everywhere. An
effect applied, then copied out as CSS. An image generated from a prompt. A
second page.

**2:25 — close.** Back to the full canvas. "Easel. The design tool is the page,
so the agent is already in it." Show the URL.

### Recording notes

- Enable `chrome://flags/#enable-webmcp-testing` if not in ChatGPT's browser.
- Have the file pre-seeded with the hero so 0:00 is not an empty canvas.
- Keep the activity feed visible for the whole take; it is the proof.
- Do not narrate the tool names. Show the canvas changing.

---

## Checklist

- [x] live URL over https, tools register there — 22 tools verified on the
      deployed site, including a write read back at measured coordinates
- [ ] tested in ChatGPT desktop, and Chrome with the flag
- [x] repo public with a LICENSE at the top level
- [ ] YouTube video public, under 3 minutes, narrated, strongest moment first
- [ ] description covers the fit, the UX, the shared work, and the build
- [ ] nothing touched after the deadline
