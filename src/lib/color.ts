// colour maths for the picker. it shows three readouts at once — oklch, hsl
// and rgb — so all three conversions live here and every one round-trips
// through plain sRGB bytes.

export interface RGB { r: number; g: number; b: number }
export interface HSV { h: number; s: number; v: number }

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')

export function rgbToHex({ r, g, b }: RGB): string {
  return (hex2(r) + hex2(g) + hex2(b)).toUpperCase()
}

export function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const seg = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg < 0 ? seg + 6 : seg]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** h in degrees, s and l as percentages, matching the readout the picker shows */
export function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  let h = 0, s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s * 100, l * 100]
}

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

/** oklch, the row labelled L C H */
export function rgbToOklch({ r, g, b }: RGB): [number, number, number] {
  const R = srgbToLinear(r / 255), G = srgbToLinear(g / 255), B = srgbToLinear(b / 255)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  const C = Math.sqrt(A * A + Bb * Bb)
  let H = (Math.atan2(Bb, A) * 180) / Math.PI
  if (H < 0) H += 360
  return [L * 100, C, H]
}

export const cssRgb = ({ r, g, b }: RGB, a = 1) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`

/** inverse of rgbToHsl; h in degrees, s and l as percentages */
export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const S = clamp(s / 100), L = clamp(l / 100)
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hh = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = L - c / 2
  const seg = Math.floor(hh / 60) % 6
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

/** inverse of rgbToOklch; L as a percentage, C absolute, H in degrees. out of
    gamut results are clipped rather than gamut-mapped, which is what a picker
    wants: the swatch stays reachable and the sliders stay predictable */
export function oklchToRgb([L, C, H]: [number, number, number]): RGB {
  const l_ = L / 100
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (l_ + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (l_ - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (l_ - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const R = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return {
    r: clamp(linearToSrgb(R)) * 255,
    g: clamp(linearToSrgb(G)) * 255,
    b: clamp(linearToSrgb(B)) * 255,
  }
}
