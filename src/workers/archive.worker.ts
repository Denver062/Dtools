/// <reference lib="webworker" />

import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js'
import wasmUrl from '7z-wasm/7zz.wasm?url'
import type { SevenZipModule } from '7z-wasm'
import type {
  ArchiveErrorCode,
  ArchiveRequest,
  ArchiveResponse,
  CreateArchiveRequest,
  ExtractedEntry,
  ExtractArchiveRequest,
} from '../lib/archive-types'
import { sanitizeArchivePath } from '../lib/format'
import { blobFromBytes } from '../lib/blob'

// The archive work already runs inside a worker. Spawning zip.js codec workers
// on top of that is unnecessary (and breaks under some bundlers).
configure({ useWebWorkers: false })

const ctx = self as unknown as DedicatedWorkerGlobalScope

function post(message: ArchiveResponse) {
  ctx.postMessage(message)
}

class ArchiveError extends Error {
  code: ArchiveErrorCode
  constructor(code: ArchiveErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function progress(id: number, percent: number | null, label: string) {
  post({ id, type: 'progress', percent, label })
}

/* ------------------------------------------------------------------ *
 * ZIP
 * ------------------------------------------------------------------ */

async function createZip(req: CreateArchiveRequest) {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    password: req.password || undefined,
    zipCrypto: req.password ? req.zipCrypto === true : undefined,
    encryptionStrength: 3,
    level: req.level,
  })

  try {
    for (const dir of req.directories ?? []) {
      await zipWriter.add(dir.replace(/\/?$/, '/'), null, { directory: true })
    }

    let done = 0
    const total = req.entries.length || 1
    for (const entry of req.entries) {
      const path = sanitizeArchivePath(entry.path) || entry.file.name
      await zipWriter.add(path, new BlobReader(entry.file), {
        level: req.level,
        onprogress: (loaded, size) => {
          const fraction = size ? loaded / size : 0
          progress(
            req.id,
            Math.min(99, ((done + fraction) / total) * 100),
            `압축 중 · ${path}`,
          )
        },
      })
      done++
      progress(req.id, Math.min(99, (done / total) * 100), `압축 중 · ${done}/${total}`)
    }

    const blob = await zipWriter.close()
    return blob
  } catch (error) {
    try {
      await zipWriter.close()
    } catch {
      /* ignore cleanup failure */
    }
    throw error
  }
}

async function extractZip(req: ExtractArchiveRequest): Promise<{
  entries: ExtractedEntry[]
  directories: string[]
}> {
  const reader = new ZipReader(new BlobReader(req.file), {
    password: req.password || undefined,
    filenameEncoding: req.filenameEncoding || undefined,
  })

  const entries: ExtractedEntry[] = []
  const directories: string[] = []

  try {
    const list = await reader.getEntries()
    let index = 0
    for (const entry of list) {
      const path = sanitizeArchivePath(entry.filename)
      if (entry.directory) {
        if (path) directories.push(path)
        continue
      }
      if (!path) continue
      if (entry.encrypted && !req.password) {
        throw new ArchiveError(
          'AUTH',
          '비밀번호가 필요한 압축 파일입니다. 비밀번호를 입력해 주세요.',
        )
      }
      const blob = await entry.getData(new BlobWriter(), {
        onprogress: (loaded, size) => {
          const fraction = size ? loaded / size : 0
          progress(
            req.id,
            Math.min(99, ((index + fraction) / Math.max(1, list.length)) * 100),
            `압축 푸는 중 · ${path}`,
          )
        },
      })
      entries.push({ path, blob })
      index++
      progress(
        req.id,
        Math.min(99, (index / Math.max(1, list.length)) * 100),
        `압축 푸는 중 · ${index}/${list.length}`,
      )
    }
  } finally {
    try {
      await reader.close()
    } catch {
      /* ignore */
    }
  }

  return { entries, directories }
}

