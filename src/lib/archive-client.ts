import type {
  ArchiveRequest,
  ArchiveResponse,
  ArchiveLevel,
  ArchiveFormat,
  ExtractedEntry,
  WorkerFile,
} from './archive-types'
import type { PickedFile, ProgressFn } from './types'
import { errorMessage } from './types'

interface PendingJob {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onProgress?: ProgressFn
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, PendingJob>()

function ensureWorker(): Worker {
  if (worker) return worker
  const instance = new Worker(new URL('../workers/archive.worker.ts', import.meta.url), {
    type: 'module',
  })

  instance.addEventListener('message', (event: MessageEvent<ArchiveResponse>) => {
    const message = event.data
    const job = pending.get(message.id)
    if (!job) return

    if (message.type === 'progress') {
      job.onProgress?.({ percent: message.percent, label: message.label })
      return
    }

    pending.delete(message.id)
    if (message.type === 'created') {
      job.resolve(message.blob)
    } else if (message.type === 'extracted') {
      job.resolve({ entries: message.entries, directories: message.directories })
    } else {
      const error = new Error(message.message) as Error & { code?: string }
      error.code = message.code
      job.reject(error)
    }
  })

  instance.addEventListener('error', (event) => {
    const message = event.message || '압축 처리기를 불러오지 못했습니다.'
    failAll(new Error(message))
    instance.terminate()
    if (worker === instance) worker = null
  })

  instance.addEventListener('messageerror', () => {
    failAll(new Error('압축 처리 결과를 읽지 못했습니다.'))
  })

  worker = instance
  return instance
}

function failAll(error: Error) {
  for (const job of pending.values()) job.reject(error)
  pending.clear()
}

function run<T>(request: ArchiveRequest, onProgress?: ProgressFn): Promise<T> {
  const instance = ensureWorker()
  return new Promise<T>((resolve, reject) => {
    pending.set(request.id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      onProgress,
    })
    try {
      instance.postMessage(request)
    } catch (error) {
      pending.delete(request.id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export interface CreateArchiveOptions {
  format: ArchiveFormat
  level: ArchiveLevel
  password?: string
  zipCrypto?: boolean
  headerEncryption?: boolean
}

export async function createArchive(
  files: PickedFile[],
  emptyDirectories: string[],
  options: CreateArchiveOptions,
  onProgress?: ProgressFn,
): Promise<Blob> {
  const entries: WorkerFile[] = files.map((item) => ({
    path: item.path,
    file: item.file,
  }))

  return run<Blob>(
    {
      id: nextId++,
      op: 'create',
      format: options.format,
      entries,
      directories: emptyDirectories,
      password: options.password || undefined,
      zipCrypto: options.zipCrypto,
      level: options.level,
      headerEncryption: options.headerEncryption,
    },
    onProgress,
  )
}

export interface ExtractOptions {
  password?: string
  filenameEncoding?: string
}

export async function extractArchive(
  file: File,
  options: ExtractOptions,
  onProgress?: ProgressFn,
): Promise<{ entries: ExtractedEntry[]; directories: string[] }> {
  return run(
    {
      id: nextId++,
      op: 'extract',
      file,
      password: options.password || undefined,
      filenameEncoding: options.filenameEncoding || undefined,
    },
    onProgress,
  )
}

/** Terminates the worker; the next job starts from a clean instance. */
export function cancelArchiveJobs() {
  const error = new DOMException('작업을 취소했습니다.', 'AbortError')
  failAll(error as unknown as Error)
  if (worker) {
    worker.terminate()
    worker = null
  }
}

export function archiveErrorMessage(error: unknown): string {
  return errorMessage(error)
}
