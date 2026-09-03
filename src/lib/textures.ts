import type { Style } from '../doc/types'

/**
 * Page backgrounds, as css.
 *
 * Same constraint as the effects: a texture that needs a canvas or a
 * pseudo-element cannot leave the editor. These are layered `background-image`s
 * — gradients, a tiled line, or a small SVG turbulence field — so they copy
 * out with the rest of the design and render anywhere.
 *
 * They live here rather than in `effects.ts` because they are meant as
 * artboard and frame fills, not as decorative treatments on a button. The
 * picker is in the Background section; `apply_effect` still knows their names
 * so an agent has one tool for both.
 */

export interface Texture {
  name: string
  label: string
  /**
   * Picker-only. The canvas `style` stays subtle; a 34×20 thumb needs a
   * louder base colour, tighter tiles, and enough contrast to tell them apart.
   */
  preview: Style
  style: Style
}

/** an SVG turbulence field, small enough to sit in a url() */
const noise = (freq: number, octaves: number, opacity: number, seed = 3) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">`
    + `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" `
    + `numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/></filter>`
    + `<rect width="160" height="160" filter="url(#n)" opacity="${opacity}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * a repeating field of `.:-=+*#%@`, as an svg data uri.
 *
 * the canvas fill stays a tiled background-image so it copies out; the picker
 * just uses a tighter tile so the glyphs read at thumb size.
 */
