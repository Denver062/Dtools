import { canvasToBlob, makeCanvas } from './canvas'

/** Encodes a canvas as an uncompressed 24-bit BMP (alpha flatten on white). */
export function canvasToBmp(canvas: HTMLCanvasElement): Blob {
  const { width, height } = canvas
  if (!width || !height) throw new Error('이미지를 BMP로 저장할 수 없습니다.')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서 이미지를 처리할 수 없습니다.')

  const rowSize = ((width * 3 + 3) & ~3)
  const pixelSize = rowSize * height
  const buffer = new ArrayBuffer(54 + pixelSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint8(0, 0x42) // 'B'
  view.setUint8(1, 0x4d) // 'M'
  view.setUint32(2, 54 + pixelSize, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(34, pixelSize, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)

  const pixels = ctx.getImageData(0, 0, width, height).data
  for (let y = 0; y < height; y++) {
    const sourceRow = (height - 1 - y) * width * 4
    let target = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      const i = sourceRow + x * 4
      const alpha = pixels[i + 3] / 255
      // Composite over white, then store BGR.
      bytes[target++] = Math.round(pixels[i + 2] * alpha + 255 * (1 - alpha))
      bytes[target++] = Math.round(pixels[i + 1] * alpha + 255 * (1 - alpha))
      bytes[target++] = Math.round(pixels[i] * alpha + 255 * (1 - alpha))
    }
  }

  return new Blob([buffer], { type: 'image/bmp' })
}

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

/** Builds a multi-resolution Windows icon (PNG-compressed entries). */
export async function canvasToIco(canvas: HTMLCanvasElement): Promise<Blob> {
  if (!canvas.width || !canvas.height) {
    throw new Error('이미지를 ICO로 저장할 수 없습니다.')
  }

  const entries: { size: number; data: Uint8Array }[] = []
  for (const size of ICO_SIZES) {
    const { canvas: icon, ctx } = makeCanvas(size, size)
    try {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const scale = Math.min(size / canvas.width, size / canvas.height)
      const drawWidth = Math.max(1, Math.round(canvas.width * scale))
      const drawHeight = Math.max(1, Math.round(canvas.height * scale))
      const x = Math.round((size - drawWidth) / 2)
      const y = Math.round((size - drawHeight) / 2)
      ctx.drawImage(canvas, x, y, drawWidth, drawHeight)
      const png = await canvasToBlob(icon, 'image/png')
      entries.push({ size, data: new Uint8Array(await png.arrayBuffer()) })
    } finally {
      icon.width = 0
      icon.height = 0
    }
  }

  const headerSize = 6 + entries.length * 16
  const totalSize = entries.reduce((sum, entry) => sum + entry.data.length, headerSize)
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, entries.length, true)

  let offset = headerSize
  entries.forEach((entry, index) => {
    const at = 6 + index * 16
    view.setUint8(at, entry.size >= 256 ? 0 : entry.size)
    view.setUint8(at + 1, entry.size >= 256 ? 0 : entry.size)
    view.setUint8(at + 2, 0)
    view.setUint8(at + 3, 0)
    view.setUint16(at + 4, 1, true)
    view.setUint16(at + 6, 32, true)
    view.setUint32(at + 8, entry.data.length, true)
    view.setUint32(at + 12, offset, true)
    bytes.set(entry.data, offset)
    offset += entry.data.length
  })

  return new Blob([buffer], { type: 'image/x-icon' })
}