/* ------------------------------------------------------------------ *
 * 7-Zip (WASM)
 * ------------------------------------------------------------------ */

let sevenZipPromise: Promise<SevenZipModule> | null = null
let logs: string[] = []

async function getSevenZip(): Promise<SevenZipModule> {
  if (!sevenZipPromise) {
    sevenZipPromise = (async () => {
      const { default: SevenZip } = await import('7z-wasm')
      return SevenZip({
        locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
        noExitRuntime: true,
        print: (line: string) => appendLog(line),
        printErr: (line: string) => appendLog(line),
        // Emscripten expects `null` for EOF; its type declaration is stricter
        // than the runtime contract.
        stdin: (() => null) as unknown as () => number,
      })
    })().catch((error) => {
      sevenZipPromise = null
      throw error
    })
  }
  return sevenZipPromise
}

function appendLog(line: string) {
  logs.push(line)
  if (logs.length > 400) logs.splice(0, logs.length - 400)
}

function runSevenZip(bin: SevenZipModule, args: string[]): number {
  logs = []
  let code = 0
  try {
    const callMain = bin.callMain as unknown as (argv: string[]) => number
    const result = callMain(args)
    code = typeof result === 'number' ? result : 0
  } catch (error) {
    // Emscripten throws ExitStatus for non-zero exits; callMain normally
    // returns the code, but keep this for safety.
    appendLog(error instanceof Error ? error.message : String(error))
    code = 1
  }
  if (code !== 0) {
    const errorLine = logs.find((line) => /^ERROR/i.test(line.trim()))
    if (errorLine) code = 1
  }
  return code
}

function classifySevenZipError(): ArchiveError {
  const text = logs.join('\n')
  if (/wrong password|encrypted archive|password|data error in encrypted/i.test(text)) {
    return new ArchiveError(
      'AUTH',
      '비밀번호가 올바르지 않거나, 비밀번호가 필요한 압축 파일입니다.',
    )
  }
  if (/unsupported method|not supported/i.test(text)) {
    return new ArchiveError('UNSUPPORTED', '이 압축 방식은 지원하지 않습니다.')
  }
  if (/can not open the file as archive|is not archive|unexpected end|headers error/i.test(text)) {
    return new ArchiveError(
      'CORRUPT',
      '압축 파일이 손상되었거나 올바른 압축 파일이 아닙니다.',
    )
  }
  const detail = logs
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(' ')
  return new ArchiveError(
    'UNKNOWN',
    detail ? `7-Zip 오류: ${detail}` : '7-Zip 처리 중 오류가 발생했습니다.',
  )
}

/** `FS.mkdirTree` exists at runtime but is missing from 7z-wasm's typings. */
function ensureDir(fs: SevenZipModule['FS'], path: string) {
  const parts = path.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    try {
      if (fs.isDir(fs.stat(current).mode)) continue
    } catch {
      /* directory does not exist yet */
    }
    try {
      fs.mkdir(current)
    } catch {
      /* already created */
    }
  }
}

function rmTree(fs: SevenZipModule['FS'], path: string) {
  let stat
  try {
    stat = fs.stat(path)
  } catch {
    return
  }
  if (fs.isDir(stat.mode)) {
    for (const name of fs.readdir(path)) {
      if (name === '.' || name === '..') continue
      rmTree(fs, `${path}/${name}`)
    }
    try {
      fs.rmdir(path)
    } catch {
      /* ignore */
    }
  } else {
    try {
      fs.unlink(path)
    } catch {
      /* ignore */
    }
  }
}

function listTop(fs: SevenZipModule['FS'], dir: string): string[] {
  return fs.readdir(dir).filter((name) => name !== '.' && name !== '..')
}

