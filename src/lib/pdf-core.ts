import { PDFDocument } from 'pdf-lib'
import type { OutputFile, ProgressFn } from './types'
import { uniqueName } from './format'
import { blobFromBytes } from './blob'

export function friendlyPdfError(error: unknown, name: string): Error {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/encrypt|password/i.test(message)) {
    return new Error(
      `'${name}'은(는) 비밀번호로 보호된 PDF입니다. 비밀번호를 해제한 뒤 다시 시도해 주세요.`,
    )
  }
  if (/no pdf header|failed to parse|invalid pdf|expected instance of pdf/i.test(message)) {
    return new Error(
      `'${name}'을(를) PDF로 읽을 수 없습니다. 파일이 손상되었거나 PDF가 아닐 수 있습니다.`,
    )
  }
  return new Error(
    `'${name}'을(를) 처리하지 못했습니다.${
      message ? ` (${message})` : ''
    }`,
  )
}

export async function loadPdfBytes(
  bytes: Uint8Array,
  name: string,
): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    })
  } catch (error) {
    throw friendlyPdfError(error, name)
  }
}

export async function loadPdf(file: File): Promise<PDFDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return loadPdfBytes(bytes, file.name)
}

export interface PdfInfo {
  pages: number
  title?: string
}

export async function readPdfInfo(file: File): Promise<PdfInfo> {
  const doc = await loadPdf(file)
  return { pages: doc.getPageCount(), title: doc.getTitle() || undefined }
}

export async function mergePdfs(
  files: File[],
  onProgress?: ProgressFn,
): Promise<Blob> {
  const output = await PDFDocument.create()
  output.setProducer('Dtools')
  output.setCreator('Dtools')

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.({
      percent: (i / files.length) * 90,
      label: `합치는 중 · ${file.name}`,
    })
    const source = await loadPdf(file)
    const pages = await output.copyPages(source, source.getPageIndices())
    for (const page of pages) output.addPage(page)
  }

  onProgress?.({ percent: 95, label: 'PDF 저장 중…' })
  const bytes = await output.save({ useObjectStreams: true })
  onProgress?.({ percent: 100, label: '완료' })
  return blobFromBytes(bytes, 'application/pdf')
}

export interface SplitGroup {
  pages: number[]
  label: string
}

export async function splitPdf(
  file: File,
  groups: SplitGroup[],
  baseName: string,
  onProgress?: ProgressFn,
): Promise<OutputFile[]> {
  const source = await loadPdf(file)
  const outputs: OutputFile[] = []
  const used = new Set<string>()

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    onProgress?.({
      percent: (i / groups.length) * 95,
      label: `나누는 중 · ${group.label}`,
    })
    const doc = await PDFDocument.create()
    doc.setProducer('Dtools')
    doc.setCreator('Dtools')
    const pages = await doc.copyPages(source, group.pages)
    for (const page of pages) doc.addPage(page)
    const bytes = await doc.save({ useObjectStreams: true })
    const name = uniqueName(`${baseName}_${group.label}.pdf`, used)
    outputs.push({
      name,
      blob: blobFromBytes(bytes, 'application/pdf'),
      note: `${group.pages.length}페이지`,
    })
  }

  onProgress?.({ percent: 100, label: '완료' })
  return outputs
}
