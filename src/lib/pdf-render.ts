import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, makeCanvas } from './canvas'
import { canvasToBmp } from './raster'
import { loadPdf } from './pdf-core'
import { pdfjsAssets } from './pdfjs-assets'
import type { OutputFile, ProgressFn } from './types'
import { stripExt, uniqueName } from './format'
import { blobFromBytes } from './blob'

export type CompressMode = 'balanced' | 'strong' | 'lossless'

export interface CompressOptions {
  mode: CompressMode
  dpi: number
  /** 0 – 1 JPEG quality */
  quality: number
}

export interface CompressResult {
  blob: Blob
  originalSize: number
  outputSize: number
  pageCount: number
  usedOriginal: boolean
}

interface RenderedPage {
  canvas: HTMLCanvasElement
  /** Page size in PDF points, before rasterisation. */
  pageWidth: number
  pageHeight: number
}

interface OpenedPdf {
  pdf: PDFDocumentProxy
  close: () => Promise<void>
}

async function openPdfDocument(
  bytes: Uint8Array,
  name: string,
): Promise<OpenedPdf> {
  const assets = pdfjsAssets()
  const task = getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: assets.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: assets.standardFontDataUrl,
  })

  try {
    const pdf = await task.promise
    return { pdf, close: () => task.destroy() }
  } catch (error) {
    await task.destroy().catch(() => undefined)
    const kind = (error as { name?: string })?.name
    if (kind === 'PasswordException') {
      throw new Error(
        `'${name}'은(는) 비밀번호로 보호된 PDF입니다. 비밀번호를 해제한 뒤 다시 시도해 주세요.`,
      )
    }
    throw new Error(
      `'${name}'을(를) PDF로 열지 못했습니다. 파일이 손상되었거나 PDF가 아닐 수 있습니다.`,
    )
  }
}

async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  maxEdge = 0,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const ratio = dpi / 72
    // Scale from the longest edge so `maxEdge` is respected exactly; deriving
    // the scale from a rounded width can push the other edge one pixel over.
    const longest = Math.max(base.width, base.height) * ratio
    const scale =
      maxEdge > 0 && longest > maxEdge ? (maxEdge / longest) * ratio : ratio
    const viewport = page.getViewport({ scale })
    const { canvas, ctx } = makeCanvas(viewport.width, viewport.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({
      canvas,
      viewport,
    } as unknown as Parameters<typeof page.render>[0]).promise
    return { canvas, pageWidth: base.width, pageHeight: base.height }
  } finally {
    page.cleanup()
  }
}

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0))

export async function compressPdf(
  file: File,
  options: CompressOptions,
  onProgress?: ProgressFn,
): Promise<CompressResult> {
  const originalSize = file.size

  if (options.mode === 'lossless') {
    onProgress?.({ percent: 20, label: 'PDF 구조를 정리하는 중…' })
    const doc = await loadPdf(file)
    const pageCount = doc.getPageCount()
    const bytes = await doc.save({ useObjectStreams: true })
    const blob = blobFromBytes(bytes, 'application/pdf')
    const usedOriginal = blob.size >= originalSize
    onProgress?.({ percent: 100, label: '완료' })
    return {
      blob: usedOriginal
        ? new Blob([await file.arrayBuffer()], { type: 'application/pdf' })
        : blob,
      originalSize,
      outputSize: usedOriginal ? originalSize : blob.size,
      pageCount,
      usedOriginal,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { pdf, close } = await openPdfDocument(bytes, file.name)
  const output = await PDFDocument.create()
  output.setProducer('Dtools')
  output.setCreator('Dtools')

  try {
    const pageCount = pdf.numPages
    for (let n = 1; n <= pageCount; n++) {
      onProgress?.({
        percent: ((n - 1) / pageCount) * 95,
        label: `${n} / ${pageCount} 페이지 변환 중…`,
      })

      const rendered = await renderPage(pdf, n, options.dpi)
      let jpeg: Blob
      try {
        jpeg = await canvasToBlob(rendered.canvas, 'image/jpeg', options.quality)
      } finally {
        rendered.canvas.width = 0
        rendered.canvas.height = 0
      }

      const image = await output.embedJpg(await jpeg.arrayBuffer())
      const page = output.addPage([rendered.pageWidth, rendered.pageHeight])
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: rendered.pageWidth,
        height: rendered.pageHeight,
      })

      await yieldToBrowser()
    }

    onProgress?.({ percent: 97, label: 'PDF 저장 중…' })
    const saved = await output.save({ useObjectStreams: true })
    const blob = blobFromBytes(saved, 'application/pdf')
    const usedOriginal = blob.size >= originalSize
    onProgress?.({ percent: 100, label: '완료' })

    return {
      blob: usedOriginal
        ? new Blob([bytes], { type: 'application/pdf' })
        : blob,
      originalSize,
      outputSize: usedOriginal ? originalSize : blob.size,
      pageCount,
      usedOriginal,
    }
  } finally {
    await close()
  }
}

