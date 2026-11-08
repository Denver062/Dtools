import fs from 'node:fs'
import path from 'node:path'

const srcDir = path.resolve('src')
const css = fs.readFileSync(path.join(srcDir, 'styles', 'global.css'), 'utf8')
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]))

const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full)
  }
}
walk(srcDir)

const used = new Map()
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const re = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g
  for (const match of text.matchAll(re)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? ''
    for (const token of raw.split(/\s+/)) {
      const name = token.replace(/\$\{.*$/, '').replace(/[^a-zA-Z0-9_-].*$/, '')
      if (!name || name.includes('$')) continue
      if (!used.has(name)) used.set(name, new Set())
      used.get(name).add(path.relative(process.cwd(), file))
    }
  }
}

const missing = [...used.entries()]
  .filter(([name]) => !cssClasses.has(name))
  .sort((a, b) => a[0].localeCompare(b[0]))

console.log(`used classes: ${used.size}, css classes: ${cssClasses.size}`)
for (const [name, where] of missing) {
  console.log(`MISSING .${name}  <- ${[...where].join(', ')}`)
}
console.log(`missing total: ${missing.length}`)
