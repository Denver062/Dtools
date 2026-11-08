import type { OutputFile } from './types'

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Bundles several results into a single ZIP (stored, not recompressed) so users
 * do not get a pile of download prompts.
 */
export async function downloadAllAsZip(
  files: OutputFile[],
  zipName: string,
  onProgress?: (done: number, total: number) => void,
  directories: string[] = [],
) {
  const { BlobWriter, BlobReader, ZipWriter, configure } = await import(
    '@zip.js/zip.js'
  )
  configure({ useWebWorkers: false })
  const blobWriter = new BlobWriter('application/zip')
  const writer = new ZipWriter(blobWriter)
  const used = new Set<string>()

  for (const dir of directories) {
    const clean = dir.replace(/^\/+|\/+$/g, '')
    if (clean) {
      await writer.add(`${clean}/`, null, { directory: true })
    }
  }

  for (let i = 0; i < files.length; i++) {
    const item = files[i]
    let name = (item.path ?? item.name).replace(/^\/+/, '')
    if (used.has(name)) {
      const dot = name.lastIndexOf('.')
      name =
        dot > 0
          ? `${name.slice(0, dot)} (${i + 1})${name.slice(dot)}`
          : `${name} (${i + 1})`
    }
    used.add(name)
    await writer.add(name, new BlobReader(item.blob), { level: 0 })
    onProgress?.(i + 1, files.length)
  }

  await writer.close()
  downloadBlob(await blobWriter.getData(), zipName)
}
