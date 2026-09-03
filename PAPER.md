# Paper, measured

Notes from reading `app.paper.design` in a browser, not from its marketing.
The file we looked at is Paper's own onboarding document, so its copy doubles
as a feature list, and the page itself is real DOM we can inspect.

Everything below is either **measured** (we read it out of the live page) or
**shown** (it appears in a screenshot Paper embedded in that file). Anything
we could not reach without an account is marked as such.

## The document model — measured

Paper's canvas is not a `<canvas>`. Design nodes are ordinary DOM elements
carrying a `data-node-id` attribute and an inline `style`, which is the same
shape as Easel's `data-easel` plus inline style. Of 277 nodes on the page:

| what | count |
| --- | --- |
| `position: absolute` | 257 |
| explicit `left` / `top` | 251 |
| explicit `width` / `height` | 265 / 268 |
| `display: flex` | 50 |
| static (in flow) | 18 |

So Paper is **absolute placement with flex inside**, not flow layout, despite
the file's own claim that it "uses real CSS flex for layout as you design".
Both things are true at once: you dial in `justify-content`, `align-items`,
`gap`, `flex-wrap` on a frame, and that frame is still pinned with `left` and
`top`. A representative frame, verbatim:

```
height: 68px; width: 398px; border-radius: 18px; top: 572.617px;
left: 213.742px; display: flex; flex-direction: row;
justify-content: center; align-items: center; padding-inline: 4px;
position: absolute; box-shadow: ...; background-color: rgb(250, 250, 250);
```

This settles the question `BUILD.md` left open. The hybrid Easel already
ships is what the tool we are being measured against actually does, so the
deviation from `PLAN.md` is not a shortcut — it is the shape of the problem.

Two more things worth copying:

- Nodes are `div` almost exclusively (275 of 277). Paper does **not** use
  semantic tags. Easel emitting `h1`, `p`, `button` and `a` is a real
  advantage for both the published page and the agent reading it.
- Canvas nodes carry `content-visibility` and `contain`, which is how Paper
  keeps a few hundred live DOM nodes cheap to scroll. Worth stealing when our
  documents get big.

## Shipped surface

**Toolbar** — measured, nine tools: Move, Pan, Frame, Rectangle, Pen, Text,
Create image, Create SVG, Shaders.

**Left panel** — measured: `Design` / `Theme` tabs, a `Pages` list (multi-page
files), and a layer tree with per-type icons. The Theme tab is a searchable
"Theme tokens" panel, empty in this file.

**Selection chrome** — measured: an outline plus a dimension pill (`800 × 600`)
centred under the node. Selecting also deep-links the node into the URL
(`/file/<file>/<nodeId>`), so a selection is shareable.

**Colour** — shown. An OKLCH-first picker with `sRGB` and `Display P3` tabs, a
previous/new comparison, and three copyable triplets: `L C H`, `L A B`,
`R G B`, plus a combined `64.9% 0.299 29° / 100%` field. Easel's ported picker
already has the P3 tabs and `L C H` / `H S L` / `R G B` rows, so this is close
to parity; we have HSL where Paper has OKLab.

**Shaders** — shown, a palette in three groups:

- Image filters: Paper Texture, Fluted Glass, Water, Image Dithering,
  Halftone Dots, Halftone CMYK
- Logo animations: Heatmap, Liquid Metal
- Effects: mesh-gradient-like fields, glows, a dithered sphere

They render as WebGL `<canvas>` elements inside the DOM tree, marked
`data-paper-shader`. A shader's properties are a list of colour stops, each
with a swatch, hex, opacity, a visibility eye and a remove button, followed by
numeric params such as `Gain`.

**Context menu** — from the file's copy: Copy as PNG, Extract colors, Copy as
React.

**AI** — from the file's copy: image generation on the canvas (`⌘I`),
retexturing low-quality images or mockups with Google Nano Banana, and
editing, recolouring, combining and remixing images to make new graphics.
Paper's own advice is that regenerating with a better prompt beats asking a
model to patch an existing image. Their headline demo is an expense-tracker
screen single-shot by Claude Code over MCP.

**MCP** — from the file's copy: "you can use your own AI tools to read and
write from Paper natively via MCP", which needs the Paper **desktop app**
plus an agent pointed at its MCP server. This is the single most important
line in the file, because it is the thing Easel does differently: Paper needs
a native app to broker the connection, Easel is the page and the agent talks
to it in place.

## Not shipped — Paper's own roadmap

Quoted from the file, so these are features Paper does **not** have yet:

- everything for design systems; simple and expressive theme tokens;
  components with slots
- export anything as React; first-class Tailwind theming; import your real
  code components
- pen tool and vector editing; pixel editing and advanced filters

Useful calibration: theme tokens, components, Tailwind export and vector
editing are all unbuilt in Paper too. "Match Paper" is a smaller target than
the toolbar suggests.

## Could not reach without an account

The right-hand property panel does not render in view-only mode, and the
toolbar's submenus (Shaders, Create image) will not open, so the exact control
inventory per section is only known from the screenshots above.
