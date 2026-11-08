/** Shared, framework-free helpers. */

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value >= 100 ? Math.round(value) : Number(value.toFixed(digits))
  return `${rounded} ${units[unit]}`
}

export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const idx = base.lastIndexOf('.')
  if (idx <= 0 || idx === base.length - 1) return ''
  return base.slice(idx + 1).toLowerCase()
}

export function stripExt(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return name
  return name.slice(0, idx)
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Archive entry paths are always forward-slash relative paths. */
export function sanitizeArchivePath(raw: string): string {
  return raw
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
}

export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  let candidate = `${base} (${i})${ext}`
  while (used.has(candidate)) {
    i++
    candidate = `${base} (${i})${ext}`
  }
  used.add(candidate)
  return candidate
}

export function percent(part: number, total: number): number {
  if (!total) return 0
  return Math.max(0, Math.min(100, (part / total) * 100))
}

/**
 * Parses a page range expression such as `1-3, 5, 8-`.
 * Returns zero-based page indexes, preserving the user's order.
 */
export function parseRanges(input: string, pageCount: number): number[][] {
  const text = input.trim()
  if (!text) throw new Error('페이지 범위를 입력해 주세요.')

  const groups: number[][] = []
  for (const chunk of text.split(',')) {
    const part = chunk.trim()
    if (!part) continue
    const match = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part)
    if (!match) {
      throw new Error(`'${part}' 형식을 이해할 수 없습니다. 예: 1-3, 5, 8-`)
    }
    const start = Number(match[1])
    const end =
      match[2] === undefined
        ? start
        : match[2] === ''
          ? pageCount
          : Number(match[2])
    if (start < 1 || start > pageCount) {
      throw new Error(`페이지 번호는 1부터 ${pageCount}까지 입력할 수 있습니다.`)
    }
    if (end < 1 || end > pageCount) {
      throw new Error(`페이지 번호는 1부터 ${pageCount}까지 입력할 수 있습니다.`)
    }
    if (end < start) {
      throw new Error(`'${part}' 범위의 끝이 시작보다 작습니다.`)
    }
    const pages: number[] = []
    for (let p = start; p <= end; p++) pages.push(p - 1)
    groups.push(pages)
  }
  if (!groups.length) throw new Error('페이지 범위를 입력해 주세요.')
  return groups
}

export function chunkPages(pageCount: number, size: number): number[][] {
  const groups: number[][] = []
  for (let i = 0; i < pageCount; i += size) {
    const group: number[] = []
    for (let j = i; j < Math.min(i + size, pageCount); j++) group.push(j)
    groups.push(group)
  }
  return groups
}

export function rangeLabel(indexes: number[]): string {
  if (!indexes.length) return ''
  const sorted = [...indexes].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
    start = cur
    prev = cur
  }
  return ranges.join(', ')
}

export function fileKind(name: string): 'pdf' | 'image' | 'archive' | 'other' {
  const ext = extOf(name)
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'svg', 'tif', 'tiff'].includes(ext)) {
    return 'image'
  }
  if (['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', 'cab', 'iso'].includes(ext)) {
    return 'archive'
  }
  return 'other'
}

export function isPdf(name: string): boolean {
  return extOf(name) === 'pdf'
}

export function guessArchiveExt(name: string): string {
  const ext = extOf(name)
  return ext === '7z' ? '7z' : 'zip'
}

export function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/** Makes a name safe for downloads on Windows, macOS and Linux. */
export function safeFileName(name: string, fallback = 'dtools'): string {
  const clean = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return clean || fallback
}

export function ensureExtension(base: string, extension: string): string {
  const clean = safeFileName(base)
  const suffix = `.${extension.replace(/^\./, '')}`
  return clean.toLowerCase().endsWith(suffix.toLowerCase())
    ? clean
    : `${clean}${suffix}`
}