/** Detects a TAR left behind by decompressing .tar.gz / .tgz / .tar.bz2 etc. */
function looksLikeTar(fs: SevenZipModule['FS'], path: string): boolean {
  try {
    const stat = fs.stat(path)
    if (fs.isDir(stat.mode)) return false
    if (/\.tar$/i.test(path)) return true
    if (stat.size < 512) return false
    // Read only the TAR header instead of pulling the whole file into JS heap.
    const stream = fs.open(path, 'r')
    try {
      const header = new Uint8Array(512)
      fs.read(stream, header, 0, 512, 0)
      const marker = 'ustar'
      for (let i = 0; i < marker.length; i++) {
        if (header[257 + i] !== marker.charCodeAt(i)) return false
      }
      return true
    } finally {
      fs.close(stream)
    }
  } catch {
    return false
  }
}

async function create7z(req: CreateArchiveRequest) {
  const bin = await getSevenZip()
  const fs = bin.FS
  const root = `/dt-in-${req.id}-${Date.now()}`
  const archivePath = `/dt-out-${req.id}-${Date.now()}.7z`

  ensureDir(fs, root)
  const total = req.entries.reduce((sum, entry) => sum + entry.file.size, 0) || 1
  let written = 0

  try {
    for (const dir of req.directories ?? []) {
      const full = `${root}/${dir}`.replace(/\/+/g, '/')
      ensureDir(fs, full)
    }

    for (const entry of req.entries) {
      const rel = sanitizeArchivePath(entry.path) || entry.file.name
      const full = `${root}/${rel}`
      const parent = full.slice(0, full.lastIndexOf('/'))
      ensureDir(fs, parent)
      const bytes = new Uint8Array(await entry.file.arrayBuffer())
      fs.writeFile(full, bytes)
      written += entry.file.size
      const pct = (written / total) * 30
      progress(req.id, Math.min(30, pct), `파일 준비 중 · ${rel}`)
    }

    progress(req.id, null, '7Z로 압축하는 중…')

    fs.chdir(root)
    const args = [
      'a',
      archivePath,
      '-t7z',
      `-mx=${req.level}`,
      '-y',
      '-bd',
      '-bso0',
      '-bsp0',
    ]
    if (req.password) {
      args.push(`-p${req.password}`)
      if (req.headerEncryption) args.push('-mhe=on')
    }
    // A wildcard avoids 7-Zip switch parsing for file names starting with "-"
    // and preserves the whole relative folder tree.
    args.push('*')

    const code = runSevenZip(bin, args)
    if (code !== 0) throw classifySevenZipError()

    const data = fs.readFile(archivePath)
    if (!data || data.byteLength === 0) {
      throw new ArchiveError('UNKNOWN', '7Z 파일을 만들지 못했습니다.')
    }
    progress(req.id, 100, '완료')
    return blobFromBytes(data, 'application/x-7z-compressed')
  } finally {
    fs.chdir('/')
    rmTree(fs, root)
    try {
      fs.unlink(archivePath)
    } catch {
      /* ignore */
    }
  }
}

