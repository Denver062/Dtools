import { extOf, stripExt, uniqueName } from './format'
import type { OutputFile, ProgressFn } from './types'

export type TableTarget = 'json' | 'csv'
export type CsvDelimiter = ',' | ';' | '\t'

export interface TableConvertOptions {
  target: TableTarget
  delimiter: CsvDelimiter
  /** CSV output: prepend a UTF-8 BOM so Excel detects the encoding. */
  bom: boolean
  /** CSV → JSON: turn numeric / boolean looking cells into real values. */
  coerce: boolean
}

export interface TableConvertResult {
  outputs: OutputFile[]
  failures: { name: string; message: string }[]
}

const DELIMITER_LABEL: Record<CsvDelimiter, string> = {
  ',': '쉼표',
  ';': '세미콜론',
  '\t': '탭',
}

function parseCsv(text: string, delimiter: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  while (rows.length && rows[rows.length - 1].every((cell) => cell === '')) {
    rows.pop()
  }
  return rows
}

function normalizeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((raw, index) => {
    const name = raw.trim() || `열${index + 1}`
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} (${count})`
  })
}

function coerceCell(value: string): string | number | boolean {
  if (value === '') return ''
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value)
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

function csvToRows(text: string, options: TableConvertOptions): string[][] {
  const parsed = parseCsv(text, options.delimiter)
  if (!parsed.length) throw new Error('CSV에 데이터가 없습니다.')
  return parsed
}

function jsonToRows(text: string): unknown[][] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 문법을 읽지 못했습니다. 파일을 확인해 주세요.')
  }

  if (Array.isArray(value)) {
    if (!value.length) throw new Error('JSON 배열이 비어 있습니다.')
    if (value.every((item) => Array.isArray(item))) {
      return value as unknown[][]
    }
    if (value.every((item) => item !== null && typeof item === 'object')) {
      const keys: string[] = []
      for (const item of value) {
        for (const key of Object.keys(item as Record<string, unknown>)) {
          if (!keys.includes(key)) keys.push(key)
        }
      }
      return [
        keys,
        ...value.map((item) =>
          keys.map((key) => (item as Record<string, unknown>)[key]),
        ),
      ]
    }
    return [['value'], ...value.map((item) => [item])]
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return [entries.map(([key]) => key), entries.map(([, item]) => item)]
  }

  return [['value'], [value]]
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function escapeCell(value: string, delimiter: string): string {
  if (
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes(delimiter)
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(
  rows: unknown[][],
  options: TableConvertOptions,
): string {
  const body = rows
    .map((row) =>
      row
        .map((value) => escapeCell(cellText(value), options.delimiter))
        .join(options.delimiter),
    )
    .join('\r\n')
  return `${options.bom ? '\uFEFF' : ''}${body}${body ? '\r\n' : ''}`
}

export async function convertTables(
  files: File[],
  options: TableConvertOptions,
  onProgress?: ProgressFn,
): Promise<TableConvertResult> {
  const outputs: OutputFile[] = []
  const failures: { name: string; message: string }[] = []
  const used = new Set<string>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.({
      percent: (i / files.length) * 100,
      label: `변환 중 · ${file.name}`,
    })
    try {
      const input = extOf(file.name)
      if (input !== 'csv' && input !== 'json') {
        throw new Error('CSV 또는 JSON 파일만 변환할 수 있습니다.')
      }
      const text = await file.text()
      let body: string
      let outputExt: TableTarget
      let note: string

      if (input === 'csv') {
        const rows = csvToRows(text, options)
        const header = normalizeHeaders(rows[0])
        const dataRows = rows.slice(1)
        if (options.target === 'json') {
          const data = dataRows.map((row) => {
            const record: Record<string, string | number | boolean> = {}
            header.forEach((key, index) => {
              const raw = row[index] ?? ''
              record[key] = options.coerce ? coerceCell(raw) : raw
            })
            return record
          })
          body = `${JSON.stringify(data, null, 2)}\n`
          outputExt = 'json'
          note = `${data.length}행 · JSON`
        } else {
          body = toCsv(rows, options)
          outputExt = 'csv'
          note = `${header.length}열 · ${DELIMITER_LABEL[options.delimiter]}`
        }
      } else if (options.target === 'csv') {
        const rows = jsonToRows(text)
        body = toCsv(rows, options)
        outputExt = 'csv'
        note = `${Math.max(0, rows.length - 1)}행 · ${DELIMITER_LABEL[options.delimiter]}`
      } else {
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error('JSON 문법을 읽지 못했습니다. 파일을 확인해 주세요.')
        }
        body = `${JSON.stringify(parsed, null, 2)}\n`
        outputExt = 'json'
        note = 'JSON 정리됨'
      }

      outputs.push({
        name: uniqueName(`${stripExt(file.name)}.${outputExt}`, used),
        blob: new Blob([body], {
          type:
            outputExt === 'json'
              ? 'application/json;charset=utf-8'
              : 'text/csv;charset=utf-8',
        }),
        note,
      })
    } catch (error) {
      failures.push({
        name: file.name,
        message:
          error instanceof Error
            ? error.message
            : '파일을 변환하지 못했습니다.',
      })
    }
  }

  onProgress?.({ percent: 100, label: '완료' })
  return { outputs, failures }
}
