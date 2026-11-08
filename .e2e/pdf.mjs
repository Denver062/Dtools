import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'

const BASE = 'http://localhost:4317/'
const OUT = path.resolve('.e2e/artifacts')
const FIX = path.resolve('.e2e/fixtures')
const DL = path.resolve('.e2e/downloads')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(DL, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
const problems = []
const results = []
const ok = (name, detail = '') => {
  results.push({ name, ok: true, detail })
  console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`)
}
const fail = (name, error) => {
  results.push({ name, ok: false, detail: String(error) })
  console.log(`FAIL ${name} — ${error}`)
}

async function open(route, title) {
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`[${route}] console: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`[${route}] pageerror: ${err.message}`))
  await page.goto(BASE + '#' + route, { waitUntil: 'networkidle' })
  await page.waitForFunction((t) => document.querySelector('h1')?.textContent?.includes(t), title, { timeout: 15000 })
  return page
}

async function downloadFrom(page, click) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  const target = path.join(DL, `${Date.now()}-${download.suggestedFilename()}`)
  await download.saveAs(target)
  return target
}

async function pageCount(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file))
  return doc.getPageCount()
}

async function texts(file) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true })
  const doc = await task.promise
  const out = []
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n)
    const tc = await p.getTextContent()
    out.push(tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
  }
  await task.destroy()
  return out
}

async function readZip(file) {
  const reader = new ZipReader(new BlobReader(new Blob([fs.readFileSync(file)])))
  const entries = await reader.getEntries()
  const out = []
  for (const e of entries) {
    if (e.directory) continue
    const blob = await e.getData(new BlobWriter())
    out.push({ name: e.filename, bytes: Buffer.from(await blob.arrayBuffer()) })
  }
  await reader.close()
  return out
}

// heavy PDF with high-entropy photos to make raster compression meaningful
const heavyPath = path.join(FIX, 'heavy-5p.pdf')
{
  const p0 = await context.newPage()
  await p0.goto(BASE, { waitUntil: 'networkidle' })
  const jpegB64 = await p0.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1700
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    const image = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (Math.random() * 256) | 0
      image.data[i + 1] = (Math.random() * 256) | 0
      image.data[i + 2] = (Math.random() * 256) | 0
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1]
  })
  await p0.close()
  const jpg = Buffer.from(jpegB64, 'base64')
  const doc = await PDFDocument.create()
  const image = await doc.embedJpg(jpg)
  for (let i = 0; i < 5; i++) {
    const page = doc.addPage([595, 842])
    page.drawImage(image, { x: 20, y: 20, width: 555, height: 802 })
  }
  fs.writeFileSync(heavyPath, await doc.save())
  console.log('heavy pdf', fs.statSync(heavyPath).size)
}

const A = path.join(FIX, 'alpha-3p.pdf')
const B = path.join(FIX, 'beta-2p.pdf')
const G = path.join(FIX, 'gamma-5p.pdf')