async function extractWith7z(req: ExtractArchiveRequest) {
  const bin = await getSevenZip()
  const fs = bin.FS
  const stamp = `${req.id}-${Date.now()}`
  const inDir = `/dt-in-${stamp}`
  // Keeping the original file name matters for single-stream formats: 7-Zip
  // derives `.gz`/`.bz2` output names from it.
  const archivePath = `${inDir}/${sanitizeArchivePath(req.file.name) || `archive.${guessExt(req.file.name)}`}`
  const outDir = `/dt-out-${stamp}`

  ensureDir(fs, inDir)
  const bytes = new Uint8Array(await req.file.arrayBuffer())
  fs.writeFile(archivePath, bytes)

  try {
    ensureDir(fs, outDir)
    progress(req.id, 20, '압축을 확인하는 중…')

    const args = [
      'x',
      archivePath,
      `-o${outDir}`,
      '-y',
      '-bd',
      '-bso0',
      '-bsp0',
      `-p${req.password ?? ''}`,
    ]
    const code = runSevenZip(bin, args)
    if (code !== 0) throw classifySevenZipError()

    // `.tar.gz`, `.tgz`, `.tar.bz2`… are two layers. The first pass leaves a
    // TAR file behind, so unpack it as well and keep only the final contents.
    const top = listTop(fs, outDir)
    if (top.length === 1) {
      const nested = `${outDir}/${top[0]}`
      if (looksLikeTar(fs, nested)) {
        progress(req.id, 55, 'TAR 내용을 푸는 중…')
        const nestedCode = runSevenZip(bin, [
          'x',
          nested,
          `-o${outDir}`,
          '-y',
          '-bd',
          '-bso0',
          '-bsp0',
          `-p${req.password ?? ''}`,
        ])
        if (nestedCode !== 0) throw classifySevenZipError()
        try {
          fs.unlink(nested)
        } catch {
          /* already gone */
        }
      }
    }

    const entries: ExtractedEntry[] = []
    const directories: string[] = []

    const walk = (dir: string, prefix: string) => {
      for (const name of fs.readdir(dir)) {
        if (name === '.' || name === '..') continue
        const full = `${dir}/${name}`
        const rel = prefix ? `${prefix}/${name}` : name
        const stat = fs.stat(full)
        if (fs.isDir(stat.mode)) {
          directories.push(rel)
          walk(full, rel)
        } else {
          const data = fs.readFile(full)
          const copy = new Uint8Array(data.byteLength)
          copy.set(data)
          entries.push({
            path: rel,
            blob: new Blob([copy]),
          })
        }
      }
    }
    walk(outDir, '')

    if (!entries.length && !directories.length) {
      throw new ArchiveError('UNKNOWN', '압축 파일에서 꺼낼 파일을 찾지 못했습니다.')
    }

    progress(req.id, 100, '완료')
    return { entries, directories }
  } finally {
    rmTree(fs, outDir)
    rmTree(fs, inDir)
  }
}

function guessExt(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : '7z'
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

ctx.onmessage = async (event: MessageEvent<ArchiveRequest>) => {
  const req = event.data
  try {
    if (req.op === 'create') {
      const blob =
        req.format === '7z' ? await create7z(req) : await createZip(req)
      post({ id: req.id, type: 'created', blob })
      return
    }

    const isZip = /\.zip$/i.test(req.file.name)
    let result
    if (isZip) {
      try {
        result = await extractZip(req)
      } catch (error) {
        if (
          error instanceof ArchiveError ||
          /password|encrypted/i.test(String((error as Error)?.message))
        ) {
          throw error
        }
        // Some ZIP variants (e.g. unusual methods) are handled better by 7-Zip.
        progress(req.id, 10, '다른 방식으로 다시 시도하는 중…')
        result = await extractWith7z(req)
      }
    } else {
      result = await extractWith7z(req)
    }

    post({
      id: req.id,
      type: 'extracted',
      entries: result.entries,
      directories: result.directories,
    })
  } catch (error) {
    const archiveError =
      error instanceof ArchiveError
        ? error
        : new ArchiveError('UNKNOWN', describeError(error))
    post({
      id: req.id,
      type: 'error',
      code: archiveError.code,
      message: archiveError.message,
    })
  }
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? '알 수 없는 오류')
  if (/password/i.test(message)) {
    return '비밀번호가 올바르지 않거나, 비밀번호가 필요한 압축 파일입니다.'
  }
  if (/out of memory|allocation|Array buffer allocation/i.test(message)) {
    return '파일이 너무 커서 브라우저 메모리가 부족합니다. 더 작은 단위로 나눠 주세요.'
  }
  if (/unsupported|invalid|corrupt|end of data|data error/i.test(message)) {
    return '압축 파일을 읽지 못했습니다. 손상되었거나 지원하지 않는 형식일 수 있습니다.'
  }
  return message
}