export interface PdfToImageOptions {
  target: 'jpg' | 'png' | 'webp' | 'bmp'
  dpi: number
  quality: number
  maxEdge: number
}

export async function pdfToImages(
  file: File,
  options: PdfToImageOptions,
  onProgress?: ProgressFn,
): Promise<OutputFile[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { pdf, close } = await openPdfDocument(bytes, file.name)
  const base = stripExt(file.name)
  const used = new Set<string>()
  const outputs: OutputFile[] = []
  const mime =
    options.target === 'jpg'
      ? 'image/jpeg'
      : options.target === 'png'
        ? 'image/png'
        : options.target === 'webp'
          ? 'image/webp'
          : null

  try {
    const pageCount = pdf.numPages
    for (let n = 1; n <= pageCount; n++) {
      onProgress?.({
        percent: ((n - 1) / pageCount) * 95,
        label: `${n} / ${pageCount} 페이지 변환 중…`,
      })
      const rendered = await renderPage(pdf, n, options.dpi, options.maxEdge)
      try {
        const blob = mime
          ? await canvasToBlob(
              rendered.canvas,
              mime,
              options.target === 'jpg' || options.target === 'webp'
                ? options.quality
                : undefined,
            )
          : canvasToBmp(rendered.canvas)

        if (mime && blob.type !== mime) {
          throw new Error('이 브라우저는 선택한 형식으로 저장할 수 없습니다.')
        }

        outputs.push({
          name: uniqueName(
            `${base}_p${String(n).padStart(String(pageCount).length, '0')}.${options.target}`,
            used,
          ),
          blob,
          note: `${rendered.canvas.width}×${rendered.canvas.height}`,
        })
      } finally {
        rendered.canvas.width = 0
        rendered.canvas.height = 0
      }
      await yieldToBrowser()
    }
  } finally {
    await close()
  }

  onProgress?.({ percent: 100, label: '완료' })
  return outputs
}

export interface PdfToTextOptions {
  /** Prefix each page with a `===== n / total =====` marker. */
  pageSeparator: boolean
}

export async function pdfToText(
  file: File,
  options: PdfToTextOptions,
  onProgress?: ProgressFn,
): Promise<OutputFile[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { pdf, close } = await openPdfDocument(bytes, file.name)
  const pageCount = pdf.numPages
  const pages: string[] = []

  try {
    for (let n = 1; n <= pageCount; n++) {
      onProgress?.({
        percent: ((n - 1) / pageCount) * 95,
        label: `${n} / ${pageCount} 페이지 텍스트 추출 중…`,
      })
      const page = await pdf.getPage(n)
      try {
        const content = await page.getTextContent()
        let text = ''
        for (const item of content.items) {
          if (!('str' in item) || !item.str) continue
          text += item.str
          text += item.hasEOL ? '\n' : ' '
        }
        const cleaned = text
          .replace(/[ \t]+/g, ' ')
          .replace(/ *\n */g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        pages.push(cleaned)
      } finally {
        page.cleanup()
      }
      await yieldToBrowser()
    }
  } finally {
    await close()
  }

  const body = pages
    .map((text, index) =>
      options.pageSeparator
        ? `===== ${index + 1} / ${pageCount} 페이지 =====\n${text}`
        : text,
    )
    .join('\n\n')
    .trim()

  if (!body) {
    throw new Error(
      '이 PDF에서 텍스트를 찾지 못했습니다. 스캔한 이미지 PDF는 텍스트로 바꿀 수 없습니다.',
    )
  }

  onProgress?.({ percent: 100, label: '완료' })
  return [
    {
      name: `${stripExt(file.name)}.txt`,
      blob: new Blob([`${body}\n`], {
        type: 'text/plain;charset=utf-8',
      }),
      note: `${pageCount}페이지 · TXT`,
    },
  ]
}