// ---------- merge ----------
try {
  const page = await open('/pdf/merge', 'PDF 합치기')
  await page.locator('.dropzone input[type=file]').setInputFiles([A, B])
  await page.waitForFunction(() => {
    const badges = [...document.querySelectorAll('.file-row .badge')].map((b) => b.textContent)
    return badges.includes('3p') && badges.includes('2p')
  })
  await page.getByRole('button', { name: 'PDF 합치기', exact: true }).click()
  await page.waitForSelector('text=PDF가 하나로 합쳐졌습니다', { timeout: 60000 })
  await page.screenshot({ path: path.join(OUT, 'pdf-merge-result.png'), fullPage: true })
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  if ((await pageCount(file)) !== 5) throw new Error('merged pages != 5')
  const t = await texts(file)
  if (!t[0].includes('Alpha Report')) throw new Error('first page not alpha: ' + t[0].slice(0, 60))
  if (!t[4].includes('Beta Notes')) throw new Error('last page not beta: ' + t[4].slice(0, 60))
  ok('PDF merge preserves page order & text', `${await pageCount(file)} pages, ${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
  await page.close()
} catch (error) {
  fail('PDF merge', error)
}

// ---------- split: ranges ----------
try {
  const page = await open('/pdf/split', 'PDF 나누기')
  await page.locator('.dropzone input[type=file]').setInputFiles(G)
  const rangeInput = page.locator('input[placeholder="예: 1-3, 5, 8-"]')
  await page.waitForFunction(
    () => document.querySelector('input[placeholder="예: 1-3, 5, 8-"]')?.value === '1-5',
    undefined,
    { timeout: 30000 },
  )
  await rangeInput.fill('1-2, 4-')
  await page.getByRole('button', { name: '2개 PDF로 나누기' }).click()
  await page.waitForSelector('text=PDF를 여러 파일로 나눴습니다', { timeout: 60000 })
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (rows.length !== 2) throw new Error('expected 2 outputs: ' + rows.join(','))
  const zipFile = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const entries = await readZip(zipFile)
  const counts = []
  for (const e of entries) {
    const tmp = path.join(DL, `split-${Date.now()}-${e.name}`)
    fs.writeFileSync(tmp, e.bytes)
    counts.push(await pageCount(tmp))
  }
  if (counts.join(',') !== '2,2') throw new Error('split page counts: ' + counts.join(','))
  ok('PDF split by ranges (1-2, 4-)', `${rows.join(', ')} → pages ${counts.join(' + ')}`)
  await page.close()
} catch (error) {
  fail('PDF split ranges', error)
}

// ---------- split: every N pages ----------
try {
  const page = await open('/pdf/split', 'PDF 나누기')
  await page.locator('.dropzone input[type=file]').setInputFiles(G)
  await page.waitForFunction(
    () => document.querySelector('input[placeholder="예: 1-3, 5, 8-"]')?.value === '1-5',
    undefined,
    { timeout: 30000 },
  )
  await page.getByRole('radiogroup', { name: '나누기 방법' }).getByRole('radio', { name: 'N페이지마다' }).click()
  const number = page.locator('input[type=number]')
  await number.fill('2')
  await page.getByRole('button', { name: '3개 PDF로 나누기' }).click()
  await page.waitForSelector('text=PDF를 여러 파일로 나눴습니다', { timeout: 60000 })
  const zipFile = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const entries = await readZip(zipFile)
  const counts = []
  for (const e of entries) {
    const tmp = path.join(DL, `chunk-${Date.now()}-${e.name}`)
    fs.writeFileSync(tmp, e.bytes)
    counts.push(await pageCount(tmp))
  }
  if (counts.join(',') !== '2,2,1') throw new Error('chunk counts: ' + counts.join(','))
  ok('PDF split every 2 pages', `pages ${counts.join(' + ')}`)
  await page.close()
} catch (error) {
  fail('PDF split chunks', error)
}

// ---------- compress: lossless ----------
try {
  const page = await open('/pdf/compress', 'PDF 압축')
  await page.locator('.dropzone input[type=file]').setInputFiles(G)
  await page.waitForFunction(() => document.querySelector('.file-row .badge')?.textContent === '5p', undefined, { timeout: 30000 })
  await page.locator('.mode-card').filter({ hasText: '무손실' }).click()
  await page.getByRole('button', { name: 'PDF 압축하기' }).click()
  await page.waitForSelector('text=압축이 끝났습니다', { timeout: 60000 })
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  if ((await pageCount(file)) !== 5) throw new Error('lossless page count')
  const t = await texts(file)
  if (!t[0].includes('Gamma Manual')) throw new Error('lossless lost text: ' + t[0].slice(0, 50))
  await page.screenshot({ path: path.join(OUT, 'pdf-compress-lossless.png'), fullPage: true })
  ok('PDF compress lossless keeps text', `${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
  await page.close()
} catch (error) {
  fail('PDF compress lossless', error)
}

// ---------- compress: balanced + strong (raster) ----------
for (const [mode, label] of [['balanced', '균형'], ['strong', '강하게']]) {
  try {
    const page = await open('/pdf/compress', 'PDF 압축')
    await page.locator('.dropzone input[type=file]').setInputFiles(heavyPath)
    await page.waitForFunction(() => document.querySelector('.file-row .badge')?.textContent === '5p', undefined, { timeout: 30000 })
    await page.locator('.mode-card').filter({ hasText: label }).click()
    await page.getByRole('button', { name: 'PDF 압축하기' }).click()
    await page.waitForSelector('text=압축이 끝났습니다', { timeout: 120000 })
    const note = await page.locator('.result-meta').first().innerText()
    const usedOriginal = note.includes('원본 유지')
    const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
    if ((await pageCount(file)) !== 5) throw new Error('compressed page count')
    const outSize = fs.statSync(file).size
    if (!usedOriginal && outSize >= fs.statSync(heavyPath).size) {
      throw new Error('compressed larger but not marked usedOriginal')
    }
    if (!usedOriginal) {
      const t = await texts(file)
      if (t.some((x) => x.length > 0)) throw new Error('rasterized output still has text')
    }
    await page.screenshot({ path: path.join(OUT, `pdf-compress-${mode}.png`), fullPage: true })
    ok(
      `PDF compress ${mode} (raster pipeline)`,
      `${(fs.statSync(heavyPath).size / 1024).toFixed(0)} KB → ${(outSize / 1024).toFixed(0)} KB${usedOriginal ? ' (original kept)' : ''}`,
    )
    await page.close()
  } catch (error) {
    fail(`PDF compress ${mode}`, error)
  }
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('problems:', problems.length ? problems : 'none')
fs.writeFileSync(path.join(OUT, 'pdf-summary.json'), JSON.stringify({ results, problems }, null, 2))
await browser.close()
process.exit(results.some((r) => !r.ok) || problems.length ? 1 : 0)
