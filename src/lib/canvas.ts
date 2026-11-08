export interface Drawable {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/** Chrome/Safari start refusing huge canvases; stay well below that. */
const MAX_PIXELS = 200_000_000
const MAX_EDGE = 16_384

export function makeCanvas(width: number, height: number): Drawable {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  if (w > MAX_EDGE || h > MAX_EDGE || w * h > MAX_PIXELS) {
    throw new Error(
      `이미지가 너무 큽니다(${w}×${h}). 크기 제한을 설정해 다시 시도해 주세요.`,
    )
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('이 브라우저에서 이미지를 처리할 수 없습니다.')
  return { canvas, ctx }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              '이 브라우저에서는 해당 형식으로 저장할 수 없습니다. 다른 형식을 선택해 주세요.',
            ),
          )
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  const isSvg =
    file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')

  if (!isSvg) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      /* fall through to <img>, which handles a few extra formats */
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(
      '이미지를 읽을 수 없습니다. 지원하지 않는 형식이거나 파일이 손상되었습니다.',
    )
  }
  return {
    source: image,
    width: image.naturalWidth || 1024,
    height: image.naturalHeight || 1024,
    release: () => URL.revokeObjectURL(url),
  }
}

export function fitDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (!maxEdge || (width <= maxEdge && height <= maxEdge)) {
    return { width, height }
  }
  const scale = maxEdge / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export interface EncodeSupport {
  webp: boolean
}

let supportPromise: Promise<EncodeSupport> | null = null

export function detectEncodeSupport(): Promise<EncodeSupport> {
  if (!supportPromise) {
    supportPromise = (async () => {
      const { canvas } = makeCanvas(2, 2)
      const check = async (type: string) => {
        try {
          const blob = await canvasToBlob(canvas, type, 0.8)
          return blob.type === type
        } catch {
          return false
        }
      }
      return {
        webp: await check('image/webp'),
      }
    })()
  }
  return supportPromise
}
