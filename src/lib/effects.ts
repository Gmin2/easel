import type { Style } from '../doc/types'
import { TEXTURES, asCssUrl } from './textures'

/**
 * Effects, as css.
 *
 * Paper renders its shaders into WebGL canvases, which look wonderful and
 * cannot be exported: a canvas is pixels, so "copy as React" can only ever
 * hand you back a canvas and a shader you now have to host. Every effect here
 * is gradients, an inline SVG data URI, or a filter — real css that copies out
 * with the rest of the design and renders in any browser without us.
 *
 * That constraint also decides the shape: we only have inline styles, so no
 * effect may depend on a pseudo-element or a class. Textures are therefore
 * layered `background-image`s rather than `::after` overlays.
 */

export interface Effect {
  name: string
  label: string
  group: 'Gradients' | 'Textures' | 'Glass' | 'Light'
  /**
   * Picker-only. Same reason as textures: a thumb cannot take a background
   * shorthand on `backgroundImage` — the trailing colour is invalid there and
   * the swatch goes white. The canvas `style` stays the exportable fill.
   */
  preview: Style
  style: Style
}

/** an SVG turbulence field, small enough to sit in a url() */
const turbulence = (freq: number, octaves: number, opacity: number) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">`
    + `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" `
    + `numOctaves="${octaves}" stitchTiles="stitch"/></filter>`
    + `<rect width="160" height="160" filter="url(#n)" opacity="${opacity}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export const EFFECTS: Effect[] = [
  {
    name: 'mesh',
    label: 'Mesh',
    group: 'Gradients',
    preview: {
      backgroundColor: '#4318a8',
      backgroundImage: [
        'radial-gradient(at 20% 25%, #ff5c8a 0px, transparent 55%)',
        'radial-gradient(at 80% 20%, #7c5cff 0px, transparent 50%)',
        'radial-gradient(at 60% 80%, #22d3ee 0px, transparent 50%)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#4318a8',
      backgroundImage: [
        'radial-gradient(at 18% 24%, #ff5c8a 0px, transparent 55%)',
        'radial-gradient(at 82% 18%, #7c5cff 0px, transparent 52%)',
        'radial-gradient(at 62% 82%, #22d3ee 0px, transparent 50%)',
        'radial-gradient(at 25% 88%, #fbbf24 0px, transparent 45%)',
      ].join(', '),
      backgroundSize: '160% 160%',
      animation: 'easel-drift 22s ease-in-out infinite',
    },
  },
  {
    name: 'aurora',
    label: 'Aurora',
    group: 'Gradients',
    preview: {
      backgroundColor: '#04211f',
      backgroundImage: 'linear-gradient(120deg, #052e2b, #0f766e 35%, #22d3ee 60%, #a7f3d0 85%)',
    },
    style: {
      backgroundColor: '#04211f',
      backgroundImage: [
        'radial-gradient(at 10% 10%, #22d3ee 0px, transparent 45%)',
        'radial-gradient(at 70% 30%, #a7f3d0 0px, transparent 40%)',
        'radial-gradient(at 40% 90%, #0f766e 0px, transparent 55%)',
      ].join(', '),
      backgroundSize: '200% 200%',
      filter: 'blur(0.5px) saturate(1.15)',
      animation: 'easel-drift 30s linear infinite',
    },
  },
  {
    name: 'dawn',
    label: 'Dawn',
    group: 'Gradients',
    preview: {
      backgroundColor: '#f6d7c3',
      backgroundImage: 'linear-gradient(165deg, #ffe7c7 0%, #ffb4a2 40%, #c084fc 72%, #7dd3fc 100%)',
    },
    style: {
      backgroundColor: '#f6d7c3',
      backgroundImage: 'linear-gradient(165deg, #fff1dc 0%, #ffd0b8 28%, #f5b0c8 56%, #c4b5fd 78%, #93c5fd 100%)',
    },
  },
  {
    name: 'dusk',
    label: 'Dusk',
    group: 'Gradients',
    preview: {
      backgroundColor: '#1e1b4b',
      backgroundImage: 'linear-gradient(160deg, #0f172a 0%, #3730a3 38%, #7c3aed 64%, #f59e0b 100%)',
    },
    style: {
      backgroundColor: '#0f172a',
      backgroundImage: [
        'radial-gradient(at 80% 90%, #f59e0b 0px, transparent 42%)',
        'linear-gradient(160deg, #0b1224 0%, #1e1b4b 34%, #5b21b6 68%, #c2410c 100%)',
      ].join(', '),
    },
  },
  {
    name: 'sunset',
    label: 'Sunset',
    group: 'Gradients',
    preview: {
      backgroundColor: '#ea580c',
      backgroundImage: 'linear-gradient(135deg, #fb923c 0%, #f43f5e 44%, #c026d3 72%, #6d28d9 100%)',
    },
    style: {
      backgroundColor: '#9a3412',
      backgroundImage: 'linear-gradient(135deg, #fdba74 0%, #f97316 22%, #e11d48 52%, #a21caf 78%, #5b21b6 100%)',
    },
  },
  {
    name: 'mint',
    label: 'Mint',
    group: 'Gradients',
    preview: {
      backgroundColor: '#0f766e',
      backgroundImage: 'linear-gradient(150deg, #042f2e 0%, #0f766e 42%, #5eead4 74%, #ecfdf5 100%)',
    },
    style: {
      backgroundColor: '#042f2e',
      backgroundImage: [
        'radial-gradient(at 18% 12%, #99f6e4 0px, transparent 40%)',
        'linear-gradient(150deg, #022c28 0%, #0f766e 46%, #5eead4 100%)',
      ].join(', '),
    },
  },
  {
    name: 'ink',
    label: 'Ink',
    group: 'Gradients',
    preview: {
      backgroundColor: '#020617',
      backgroundImage: 'linear-gradient(180deg, #020617 0%, #1e293b 48%, #334155 100%)',
    },
    style: {
      backgroundColor: '#020617',
      backgroundImage: [
        'radial-gradient(ellipse at 28% 18%, #1e3a5f 0px, transparent 52%)',
        'radial-gradient(ellipse at 82% 78%, #312e81 0px, transparent 46%)',
        'linear-gradient(180deg, #020617 0%, #0b1224 58%, #1e1b4b 100%)',
      ].join(', '),
    },
  },
  {
    name: 'champagne',
    label: 'Champagne',
    group: 'Gradients',
    preview: {
      backgroundColor: '#f5e6c8',
      backgroundImage: 'linear-gradient(130deg, #fffbeb 0%, #fde68a 42%, #d4a574 100%)',
    },
    style: {
      backgroundColor: '#f8efd8',
      backgroundImage: [
        'radial-gradient(at 70% 20%, #fff7d6 0px, transparent 46%)',
        'linear-gradient(130deg, #fffbeb 0%, #fde68a 48%, #e8c07a 78%, #c9a36b 100%)',
      ].join(', '),
    },
  },
  {
    name: 'twilight',
    label: 'Twilight',
    group: 'Gradients',
    preview: {
      backgroundColor: '#1e1b4b',
      backgroundImage: 'linear-gradient(180deg, #0b1226 0%, #4c1d95 52%, #e879f9 100%)',
    },
    style: {
      backgroundColor: '#0b1226',
      backgroundImage: [
        'radial-gradient(at 50% 100%, #f0abfc 0px, transparent 48%)',
        'linear-gradient(185deg, #0b1226 0%, #312e81 46%, #7c3aed 78%, #f0abfc 100%)',
      ].join(', '),
    },
  },
  {
    name: 'ember',
    label: 'Ember',
    group: 'Gradients',
    preview: {
      backgroundColor: '#7f1d1d',
      backgroundImage: 'radial-gradient(ellipse at 50% 110%, #fbbf24 0%, #ea580c 34%, #9f1239 68%, #1c0a0a 100%)',
    },
    style: {
      backgroundColor: '#1c0a0a',
      backgroundImage: [
        'radial-gradient(ellipse at 50% 115%, #fbbf24 0px, transparent 42%)',
        'radial-gradient(ellipse at 50% 90%, #ea580c 0px, transparent 55%)',
        'linear-gradient(180deg, #1c0a0a 0%, #7f1d1d 62%, #c2410c 100%)',
      ].join(', '),
    },
  },
  {
    name: 'ocean',
    label: 'Ocean',
    group: 'Gradients',
    preview: {
      backgroundColor: '#0c4a6e',
      backgroundImage: 'linear-gradient(200deg, #082f49 0%, #0369a1 40%, #22d3ee 72%, #a5f3fc 100%)',
    },
    style: {
      backgroundColor: '#082f49',
      backgroundImage: [
        'radial-gradient(at 80% 10%, #67e8f9 0px, transparent 38%)',
        'linear-gradient(200deg, #082f49 0%, #0369a1 46%, #22d3ee 100%)',
      ].join(', '),
    },
  },
  {
    name: 'bloom',
    label: 'Bloom',
    group: 'Gradients',
    preview: {
      backgroundColor: '#fbcfe8',
      backgroundImage: [
        'radial-gradient(at 18% 22%, #fecdd3 0px, transparent 50%)',
        'radial-gradient(at 82% 18%, #e9d5ff 0px, transparent 48%)',
        'radial-gradient(at 60% 82%, #fde68a 0px, transparent 52%)',
      ].join(', '),
    },
    style: {
      backgroundColor: '#fce7f3',
      backgroundImage: [
        'radial-gradient(at 16% 20%, #fecdd3 0px, transparent 48%)',
        'radial-gradient(at 84% 16%, #e9d5ff 0px, transparent 46%)',
        'radial-gradient(at 72% 80%, #fde68a 0px, transparent 50%)',
        'radial-gradient(at 24% 86%, #bae6fd 0px, transparent 42%)',
      ].join(', '),
    },
  },
  {
    name: 'haze',
    label: 'Haze',
    group: 'Gradients',
    preview: {
      backgroundColor: '#d6d3c8',
      backgroundImage: 'linear-gradient(145deg, #eeeae2 0%, #c4c9b8 48%, #9aa8a8 100%)',
    },
    style: {
      backgroundColor: '#e8e6df',
      backgroundImage: [
        'radial-gradient(at 20% 30%, #f4f1ea 0px, transparent 50%)',
        'linear-gradient(145deg, #f3f0e8 0%, #c9cebf 52%, #a8b4b2 100%)',
      ].join(', '),
    },
  },
  {
    name: 'liquid_metal',
    label: 'Liquid Metal',
    group: 'Light',
    preview: {
      backgroundImage:
        'conic-gradient(from 210deg, #f8fafc, #64748b, #f1f5f9, #334155, #e2e8f0, #475569, #f8fafc)',
    },
    style: {
      backgroundImage:
        'conic-gradient(from 210deg, #f8fafc, #64748b 12%, #f1f5f9 26%, #334155 42%,'
        + ' #e2e8f0 58%, #475569 74%, #cbd5e1 88%, #f8fafc)',
      animation: 'easel-spin 14s linear infinite',
    },
  },
  {
    name: 'heatmap',
    label: 'Heatmap',
    group: 'Light',
    preview: {
      backgroundColor: '#020617',
      backgroundImage:
        'radial-gradient(circle at 50% 55%, #fff 0%, #fde047 18%, #f97316 38%, #b91c1c 58%, #1e1b4b 78%, #020617 100%)',
    },
    style: {
      backgroundColor: '#020617',
      backgroundImage:
        'radial-gradient(circle at 50% 55%, #ffffff 0%, #fde047 16%, #f97316 34%,'
        + ' #b91c1c 52%, #4c1d95 70%, #020617 100%)',
      backgroundSize: '140% 140%',
      backgroundPosition: 'center',
      animation: 'easel-pulse 6s ease-in-out infinite',
    },
  },
  {
    name: 'grain',
    label: 'Film Grain',
    group: 'Textures',
    preview: {
      backgroundColor: '#c4bfb8',
      backgroundImage: turbulence(0.9, 4, 0.72),
      backgroundBlendMode: 'multiply',
    },
    style: {
      backgroundColor: '#e7e5e4',
      backgroundImage: turbulence(0.9, 4, 0.42),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'paper_texture',
    label: 'Paper Texture',
    group: 'Textures',
    preview: {
      backgroundColor: '#e4dfd4',
      backgroundImage: turbulence(0.045, 5, 0.72),
      backgroundBlendMode: 'multiply',
    },
    style: {
      backgroundColor: '#faf9f7',
      backgroundImage: turbulence(0.045, 5, 0.5),
      backgroundBlendMode: 'multiply',
    },
  },
  {
    name: 'halftone',
    label: 'Halftone Dots',
    group: 'Textures',
    preview: {
      backgroundColor: '#ffffff',
      backgroundImage: 'radial-gradient(#111 22%, transparent 24%)',
      backgroundSize: '7px 7px',
    },
    style: {
      backgroundColor: '#ffffff',
      backgroundImage: 'radial-gradient(#111111 22%, transparent 24%)',
      backgroundSize: '8px 8px',
    },
  },
  {
    name: 'dither',
    label: 'Dither',
    group: 'Textures',
    preview: {
      backgroundImage: 'repeating-conic-gradient(#111 0% 25%, #fff 0% 50%)',
      backgroundSize: '6px 6px',
    },
    style: {
      backgroundImage: 'repeating-conic-gradient(#111111 0% 25%, #ffffff 0% 50%)',
      backgroundSize: '6px 6px',
    },
  },
  {
    name: 'fluted_glass',
    label: 'Fluted Glass',
    group: 'Glass',
    preview: {
      backgroundColor: '#c4b5fd',
      backgroundImage: [
        'repeating-linear-gradient(90deg, rgba(255,255,255,.7) 0 3px, rgba(255,255,255,.12) 3px 8px)',
        'linear-gradient(120deg, #a5b4fc, #f0abfc)',
      ].join(', '),
    },
    style: {
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(255,255,255,0.62) 0 4px,'
        + ' rgba(255,255,255,0.08) 4px 11px)',
      backdropFilter: 'blur(7px)',
      border: '1px solid rgba(255,255,255,0.35)',
    },
  },
  {
    name: 'frosted_glass',
    label: 'Frosted Glass',
    group: 'Glass',
    preview: {
      backgroundColor: '#93c5fd',
      backgroundImage: 'linear-gradient(140deg, rgba(255,255,255,.72), rgba(255,255,255,.2))',
    },
    style: {
      backgroundImage:
        'linear-gradient(140deg, rgba(255,255,255,0.55), rgba(255,255,255,0.16))',
      backdropFilter: 'blur(16px) saturate(1.4)',
      border: '1px solid rgba(255,255,255,0.4)',
      boxShadow: '0 8px 32px -12px rgba(15,23,42,0.35)',
    },
  },
]

/**
 * Effects and page textures share one name list, so `apply_effect` can put
 * either on a node. The inspector still splits them: Effects shows EFFECTS
 * (minus the Gradients group), Gradients shows that group, Background shows
 * TEXTURES.
 */
const LOOKS = [...EFFECTS, ...TEXTURES]

export const effectNames = LOOKS.map(e => e.name)

export const effectOf = (name: string) => LOOKS.find(e => e.name === name)

export const GRADIENTS = EFFECTS.filter(e => e.group === 'Gradients')

/** every property any look sets, so removing one leaves nothing behind */
const OWNED = [...new Set([
  ...LOOKS.flatMap(e => Object.keys(e.style)),
  // an image fill uses these even when no named look does
  'backgroundPosition',
  'backgroundRepeat',
])]

/**
 * The patch that applies an effect, or clears one.
 *
 * Effects overlap in which properties they set, so switching between two of
 * them has to clear what the outgoing one owned — otherwise a mesh gradient's
 * animation would survive onto a halftone and quietly keep running.
 */
export function effectPatch(name: string | null): Style {
  const blank: Style = {}
  for (const k of OWNED) blank[k] = ''
  if (!name) return blank
  const effect = effectOf(name)
  if (!effect) return {}
  return { ...blank, ...effect.style }
}

/**
 * Which effect, if any, a node currently has.
 *
 * Matched on the background image, since that is the one property every effect
 * sets to something distinctive. A node the person has since edited by hand
 * stops matching, which is the honest answer: it is their design now, not the
 * preset.
 */
export function effectOn(style: Style): string | null {
  const found = EFFECTS.find(e =>
    e.style.backgroundImage != null && style.backgroundImage === e.style.backgroundImage)
  return found?.name ?? null
}

/**
 * The patch that sets or clears a background image.
 *
 * Same owned-property wipe as `effectPatch`, so swapping a kraft fill for a
 * photograph does not leave a blend mode or a 24px tile size behind. The
 * image is always `cover` + `center` — that is the fill people mean when
 * they drop a picture on an artboard.
 */
export function imageBgPatch(src: string | null): Style {
  const blank: Style = {}
  for (const k of OWNED) blank[k] = ''
  if (!src) return blank
  return {
    ...blank,
    backgroundImage: asCssUrl(src),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

/**
 * The keyframes the animated effects reference.
 *
 * Kept here rather than in the stylesheet so that the export can carry them:
 * a design with a drifting mesh gradient is not really exported if the
 * animation is left behind in our css.
 */
export const KEYFRAMES = `
@keyframes easel-drift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes easel-spin {
  to { transform: rotate(360deg); }
}
@keyframes easel-pulse {
  0%, 100% { background-size: 130% 130%; }
  50% { background-size: 165% 165%; }
}
`.trim()

/** does this subtree use an effect that needs the keyframes shipped with it */
export const usesKeyframes = (css: string) => /animation:\s*easel-/.test(css)
