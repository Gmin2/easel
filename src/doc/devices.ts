/**
 * Artboard sizes. Real viewport widths rather than round numbers, because a
 * layout that only works at 1200 is not a layout that works.
 */
export interface Device {
  name: string
  w: number
  h: number
}

export const DEVICES: Device[] = [
  { name: 'Desktop', w: 1280, h: 832 },
  { name: 'Laptop', w: 1440, h: 900 },
  { name: 'Tablet', w: 834, h: 1112 },
  { name: 'Phone', w: 390, h: 844 },
]

export const deviceNamed = (name: string) =>
  DEVICES.find(d => d.name.toLowerCase() === name.toLowerCase())
