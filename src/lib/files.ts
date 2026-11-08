import { extOf, uniqueName } from './format'
import type { PickedSet } from './pick'
import type { PickedFile } from './types'

/** Appends files while keeping archive paths unique across separate drops. */
export function mergeFiles(
  current: PickedFile[],
  incoming: PickedFile[],
): PickedFile[] {
  const used = new Set(current.map((item) => item.path))
  const added = incoming.map((item) => ({
    file: item.file,
    path: uniqueName(item.path, used),
  }))
  return [...current, ...added]
}

export function mergeDirectories(current: string[], incoming: string[]): string[] {
  return Array.from(new Set([...current, ...incoming]))
}

export function mergePicked(
  currentFiles: PickedFile[],
  currentDirectories: string[],
  picked: PickedSet,
): { files: PickedFile[]; directories: string[] } {
  return {
    files: mergeFiles(currentFiles, picked.files),
    directories: mergeDirectories(currentDirectories, picked.directories),
  }
}

export function isExtension(name: string, extensions: string[]): boolean {
  return extensions.includes(extOf(name))
}

export function pickRejected(
  files: PickedFile[],
  extensions: string[],
): PickedFile[] {
  return files.filter((item) => !isExtension(item.file.name, extensions))
}

export function fileSummary(files: { file: File }[]): {
  count: number
  size: number
} {
  return {
    count: files.length,
    size: files.reduce((sum, item) => sum + item.file.size, 0),
  }
}
