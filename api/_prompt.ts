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
  exemplar?: { title: string; html: string }
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
export const designUser = (brief: DesignBrief): string => {
  const ask = `Design this, ${brief.width}px wide: ${brief.prompt}`
  if (!brief.exemplar) return ask
  return `${ask}

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
</exemplar>`
}

/**
 * Instructions for the vector path.
 *
 * `currentColor` is asked for specifically: it is what makes a generated icon
 * recolour from the wrapper node's `color`, so `set_style` and the colour
 * picker work on a drawing the same way they work on text.
 */
export const svgInstructions = `
Clean, production-ready SVG structure. Use a viewBox and no width or height
attributes. Prefer stroke and fill of currentColor for monochrome work so the
drawing inherits its colour from the page. No <script>, no <foreignObject>, no
external references, no embedded raster images.
`.trim()

/** the same, for a model that has to be talked into emitting raw markup */
export const svgSystem = `You output SVG markup and nothing else.

${svgInstructions}

Return a single <svg> element. No explanation, no markdown fences.`
