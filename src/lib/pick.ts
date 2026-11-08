import type { PickedFile } from './types'
import { sanitizeArchivePath } from './format'

export interface PickedSet {
  files: PickedFile[]
  /** Folders that contain no files (only folder drops can detect these). */
  directories: string[]
}

function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path)
    return path
  }
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? path.slice(slash + 1) : path
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  let candidate = `${dir}${base} (${i})${ext}`
  while (used.has(candidate)) {
    i++
    candidate = `${dir}${base} (${i})${ext}`
  }
  used.add(candidate)
  return candidate
}

function readDirectory(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader()
    const all: FileSystemEntry[] = []
    const next = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all)
          return
        }
        all.push(...batch)
        next()
      }, reject)
    }
    next()
  })
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  result: PickedSet,
  used: Set<string>,
  onCount?: (count: number) => void,
) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(resolve, reject)
    })
    const path = uniquePath(sanitizeArchivePath(prefix + file.name), used)
    result.files.push({ file, path })
    onCount?.(result.files.length)
    return
  }

  if (!entry.isDirectory) return
  const dirPath = sanitizeArchivePath(prefix + entry.name) + '/'
  const children = await readDirectory(entry as FileSystemDirectoryEntry)
  if (!children.length) {
    const clean = dirPath.replace(/\/$/, '')
    if (clean) result.directories.push(clean)
    return
  }
  for (const child of children) {
    await walkEntry(child, dirPath, result, used, onCount)
  }
}

/** Reads dropped files and folders, preserving the folder structure. */
export async function readDataTransfer(
  transfer: DataTransfer,
  onCount?: (count: number) => void,
): Promise<PickedSet> {
  const roots: FileSystemEntry[] = []
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) roots.push(entry)
  }

  if (!roots.length) {
    return fromFileList(transfer.files, onCount)
  }

  const result: PickedSet = { files: [], directories: [] }
  const used = new Set<string>()
  for (const root of roots) {
    await walkEntry(root, '', result, used, onCount)
  }
  return result
}

export function fromFileList(
  list: FileList | File[],
  onCount?: (count: number) => void,
): PickedSet {
  const files: PickedFile[] = []
  const used = new Set<string>()
  for (const file of Array.from(list)) {
    const relative =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name
    const path = uniquePath(sanitizeArchivePath(relative), used)
    files.push({ file, path })
    onCount?.(files.length)
  }
  return { files, directories: [] }
}
