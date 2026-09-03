import { toBlob } from 'html-to-image'

/**
 * Render a node to a PNG, from the node itself.
 *
 * There is no separate rasteriser here because there is nothing to rasterise:
 * the design already is DOM, so the export is the browser drawing the same
 * elements it is drawing on screen. The clone is measured from `offsetWidth`,
 * which is the node's own css size, so the canvas zoom does not leak into the
 * image.
 */
export async function nodePng(id: string, scale = 2): Promise<Blob> {
  const el = document.querySelector<HTMLElement>(`[data-easel="${id}"]`)
  if (!el) throw new Error(`"${id}" is not on screen, so there is nothing to render.`)
  const blob = await toBlob(el, {
    pixelRatio: scale,
    // the wall shows through anything transparent otherwise
    backgroundColor: undefined,
    // selection chrome lives in an svg overlay, not in the nodes, so there is
    // nothing to filter out here beyond our own measuring attributes
    filter: node => !(node instanceof HTMLElement && node.dataset.easelChrome != null),
  })
  if (!blob) throw new Error('The browser returned an empty image.')
  return blob
}

/**
 * Put a PNG on the clipboard.
 *
 * Safari and Firefox reject `ClipboardItem` with an async blob, so the blob is
 * resolved first and written as a plain item.
 */
export async function copyPng(id: string, scale = 2): Promise<{ w: number; h: number }> {
  const blob = await nodePng(id, scale)
  const bitmap = await createImageBitmap(blob)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  return { w: bitmap.width, h: bitmap.height }
}

export async function downloadPng(id: string, name: string, scale = 2): Promise<void> {
  const blob = await nodePng(id, scale)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^\w.-]+/g, '-')}.png`
  a.click()
  URL.revokeObjectURL(url)
}