const asciiTile = (fill: string, size: number, cols: number, rows: number) => {
  const chars = '.:-=+*#%@'
  const glyphs = Array.from({ length: rows * cols }, (_, i) => {
    const x = (i % cols) * size
    const y = Math.floor(i / cols) * size
    const ch = chars[(i * 3 + Math.floor(i / cols) * 5) % chars.length]
    return `<text x="${x + 1}" y="${y + size - 1}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${size}" font-weight="700">${ch === '&' ? '&amp;' : ch}</text>`
  }).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * size}" height="${rows * size}">`
    + `<g fill="${fill}">${glyphs}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** a few scattered specks, for newsprint ink and film dust */
const speckle = (opacity: number, count: number, seed: number) => {
  const dots = Array.from({ length: count }, (_, i) => {
    const x = ((seed * 37 + i * 53) % 160)
    const y = ((seed * 19 + i * 97) % 160)
    const r = 0.4 + ((i * 13) % 7) / 10
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#1a1a1a"/>`
  }).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">`
    + `<g opacity="${opacity}">${dots}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export const TEXTURES: Texture[] = [
  {
    name: 'newsprint',
    label: 'Newsprint',
    preview: {
      backgroundColor: '#e4dcc8',
      backgroundImage: [
        'radial-gradient(rgba(50,42,28,0.45) 0.85px, transparent 1px)',
        'radial-gradient(rgba(50,42,28,0.38) 0.65px, transparent 0.8px)',
        speckle(1, 36, 11),
      ].join(', '),
      backgroundSize: '5px 5px, 7px 6px, 22px 22px',
      backgroundPosition: '0 0, 2px 3px, 0 0',
    },
    style: {
      backgroundColor: '#f3efe4',
      backgroundImage: `${noise(0.7, 4, 0.22, 4)}, ${speckle(1, 22, 11)}`,
      backgroundBlendMode: 'multiply, normal',
    },
  },
  {
    name: 'kraft',
    label: 'Kraft',
    preview: {
      backgroundColor: '#c4a574',
      backgroundImage: [
        'radial-gradient(rgba(90,60,28,0.35) 1.1px, transparent 1.4px)',
        'radial-gradient(rgba(70,48,22,0.28) 0.8px, transparent 1.1px)',
      ].join(', '),
      backgroundSize: '6px 5px, 9px 8px',
      backgroundPosition: '0 0, 3px 4px',
    },
    style: {
      backgroundColor: '#c4a574',
      backgroundImage: noise(0.08, 5, 0.42, 8),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'linen',
    label: 'Linen',
    preview: {
      backgroundColor: '#efe6d4',
      backgroundImage: [
        'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(90,70,50,0.28) 2px, rgba(90,70,50,0.28) 3px)',
        'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(90,70,50,0.22) 2px, rgba(90,70,50,0.22) 3px)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#f6f1e8',
      backgroundImage: [
        'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(90,70,50,0.07) 2px, rgba(90,70,50,0.07) 3px)',
        'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(90,70,50,0.055) 2px, rgba(90,70,50,0.055) 3px)',
        noise(0.9, 2, 0.12, 5),
      ].join(', '),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'canvas_weave',
    label: 'Canvas',
    preview: {
      backgroundColor: '#e8d9b8',
      backgroundImage: [
        'repeating-linear-gradient(45deg, rgba(80,60,40,0.32) 0 2px, transparent 2px 5px)',
        'repeating-linear-gradient(-45deg, rgba(80,60,40,0.22) 0 2px, transparent 2px 5px)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#efe6d4',
      backgroundImage: [
        'repeating-linear-gradient(45deg, rgba(80,60,40,0.09) 0 2px, transparent 2px 7px)',
        'repeating-linear-gradient(-45deg, rgba(80,60,40,0.06) 0 2px, transparent 2px 7px)',
        noise(0.35, 3, 0.18, 6),
      ].join(', '),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'fine_grain',
    label: 'Fine Grain',
    preview: {
      backgroundColor: '#c9c4ba',
      backgroundImage: [
        'radial-gradient(#5c574e 0.7px, transparent 0.85px)',
        'radial-gradient(#5c574e 0.5px, transparent 0.65px)',
      ].join(', '),
      backgroundSize: '3px 3px, 5px 4px',
      backgroundPosition: '0 0, 1px 2px',
    },
    style: {
      backgroundColor: '#f5f4f2',
      backgroundImage: noise(1.15, 3, 0.2, 2),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'coarse_grain',
    label: 'Coarse Grain',
    preview: {
      backgroundColor: '#b8b0a4',
      backgroundImage: [
        'radial-gradient(#4a443c 1.35px, transparent 1.7px)',
        'radial-gradient(#4a443c 0.9px, transparent 1.2px)',
      ].join(', '),
      backgroundSize: '7px 6px, 11px 9px',
      backgroundPosition: '0 0, 4px 3px',
    },
    style: {
      backgroundColor: '#ebe8e3',
      backgroundImage: noise(0.28, 2, 0.36, 9),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'film_dust',
    label: 'Film Dust',
    preview: {
      backgroundColor: '#b9b2a6',
      backgroundImage: [
        'radial-gradient(#3f3a34 0.85px, transparent 1.05px)',
        speckle(1, 40, 21),
        'repeating-linear-gradient(102deg, transparent 0 18px, rgba(30,26,22,0.45) 18px 19px, transparent 19px 34px)',
      ].join(', '),
      backgroundSize: '5px 5px, 20px 20px, auto',
    },
    style: {
      backgroundColor: '#e6e2da',
      backgroundImage: `${noise(0.85, 4, 0.3, 12)}, ${speckle(1, 32, 21)}`,
      backgroundBlendMode: 'multiply, normal',
    },
  },
  {
    name: 'grid',
    label: 'Grid',
    preview: {
      backgroundColor: '#fafafa',
      backgroundImage: [
        'linear-gradient(#8b8b92 1px, transparent 1px)',
        'linear-gradient(90deg, #8b8b92 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: '8px 8px',
    },
    style: {
      backgroundColor: '#fafafa',
      backgroundImage: [
        'linear-gradient(#e4e4e7 1px, transparent 1px)',
        'linear-gradient(90deg, #e4e4e7 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: '24px 24px',
    },
  },
  {
    name: 'dot_grid',
    label: 'Dot Grid',
    preview: {
      backgroundColor: '#f4f4f5',
      backgroundImage: 'radial-gradient(#71717a 1.35px, transparent 1.5px)',
      backgroundSize: '8px 8px',
    },
    style: {
      backgroundColor: '#fafafa',
      backgroundImage: 'radial-gradient(#c4c4c8 1.15px, transparent 1.25px)',
      backgroundSize: '16px 16px',
    },
  },
  {
    name: 'graph_paper',
    label: 'Graph Paper',
    preview: {
      backgroundColor: '#f0f7ff',
      backgroundImage: [
        'linear-gradient(#3b82f6 1px, transparent 1px)',
        'linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: '8px 8px',
    },
    style: {
      backgroundColor: '#f8fafc',
      backgroundImage: [
        'linear-gradient(#93c5fd 1px, transparent 1px)',
        'linear-gradient(90deg, #93c5fd 1px, transparent 1px)',
        'linear-gradient(#60a5fa 1px, transparent 1px)',
        'linear-gradient(90deg, #60a5fa 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: '20px 20px, 20px 20px, 100px 100px, 100px 100px',
    },
  },
  {
    name: 'soft_wash',
    label: 'Soft Wash',
    preview: {
      backgroundColor: '#f3e8dc',
      backgroundImage: [
        'radial-gradient(at 18% 22%, #f4b896 0px, transparent 55%)',
        'radial-gradient(at 80% 78%, #8fc9a8 0px, transparent 58%)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#f7f3ee',
      backgroundImage: [
        'radial-gradient(at 16% 20%, #fde8d8 0px, transparent 46%)',
        'radial-gradient(at 82% 28%, #f3e2d4 0px, transparent 42%)',
        'radial-gradient(at 72% 78%, #dceee4 0px, transparent 50%)',
        'radial-gradient(at 28% 84%, #efe6dc 0px, transparent 40%)',
        noise(0.55, 3, 0.16, 7),
      ].join(', '),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'dawn_wash',
    label: 'Dawn Wash',
    preview: {
      backgroundColor: '#f6efe8',
      backgroundImage: 'linear-gradient(165deg, #ffd7b8 0%, #e8b4d4 48%, #9bb6e8 100%)',
    },
    style: {
      backgroundColor: '#f6efe8',
      backgroundImage: [
        'linear-gradient(165deg, #fff4eb 0%, #f5e0ea 46%, #e2e8f4 100%)',
        noise(0.65, 3, 0.14, 14),
      ].join(', '),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'marble',
    label: 'Marble',
    preview: {
      backgroundColor: '#e8e2d6',
      backgroundImage: [
        'radial-gradient(ellipse at 22% 18%, #f6f1e8 0px, transparent 42%)',
        'linear-gradient(122deg, transparent 28%, #6d6256 32%, transparent 36%)',
        'linear-gradient(72deg, transparent 48%, #8a7d70 54%, transparent 60%)',
        'linear-gradient(158deg, transparent 14%, #4a433c 18%, transparent 22%)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#f4f1ec',
      backgroundImage: [
        'radial-gradient(ellipse at 22% 28%, rgba(210,200,190,0.45) 0px, transparent 52%)',
        'radial-gradient(ellipse at 78% 62%, rgba(160,150,142,0.22) 0px, transparent 48%)',
        'linear-gradient(118deg, transparent 41%, rgba(110,100,92,0.16) 43%, transparent 45%)',
        'linear-gradient(68deg, transparent 58%, rgba(150,140,130,0.1) 60%, transparent 63%)',
        'linear-gradient(152deg, transparent 28%, rgba(90,82,76,0.08) 29.5%, transparent 31%)',
        noise(0.04, 5, 0.22, 17),
      ].join(', '),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'ascii_dither',
    label: 'ASCII Dither',
    preview: {
      backgroundColor: '#d8d0c0',
      backgroundImage: asciiTile('#1a1814', 8, 10, 8),
      backgroundRepeat: 'repeat',
      backgroundSize: '40px 32px',
    },
    style: {
      backgroundColor: '#f3efe6',
      backgroundImage: asciiTile('#1c1914', 10, 12, 8),
      backgroundRepeat: 'repeat',
      backgroundSize: '120px 80px',
    },
  },
]

export const textureNames = TEXTURES.map(t => t.name)

export const textureOf = (name: string) => TEXTURES.find(t => t.name === name)

/**
 * Which texture, if any, a node currently has.
 *
 * Same honesty as `effectOn`: matched on the background image, so a fill the
 * person has since edited by hand stops matching.
 */
export function textureOn(style: Style): string | null {
  const found = TEXTURES.find(t =>
    t.style.backgroundImage != null && style.backgroundImage === t.style.backgroundImage)
  return found?.name ?? null
}

/**
 * The url inside a `background-image: url(...)`, or null if this is a
 * gradient, a texture, or empty.
 *
 * Used by the inspector field so it can show what the person typed, and by
 * the generate button so it knows there is already a picture to replace.
 */
export function imageUrl(style: Style): string | null {
  const img = (style.backgroundImage ?? '').trim()
  if (!img || textureOn(style)) return null
  const m = /^url\(\s*(['"]?)([\s\S]*?)\1\s*\)$/.exec(img)
  if (!m) return null
  const src = m[2].trim()
  return src || null
}

/**
 * Wrap a src as a css url(), without double-wrapping one that already is.
 */
export function asCssUrl(src: string): string {
  const trimmed = src.trim()
  if (/^url\(/i.test(trimmed)) return trimmed
  return `url(${JSON.stringify(trimmed)})`
}
