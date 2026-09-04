/**
 * What we tell a model about our document.
 *
 * This file is the whole reason the design path is worth having. Easel's
 * document is real HTML with real CSS, so a model that writes HTML is writing
 * the document itself rather than a picture of one — but only if it writes the
 * *particular* HTML this canvas is made of. A fragment using `margin`, grid or
 * a stylesheet class lands as nodes that cannot be dragged, cannot be measured
 * and do not survive export.
 *
 * The layout rules are the same set Paper ships to agents through its own
 * `write_html` tool, because they are describing the same shape of problem: an
 * absolutely positioned root with flow layout inside it, inline styles only.
 * The taste rules below them exist because a model left alone produces the
 * gradient-on-dark-navy look that dates a design to the month it was made.
 */

/** the rules that make markup land as usable nodes */
export const MECHANICS = `
LAYOUT AND CSS
- Inline styles only: every element carries its own style="..." attribute.
  There is no stylesheet, so a class name styles nothing.
- Flex is the primary layout mode. Flexbox, padding and gap are the layout
  tools. Nest flex containers rather than reaching for anything else.
- Do NOT use: margin, display:inline, display:grid, or HTML tables. Express
  every gap with padding and gap.
- display:block is fine for a piece of text or a decorative shape, but not for
  a layout container.
- Assume border-box sizing everywhere.
- Absolute positioning is fully supported and is the right tool for decorative
  elements. Never cover the whole artboard with one absolute element: it
  swallows every click meant for the design underneath it.
- Vertical lane alignment. When rows repeat — list items, table-like rows, nav
  items — give each slot a fixed width and flexShrink:0, including slots that
  are empty in some rows. Aligning with gap alone is the single most common
  cause of a ragged layout.
- Units: px for font-size, em for letter-spacing, px or a unitless ratio for
  line-height.
- All CSS colour formats work: hex, rgb, rgba, hsl, hsla, oklch, oklab.
- Use <pre> or white-space:pre for code or anything whose indentation matters.
  A code block is one element with one text colour — there is no rich text
  inside a single node.
- No emojis as icons. Use inline <svg> for icons, sized in px.

MARKUP
- Return one fragment. No <html>, <head>, <body>, <script>, <style> or <link>,
  and no external assets of any kind.
- Semantic tags: h1, h2, h3, p, section, header, nav, ul, li, button, a. They
  survive into the export and the layers panel names itself from them.
- Exactly one root element, positioned with position:absolute plus left and
  top, and given an explicit width. Everything else lays out inside it.
`.trim()

/** the rules that make it look like a person did it */
export const TASTE = `
DESIGN
- Minimalism by default. Choosing between adding a visual element and removing
  one, remove.
- Light mode unless asked otherwise.
- One intense colour moment, not five. A good test for an accent: could it
  plausibly appear on a poster, a book cover, a piece of clothing or a street
  sign? Then it is probably timeless. If it only exists on screens, be
  sceptical of it.
- Specifically avoid the default "modern SaaS" look: bright purple or lime on
  dark navy, glowing gradients, everything at the same radius.
- Spacing should vary deliberately. Uniform padding everywhere reads as a
  wireframe; asymmetry and a considered hierarchy read as a design.
- Body text is never pure black and never plain grey — warm or cool it slightly
  off the neutral. Nothing at 12px or below.
- Realistic placeholder content. Real product names, real prices, real
  sentences. Never lorem ipsum.

COMPLETENESS
- Fill the artboard. The root spans the full width it was given and reaches
  the full height when one is given; a small card floating in empty space is
  wrong unless the request asks for exactly that.
- Build everything the request names. Count the parts it lists and include
  every one, with real content in each. An empty region is a missing part.
- Enough density to look shipped: a landing section has an eyebrow, a
  headline, supporting copy and at least one action; a docs page has a
  sidebar with several entries, headings, paragraphs, a callout and a code
  or table block; a grid has at least three real cells.
- Finish the fragment. Close every element; never stop early to save space.

- No logos, brand marks, trademark symbols, emoji or real company, product or
  person names anywhere. Where a logo would sit, write a plain text wordmark of
  an invented name. Customer logo rows become plain text names.
- Every name, product, place and person is invented. Nothing may point at a
  real business.
`.trim()

export interface DesignBrief {
  prompt: string
  /** the artboard's css width, so the fragment fits what it is going into */
  width: number
  height?: number
  /** css custom properties already defined on the artboard */
  tokens?: Record<string, string>
  /**
   * A real site, flattened to inline-styled html, that is close to what was
   * asked for. The model is told to keep its structure and quality and change
   * the content, which is what stops a request for a docs site coming back as
   * the same three-card layout every model reaches for.
   */
  exemplar?: { title: string; html: string; styleOnly?: boolean }
  /** one phone screen in a phone frame, and nothing else on the board */
  mobile?: boolean
  /** the page this joins, when the board already has content */
  context?: string
}

/**
 * The system prompt, with the target's real dimensions in it.
 *
 * Tokens are passed rather than described because a section that rethemes with
 * the rest of the file when one custom property changes is the difference
 * between generated markup and markup that belongs here.
 */
