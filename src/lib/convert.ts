import { PDFDocument } from 'pdf-lib'
import {
  canvasToBlob,
  decodeImage,
  fitDimensions,
  makeCanvas,
} from './canvas'
import { canvasToBmp, canvasToIco } from './raster'
import type { OutputFile, ProgressFn } from './types'
import { stripExt } from './format'
import { blobFromBytes } from './blob'

export type ConvertTarget = 'jpg' | 'png' | 'webp' | 'bmp' | 'ico' | 'pdf'

export type PdfPageSize = 'auto' | 'a4' | 'letter'
export type PdfOrientation = 'auto' | 'portrait' | 'landscape'

export interface PdfLayoutOptions {
  pageSize: PdfPageSize
  orientation: PdfOrientation
  /** Page margin in PDF points (1/72 inch). */
  margin: number
}

export interface ImageConvertOptions {
  target: ConvertTarget
  /** 0 – 1 */
  quality: number
  /** Longest edge in px, or 0 to keep the original size. */
  maxEdge: number
  /** PDF output only. */
  pdf?: PdfLayoutOptions
}

const MIME: Partial<Record<ConvertTarget, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const PAGE_SIZES: Record<Exclude<PdfPageSize, 'auto'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
}

export const TARGET_LABEL: Record<ConvertTarget, string> = {
  jpg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  bmp: 'BMP',
  ico: 'ICO',
  pdf: 'PDF',
}

export function formatPdfLayout(pdf: PdfLayoutOptions): string {
  if (pdf.pageSize === 'auto') {
    return pdf.margin > 0 ? `원본 크기 · 여백 ${pdf.margin}pt` : '원본 크기'
  }
  const orientation =
    pdf.orientation === 'auto'
      ? '자동 방향'
      : pdf.orientation === 'portrait'
        ? '세로'
        : '가로'
  return `${pdf.pageSize.toUpperCase()} · ${orientation}`
}

export interface ConvertResult {
  outputs: OutputFile[]
  failures: { name: string; message: string }[]
}

function outputName(name: string, target: ConvertTarget): string {
  return `${stripExt(name)}.${target}`
}

export async function convertImages(
  files: File[],
  options: ImageConvertOptions,
  onProgress?: ProgressFn,
): Promise<ConvertResult> {
  if (!files.length) return { outputs: [], failures: [] }

  if (options.target === 'pdf') {
    const layout: PdfLayoutOptions = options.pdf ?? {
      pageSize: 'auto',
      orientation: 'auto',
      margin: 0,
    }
    const margin = Math.max(0, layout.margin)
    const doc = await PDFDocument.create()
    doc.setProducer('Dtools')
    doc.setCreator('Dtools')
    let imageCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      onProgress?.({
        percent: (i / files.length) * 100,
        label: `PDF로 묶는 중 · ${file.name}`,
      })

      const decoded = await decodeImage(file)
      try {
        const size = fitDimensions(
          decoded.width,
          decoded.height,
          options.maxEdge,
        )
        const { canvas, ctx } = makeCanvas(size.width, size.height)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size.width, size.height)
        ctx.drawImage(decoded.source, 0, 0, size.width, size.height)
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', options.quality)
        canvas.width = 0
        canvas.height = 0

        const embedded = await doc.embedJpg(await jpeg.arrayBuffer())

        if (layout.pageSize === 'auto') {
          const imageWidth = (size.width * 72) / 96
          const imageHeight = (size.height * 72) / 96
          const page = doc.addPage([
            imageWidth + margin * 2,
            imageHeight + margin * 2,
          ])
          page.drawImage(embedded, {
            x: margin,
            y: margin,
            width: imageWidth,
            height: imageHeight,
          })
        } else {
          let [pageWidth, pageHeight] = PAGE_SIZES[layout.pageSize]
          const landscape =
            layout.orientation === 'landscape' ||
            (layout.orientation === 'auto' && size.width > size.height)
          if (landscape) {
            ;[pageWidth, pageHeight] = [pageHeight, pageWidth]
          }
          const boxWidth = Math.max(1, pageWidth - margin * 2)
          const boxHeight = Math.max(1, pageHeight - margin * 2)
          const scale = Math.min(
            boxWidth / size.width,
            boxHeight / size.height,
          )
          const drawWidth = size.width * scale
          const drawHeight = size.height * scale
          const page = doc.addPage([pageWidth, pageHeight])
          page.drawImage(embedded, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
          })
        }
        imageCount++
      } finally {
        decoded.release()
      }
    }

    if (!imageCount) throw new Error('변환할 이미지가 없습니다.')
    onProgress?.({ percent: 96, label: 'PDF 저장 중…' })
    const bytes = await doc.save({ useObjectStreams: true })
    const name = `${stripExt(files[0].name)}${
      files.length > 1 ? `-${files.length}장` : ''
    }.pdf`
    onProgress?.({ percent: 100, label: '완료' })
    return {
      outputs: [
        {
          name,
          blob: blobFromBytes(bytes, 'application/pdf'),
          note: `이미지 ${imageCount}장 · ${formatPdfLayout(layout)}`,
        },
      ],
      failures: [],
    }
  }

  const outputs: OutputFile[] = []
  const failures: { name: string; message: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.({
      percent: (i / files.length) * 100,
      label: `변환 중 · ${file.name}`,
    })
    try {
      const decoded = await decodeImage(file)
      try {
        const size = fitDimensions(
          decoded.width,
          decoded.height,
          options.maxEdge,
        )
        const { canvas, ctx } = makeCanvas(size.width, size.height)
        if (options.target === 'jpg') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, size.width, size.height)
        }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(decoded.source, 0, 0, size.width, size.height)

        let blob: Blob
        let note = `${size.width}×${size.height}`

        if (options.target === 'bmp') {
          blob = canvasToBmp(canvas)
        } else if (options.target === 'ico') {
          blob = await canvasToIco(canvas)
          note = '16–256px 아이콘'
        } else {
          const mime = MIME[options.target]
          if (!mime) throw new Error('지원하지 않는 출력 형식입니다.')
          blob = await canvasToBlob(canvas, mime, options.quality)
          if (blob.type !== mime) {
            throw new Error('이 브라우저는 선택한 형식으로 저장할 수 없습니다.')
          }
        }

        canvas.width = 0
        canvas.height = 0
        outputs.push({
          name: outputName(file.name, options.target),
          blob,
          note,
        })
      } finally {
        decoded.release()
      }
    } catch (error) {
      failures.push({
        name: file.name,
        message:
          error instanceof Error
            ? error.message
            : '이미지를 변환하지 못했습니다.',
      })
    }
  }

  onProgress?.({ percent: 100, label: '완료' })
  return { outputs, failures }
}
