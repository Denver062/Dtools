/** Message types shared by the archive worker and its client. */

export type ArchiveFormat = 'zip' | '7z'
export type ArchiveLevel = 0 | 1 | 5 | 9

export interface WorkerFile {
  path: string
  file: File
}

export interface CreateArchiveRequest {
  id: number
  op: 'create'
  format: ArchiveFormat
  entries: WorkerFile[]
  /** Empty folders to preserve, as relative forward-slash paths. */
  directories?: string[]
  password?: string
  zipCrypto?: boolean
  level: ArchiveLevel
  headerEncryption?: boolean
}

export interface ExtractArchiveRequest {
  id: number
  op: 'extract'
  file: File
  password?: string
  filenameEncoding?: string
}

export type ArchiveRequest = CreateArchiveRequest | ExtractArchiveRequest

export type ArchiveErrorCode =
  | 'AUTH'
  | 'UNSUPPORTED'
  | 'CORRUPT'
  | 'TOO_LARGE'
  | 'ABORTED'
  | 'UNKNOWN'

export interface ExtractedEntry {
  path: string
  blob: Blob
}

export type ArchiveResponse =
  | { id: number; type: 'progress'; percent: number | null; label: string }
  | { id: number; type: 'created'; blob: Blob }
  | {
      id: number
      type: 'extracted'
      entries: ExtractedEntry[]
      directories: string[]
    }
  | { id: number; type: 'error'; code: ArchiveErrorCode; message: string }