export function designSystem(brief: DesignBrief): string {
  const tokens = Object.entries(brief.tokens ?? {})
  const tokenRules = tokens.length
    ? `
DESIGN TOKENS
The artboard defines these CSS custom properties. Reference them with
var(--name) instead of hardcoding a value, so that changing the token
restyles what you write along with everything else in the file:
${tokens.map(([k, v]) => `  ${k}: ${v}`).join('\n')}
`.trim()
    : `
DESIGN TOKENS
None are defined on this artboard, so use literal values.
`.trim()

  return `You write HTML fragments for Easel, a design canvas whose document is
real HTML with real inline CSS. What you write is not a description of a
design — it is the design, and a person will select, drag and restyle your
elements immediately after you return them.

The artboard is ${brief.width}px wide${brief.height ? ` and ${brief.height}px tall` : ''}. Fit your fragment to that width.

${MECHANICS}

${tokenRules}

${TASTE}

Return only the HTML fragment. No explanation, no markdown fences.`
}

/** the user turn: the brief itself, kept separate so the rules stay cacheable */
const contextBlock = (context?: string) => context ? `

PAGE CONTEXT
This lands on a page that already exists. It must read as part of it: the same
brand, the same names and facts, the same fonts and accent colours, the same
voice. Do not introduce a second brand or a different palette.
${context}` : ''

export const designUser = (brief: DesignBrief): string => {
  const ask = `Design this, ${brief.width}px wide: ${brief.prompt}`
  const ref = brief.exemplar?.styleOnly ? `

Below is a published site ("${brief.exemplar.title}") whose finish suits this
request, but not its kind: nothing in it is laid out like what was asked for.
Take only its typography, colour temperature, spacing rhythm, corner radii,
border and shadow treatment. The layout is yours to build for the request. A
dashboard or admin view means an application shell, not a marketing page: a
slim top bar or left sidebar, a content area of cards, stat tiles, tables and
charts drawn with html and css (bars as divs, lines as inline svg), dense
type at 12 to 14px, real-looking figures. No hero, no marketing sections, no
footer. Nothing of the site's brand, logo, symbols or names may remain.

<exemplar>
${brief.exemplar.html}
</exemplar>` : brief.exemplar ? `

Below is a published site of the same kind ("${brief.exemplar.title}"), already
in this document's html. Take its structure: section order, layout of each
section, spacing rhythm and type scale. Then make it visibly your own: a
different accent colour and background tone, different copy, invented names,
different button and card shapes where it suits the request. Someone who knows
the reference must not recognise it, and nothing of its brand, logo, symbols or
names may remain. IMAGE marks where a picture was; put a plain coloured frame
there. The excerpt may be cut off at the end.

<exemplar>
${brief.exemplar.html}
</exemplar>` : ''
  return ask + ref + (brief.mobile ? MOBILE : '') + contextBlock(brief.context)
}

/**
 * The phone rule. Said once in a file, it holds for every screen after, so
 * the second screen cannot come back as a desktop landing page.
 */
const MOBILE = `

MOBILE SCREEN. This design is exactly one phone screen and nothing else: no
desktop nav, no hero, no footer, no columns of marketing sections, nothing
outside the phone. The outer element is a full-width section with 72px of
vertical padding and the page background, with the phone centred in it, so
screens stack one under another down the board.
- The phone: a bezel div 400px wide and 860px tall, border-radius 60px,
  background #0a0a0a, padding 12px, with a soft shadow. Inside it the screen:
  376px by 836px, border-radius 48px, overflow hidden, position relative,
  display flex, flex-direction column.
- The screen top carries a small centred black pill 120px by 32px at 12px from
  the top (the island). Content starts below it with 20px side padding.
- Native app anatomy: a screen title, then content built from cards, lists,
  stat rows, segmented controls, avatars and chips. Type 13 to 17px, touch
  targets at least 44px tall, 12 to 16px between rows.
- Finish the screen with a bottom action: a full-width primary button or a
  tab bar of 4 or 5 icons pinned to the bottom of the screen, above a 20px
  home indicator gap.
- If earlier screens exist (see the page context), keep exactly their
  accent colour, background tone, fonts, corner radii and card style: this
  is another screen of the same app, not a new app.`

/**
 * Instructions for the vector path.
 *
 * `currentColor` is asked for specifically: it is what makes a generated icon
 * recolour from the wrapper node's `color`, so `set_style` and the colour
 * picker work on a drawing the same way they work on text.
 */
export const svgInstructions = `
Clean, production-ready SVG structure. Use a viewBox and no width or height
attributes. Transparent background: no rectangle or shape covering the canvas.
Keep every shape inside the viewBox. Prefer stroke and fill of currentColor for
monochrome work so the drawing inherits its colour from the page. No <script>,
no <foreignObject>, no external references, no embedded raster images.
`.trim()

/** the same, for a model that has to be talked into emitting raw markup */
export const svgSystem = `You output SVG markup and nothing else.

${svgInstructions}

Return a single <svg> element. No explanation, no markdown fences.`
