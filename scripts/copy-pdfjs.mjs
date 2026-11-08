import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'pdfjs-dist')
const target = join(root, 'public', 'pdfjs')

// pdf.js loads CMaps for legacy CJK documents and the standard font data when
// a PDF does not embed its fonts. Both must be served from our own origin.
const assets = ['cmaps', 'standard_fonts']

mkdirSync(target, { recursive: true })

for (const asset of assets) {
  const from = join(source, asset)
  const to = join(target, asset)
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
}

console.log(`[pdfjs] copied ${assets.join(', ')} → public/pdfjs`)
