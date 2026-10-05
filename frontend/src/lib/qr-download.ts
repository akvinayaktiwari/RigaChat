import { qrSvgMarkup, type QrLayout } from './qr-code'

/**
 * Turns a laid-out QR code into a file the browser saves. Browser-only: it
 * needs a canvas and a document, and nothing here touches the network.
 */

/** Whole pixels per square, so every edge lands on a pixel boundary and stays sharp. */
function pixelsPerSquare(layout: QrLayout, size: number): number {
  return Math.max(1, Math.round(size / layout.width))
}

function drawQr(context: CanvasRenderingContext2D, layout: QrLayout, scale: number): void {
  context.fillStyle = layout.background
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
  context.fillStyle = layout.foreground
  for (const run of layout.runs) {
    context.fillRect((run.x + layout.offset) * scale, (run.y + layout.offset) * scale, run.length * scale, scale)
  }
  if (!layout.credit) return
  context.font = `${layout.credit.fontSize * scale}px Arial, Helvetica, sans-serif`
  context.textAlign = 'center'
  context.fillText(layout.credit.text, layout.credit.x * scale, layout.credit.y * scale)
}

export function qrPngBlob(layout: QrLayout, size: number): Promise<Blob> {
  const scale = pixelsPerSquare(layout, size)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(layout.width * scale)
  canvas.height = Math.round(layout.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('This browser cannot draw the image. Download the SVG instead.'))
  drawQr(context, layout, scale)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser did not produce an image.'))), 'image/png')
  })
}

export function qrSvgBlob(layout: QrLayout, size: number): Blob {
  return new Blob([qrSvgMarkup(layout, size)], { type: 'image/svg+xml' })
}

/** Saves a file through a temporary link, then frees the memory behind it. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
