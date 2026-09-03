import type { Style } from '../doc/types'

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
  /** what a swatch in the picker should look like */
  preview: string
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
    label: 'Mesh Gradient',
    group: 'Gradients',
    preview: 'radial-gradient(at 20% 25%, #ff5c8a 0px, transparent 55%), radial-gradient(at 80% 20%, #7c5cff 0px, transparent 50%), radial-gradient(at 60% 80%, #22d3ee 0px, transparent 50%), #4318a8',
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
    preview: 'linear-gradient(120deg, #052e2b, #0f766e 35%, #22d3ee 60%, #a7f3d0 85%)',
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
    name: 'liquid_metal',
    label: 'Liquid Metal',
    group: 'Light',
    preview: 'conic-gradient(from 210deg, #f8fafc, #64748b, #f1f5f9, #334155, #e2e8f0, #475569, #f8fafc)',
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
    preview: 'radial-gradient(circle at 50% 55%, #fff 0%, #fde047 18%, #f97316 38%, #b91c1c 58%, #1e1b4b 78%, #020617 100%)',
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
    preview: `${turbulence(0.9, 4, 0.5)}, #d6d3d1`,
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
    preview: `${turbulence(0.045, 5, 0.55)}, #faf9f7`,
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
    preview: 'radial-gradient(#111 22%, transparent 24%) 0 0 / 7px 7px, #fff',
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
    preview: 'repeating-conic-gradient(#111 0% 25%, #fff 0% 50%) 0 0 / 6px 6px',
    style: {
      backgroundImage: 'repeating-conic-gradient(#111111 0% 25%, #ffffff 0% 50%)',
      backgroundSize: '6px 6px',
    },
  },
  {
    name: 'fluted_glass',
    label: 'Fluted Glass',
    group: 'Glass',
    preview: 'repeating-linear-gradient(90deg, rgba(255,255,255,.65) 0 4px, rgba(255,255,255,.12) 4px 10px), linear-gradient(120deg,#a5b4fc,#f0abfc)',
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
    preview: 'linear-gradient(140deg, rgba(255,255,255,.55), rgba(255,255,255,.18))',
    style: {
      backgroundImage:
        'linear-gradient(140deg, rgba(255,255,255,0.55), rgba(255,255,255,0.16))',
      backdropFilter: 'blur(16px) saturate(1.4)',
      border: '1px solid rgba(255,255,255,0.4)',
      boxShadow: '0 8px 32px -12px rgba(15,23,42,0.35)',
    },
  },
]

export const effectNames = EFFECTS.map(e => e.name)

export const effectOf = (name: string) => EFFECTS.find(e => e.name === name)

/** every property any effect sets, so removing one leaves nothing behind */
const OWNED = [...new Set(EFFECTS.flatMap(e => Object.keys(e.style)))]

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
