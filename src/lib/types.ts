import type { ArchiveFormat, ArchiveLevel } from './archive-types'

export interface PickedFile {
  file: File
  /** Relative path inside the archive, always with forward slashes. */
  path: string
}

export interface OutputFile {
  name: string
  blob: Blob
  /** Optional relative path used when bundling results into a ZIP. */
  path?: string
  /** Optional short description shown under the filename. */
  note?: string
  thumbnail?: string
}

export interface ProgressState {
  percent: number | null
  label: string
}

export type ProgressFn = (state: ProgressState) => void

export interface CreateArchiveOptions {
  format: ArchiveFormat
  name: string
  level: ArchiveLevel
  password: string
  /** zip only: legacy ZipCrypto instead of AES-256. */
  zipCrypto: boolean
  /** 7z only: encrypt the file listing too. */
  headerEncryption: boolean
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  )
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  return '알 수 없는 오류가 발생했습니다.'
}
