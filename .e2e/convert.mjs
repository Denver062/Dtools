import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'

const BASE = 'http://localhost:4317/'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.e2e/artifacts')
const FIX = path.join(ROOT, '.e2e/fixtures')
const DL = path.join(ROOT, '.e2e/downloads')
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

function magic(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'png'
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp'
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp'
  if (buf.subarray(0, 4).toString('hex') === '00000100') return 'ico'
  if (buf.subarray(4, 8).toString() === 'ftyp' && /avi[fs]/.test(buf.subarray(8, 12).toString())) return 'avif'
  if (buf.subarray(0, 4).toString() === '%PDF') return 'pdf'
  return 'unknown:' + buf.subarray(0, 12).toString('hex')
}

async function inspectImage(page, buf) {
  return page.evaluate(async (b64) => {
    const raw = atob(b64)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const blob = new Blob([bytes])
    const bmp = await createImageBitmap(blob)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close()
    return out
  }, buf.toString('base64'))
}

const PNG = path.join(FIX, 'photo1.png')
const JPG = path.join(FIX, 'photo2.jpg')
const G = path.join(FIX, 'gamma-5p.pdf')
const A = path.join(FIX, 'alpha-3p.pdf')

async function upload(page, files) {
  await page.locator('.dropzone input[type=file]').first().setInputFiles(files)
  await page.waitForFunction((n) => document.querySelectorAll('.file-row').length === n, files.length, { timeout: 15000 })
}

async function waitConverted(page) {
  await page.waitForSelector('text=변환이 끝났습니다', { timeout: 90000 })
}

// ---------- settings modal ----------
async function openSettings(page) {
  await page.getByRole('button', { name: '변환 설정 열기' }).click()
  await page.locator('.modal-panel').waitFor({ state: 'visible' })
}

async function applySettings(page) {
  await page.getByRole('button', { name: '설정 적용' }).click()
  await page.locator('.modal-panel').waitFor({ state: 'detached' })
}

async function chooseMode(page, label) {
  await openSettings(page)
  await page.locator('.convert-mode').filter({ hasText: label }).click()
  await applySettings(page)
}

async function chooseImageTarget(page, label) {
  await openSettings(page)
  await page.getByRole('radiogroup', { name: '출력 형식' }).getByRole('radio', { name: label, exact: true }).click()
  await applySettings(page)
}

try {
  const page = await open('/convert', '파일 변환')
  await openSettings(page)
  const dialog = page.getByRole('dialog')
  if ((await dialog.count()) !== 1) throw new Error('settings dialog missing')
  const title = await dialog.getByText('변환 설정', { exact: true }).count()
  if (!title) throw new Error('dialog title missing')
  const modes = await page.locator('.convert-mode').allInnerTexts()
  if (modes.length !== 5) throw new Error('expected 5 conversion modes: ' + modes.length)
  for (const expected of ['이미지 변환', '이미지 → PDF', 'PDF → 이미지', 'PDF → 텍스트', 'CSV ↔ JSON']) {
    if (!modes.some((text) => text.includes(expected))) throw new Error(`missing mode ${expected}`)
  }
  const targets = await page.getByRole('radiogroup', { name: '출력 형식' }).getByRole('radio').allInnerTexts()
  if (targets.join(',') !== 'JPG,PNG,WebP,BMP,ICO') throw new Error('image targets: ' + targets.join(','))
  if (await page.getByText('AVIF', { exact: true }).count()) throw new Error('AVIF still offered as an output')
  const focused = await page.evaluate(() => Boolean(document.querySelector('.modal-panel:focus-within')))
  if (!focused) throw new Error('focus was not moved into the dialog')
  await page.keyboard.press('Escape')
  await page.locator('.modal-panel').waitFor({ state: 'detached' })
  if (await page.getByRole('dialog').count()) throw new Error('Escape did not close the dialog')
  ok('Settings modal opens, lists 5 modes without AVIF, closes with Escape')
  await page.close()
} catch (error) {
  fail('Settings modal', error)
}

// ---------- images → JPG ----------
try {
  const page = await open('/convert', '파일 변환')
  await upload(page, [PNG, JPG])
  await page.getByRole('button', { name: 'JPG(으)로 변환' }).click()
  await waitConverted(page)
  await page.screenshot({ path: path.join(OUT, 'convert-jpg-result.png'), fullPage: true })
  const zipFile = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const entries = await readZip(zipFile)
  if (entries.length !== 2) throw new Error('expected 2 outputs: ' + entries.map((e) => e.name).join(','))
  for (const e of entries) {
    if (magic(e.bytes) !== 'jpg') throw new Error(`${e.name} is ${magic(e.bytes)}`)
    const info = await inspectImage(page, e.bytes)
    if (info.width !== 800 || info.height !== 520) throw new Error(`${e.name} dims ${info.width}x${info.height}`)
  }
  ok('Convert PNG+JPG → JPG', entries.map((e) => e.name).join(', '))
  await page.close()
} catch (error) {
  fail('Convert → JPG', error)
}

// ---------- images → PNG ----------
try {
  const page = await open('/convert', '파일 변환')
  await upload(page, [JPG])
  await chooseImageTarget(page, 'PNG')
  await page.getByRole('button', { name: 'PNG(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const bytes = fs.readFileSync(file)
  if (magic(bytes) !== 'png') throw new Error('not png: ' + magic(bytes))
  const info = await inspectImage(page, bytes)
  ok('Convert JPG → PNG', `${info.width}×${info.height}`)
  await page.close()
} catch (error) {
  fail('Convert → PNG', error)
}

// ---------- images → WebP ----------
try {
  const page = await open('/convert', '파일 변환')
  await upload(page, [PNG])
  await chooseImageTarget(page, 'WebP')
  await page.getByRole('button', { name: 'WebP(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const bytes = fs.readFileSync(file)
  if (magic(bytes) !== 'webp') throw new Error('not webp: ' + magic(bytes))
  ok('Convert PNG → WebP', `${(bytes.length / 1024).toFixed(0)} KB`)
  await page.close()
} catch (error) {
  fail('Convert → WebP', error)
}

// ---------- images → BMP ----------
try {
  const page = await open('/convert', '파일 변환')
  await upload(page, [PNG])
  await chooseImageTarget(page, 'BMP')
  await page.getByRole('button', { name: 'BMP(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const bytes = fs.readFileSync(file)
  if (magic(bytes) !== 'bmp') throw new Error('not bmp: ' + magic(bytes))
  const width = bytes.readInt32LE(18)
  const height = bytes.readInt32LE(22)
  const bpp = bytes.readUInt16LE(28)
  if (width !== 800 || height !== 520) throw new Error(`bmp dims ${width}x${height}`)
  if (bpp !== 24) throw new Error('bmp bpp ' + bpp)
  const info = await inspectImage(page, bytes)
  ok('Convert PNG → BMP (24-bit)', `${info.width}×${info.height}, ${(bytes.length / 1024).toFixed(0)} KB`)
  await page.close()
} catch (error) {
  fail('Convert → BMP', error)
}

// ---------- images → ICO ----------
try {
  const page = await open('/convert', '파일 변환')
  await upload(page, [PNG])
  await chooseImageTarget(page, 'ICO')
  await page.getByRole('button', { name: 'ICO(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const bytes = fs.readFileSync(file)
  if (magic(bytes) !== 'ico') throw new Error('not ico: ' + magic(bytes))
  const count = bytes.readUInt16LE(4)
  if (count !== 6) throw new Error('ico entry count ' + count)
  const sizes = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const size = bytes[entry] === 0 ? 256 : bytes[entry]
    sizes.push(size)
    if (bytes.readUInt16LE(entry + 4) !== 1) throw new Error('ico entry not PNG')
  }
  if (sizes.join(',') !== '16,32,48,64,128,256') throw new Error('ico sizes ' + sizes.join(','))
  ok('Convert PNG → ICO', `${count} PNG entries: ${sizes.join('/')}px`)
  await page.close()
} catch (error) {
  fail('Convert → ICO', error)
}

// ---------- images → PDF (auto page) ----------
try {
  const page = await open('/convert', '파일 변환')
  await chooseMode(page, '이미지 → PDF')
  await upload(page, [PNG, JPG])
  await page.getByRole('button', { name: '이미지 2장을 PDF로' }).click()
  await waitConverted(page)
  await page.screenshot({ path: path.join(OUT, 'convert-to-pdf-result.png'), fullPage: true })
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const doc = await PDFDocument.load(fs.readFileSync(file))
  if (doc.getPageCount() !== 2) throw new Error('pages ' + doc.getPageCount())
  const size = doc.getPage(0).getSize()
  const ratio = size.width / size.height
  if (Math.abs(ratio - 800 / 520) > 0.01) throw new Error('page ratio ' + ratio)
  ok('Convert images → PDF (auto page)', `${doc.getPageCount()} pages, ${size.width.toFixed(0)}×${size.height.toFixed(0)}pt`)
  await page.close()
} catch (error) {
  fail('Convert images → PDF', error)
}

// ---------- images → PDF (A4 + margin) ----------
try {
  const page = await open('/convert', '파일 변환')
  await chooseMode(page, '이미지 → PDF')
  await openSettings(page)
  await page.locator('select[aria-label="PDF 페이지 크기"]').selectOption('a4')
  await page.getByRole('radiogroup', { name: '페이지 방향' }).getByRole('radio', { name: '세로', exact: true }).click()
  await page.locator('select[aria-label="페이지 여백"]').selectOption('36')
  await applySettings(page)
  await upload(page, [PNG])
  await page.getByRole('button', { name: '이미지 1장을 PDF로' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const doc = await PDFDocument.load(fs.readFileSync(file))
  const size = doc.getPage(0).getSize()
  if (Math.abs(size.width - 595.28) > 0.5 || Math.abs(size.height - 841.89) > 0.5) {
    throw new Error(`A4 page ${size.width}×${size.height}`)
  }
  ok('Convert images → PDF (A4 + 12mm margin)', `${size.width.toFixed(1)}×${size.height.toFixed(1)}pt`)
  await page.close()
} catch (error) {
  fail('Convert images → PDF (A4)', error)
}

// ---------- PDF → JPG with max edge ----------
try {
  const page = await open('/convert', '파일 변환')
  await chooseMode(page, 'PDF → 이미지')
  await page.locator('.dropzone input[type=file]').setInputFiles(G)
  await page.waitForFunction(() => document.querySelector('.file-row .badge')?.textContent === '5p', undefined, { timeout: 30000 })
  await openSettings(page)
  await page.locator('select[aria-label="최대 크기 (리사이즈)"]').selectOption('1280')
  await applySettings(page)
  await page.getByRole('button', { name: 'PDF를 이미지로 변환' }).click()
  await waitConverted(page)
  await page.screenshot({ path: path.join(OUT, 'convert-pdf-jpg-result.png'), fullPage: true })
  const zipFile = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const entries = await readZip(zipFile)
  if (entries.length !== 5) throw new Error('expected 5 outputs: ' + entries.length)
  for (const e of entries) {
    if (magic(e.bytes) !== 'jpg') throw new Error(`${e.name} is ${magic(e.bytes)}`)
    const info = await inspectImage(page, e.bytes)
    if (Math.max(info.width, info.height) !== 1280) throw new Error(`${e.name} max edge ${Math.max(info.width, info.height)}`)
  }
  ok('Convert PDF → JPG (5 pages, max edge 1280)', entries.map((e) => e.name).join(', '))
  await page.close()
} catch (error) {
  fail('Convert PDF → JPG', error)
}

// ---------- PDF → PNG ----------
try {
  const page = await open('/convert', '파일 변환')
  await chooseMode(page, 'PDF → 이미지')
  await page.locator('.dropzone input[type=file]').setInputFiles(A)
  await page.waitForFunction(() => document.querySelector('.file-row .badge')?.textContent === '3p', undefined, { timeout: 30000 })
  await openSettings(page)
  await page.getByRole('radiogroup', { name: '이미지 형식' }).getByRole('radio', { name: 'PNG', exact: true }).click()
  await applySettings(page)
  await page.getByRole('button', { name: 'PDF를 이미지로 변환' }).click()
  await waitConverted(page)
  const zipFile = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const entries = await readZip(zipFile)
  if (entries.length !== 3) throw new Error('expected 3 outputs: ' + entries.length)
  for (const e of entries) {
    if (magic(e.bytes) !== 'png') throw new Error(`${e.name} is ${magic(e.bytes)}`)
    const info = await inspectImage(page, e.bytes)
    if (Math.abs(info.width / info.height - 595 / 842) > 0.01) throw new Error('png ratio')
  }
  ok('Convert PDF → PNG (3 pages)', entries.map((e) => e.name).join(', '))
  await page.close()
} catch (error) {
  fail('Convert PDF → PNG', error)
}

// ---------- PDF → text ----------
try {
  const page = await open('/convert', '파일 변환')
  await chooseMode(page, 'PDF → 텍스트')
  await page.locator('.dropzone input[type=file]').setInputFiles(G)
  await page.waitForFunction(() => document.querySelector('.file-row .badge')?.textContent === '5p', undefined, { timeout: 30000 })
  await page.getByRole('button', { name: 'PDF 텍스트 추출' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const text = fs.readFileSync(file, 'utf8')
  if (!/Gamma Manual/.test(text)) throw new Error('missing PDF title text')
  if (!/===== 1 \/ 5 페이지 =====/.test(text)) throw new Error('missing page separator')
  if (!/Page 3 of 5/.test(text)) throw new Error('missing page 3 text')
  ok('Extract PDF → TXT (5 pages)', `${text.length} chars, page markers present`)
  await page.close()
} catch (error) {
  fail('Convert PDF → TXT', error)
}

// ---------- CSV → JSON ----------
try {
  const page = await open('/convert', '파일 변환')
  const csv = path.join(FIX, 'sample-table.csv')
  fs.writeFileSync(csv, 'name,score,active\nAlice,95,true\nBob,72,false\n', 'utf8')
  await chooseMode(page, 'CSV ↔ JSON')
  await page.locator('.dropzone input[type=file]').setInputFiles(csv)
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 1, undefined, { timeout: 15000 })
  await page.getByRole('button', { name: 'JSON(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(data) || data.length !== 2) throw new Error('rows ' + JSON.stringify(data))
  if (data[0].name !== 'Alice' || data[0].score !== 95 || data[0].active !== true) {
    throw new Error('coercion failed: ' + JSON.stringify(data[0]))
  }
  ok('Convert CSV → JSON (headers + numeric coercion)', JSON.stringify(data[0]))
  await page.close()
} catch (error) {
  fail('Convert CSV → JSON', error)
}

// ---------- JSON → CSV ----------
try {
  const page = await open('/convert', '파일 변환')
  const json = path.join(FIX, 'sample-table.json')
  fs.writeFileSync(json, JSON.stringify([{ city: '서울', temp: 21 }, { city: '부산', temp: 25 }]), 'utf8')
  await chooseMode(page, 'CSV ↔ JSON')
  await openSettings(page)
  await page.getByRole('radiogroup', { name: '표 출력 형식' }).getByRole('radio', { name: 'CSV', exact: true }).click()
  await applySettings(page)
  await page.locator('.dropzone input[type=file]').setInputFiles(json)
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 1, undefined, { timeout: 15000 })
  await page.getByRole('button', { name: 'CSV(으)로 변환' }).click()
  await waitConverted(page)
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const buffer = fs.readFileSync(file)
  const text = buffer.toString('utf8')
  if (!text.startsWith('\uFEFF')) throw new Error('missing BOM')
  const body = text.slice(1).replace(/\r\n$/, '')
  const lines = body.split('\r\n')
  if (lines[0] !== 'city,temp') throw new Error('header: ' + lines[0])
  if (lines[1] !== '서울,21' || lines[2] !== '부산,25') throw new Error('rows: ' + lines.slice(1).join(' | '))
  ok('Convert JSON → CSV (BOM + header + rows)', lines.join(' / '))
  await page.close()
} catch (error) {
  fail('Convert JSON → CSV', error)
}

// ---------- unsupported file rejection + partial failure ----------
try {
  const page = await open('/convert', '파일 변환')
  const txt = path.join(FIX, 'tree', '문서', '메모.txt')
  await page.locator('.dropzone input[type=file]').first().setInputFiles(txt)
  await page.waitForSelector('.alert', { timeout: 15000 })
  const rejected = await page.locator('.alert').first().innerText()
  if (!/지원하지 않는 형식/.test(rejected)) throw new Error('missing rejection: ' + rejected)
  if ((await page.locator('.file-row').count()) !== 0) throw new Error('invalid file was added')

  const broken = path.join(FIX, 'broken.png')
  fs.writeFileSync(broken, 'this is definitely not a png')
  await upload(page, [PNG, broken])
  await page.getByRole('button', { name: 'JPG(으)로 변환' }).click()
  await waitConverted(page)
  const warn = await page.locator('.alert').first().innerText()
  if (!/1개 파일은 변환하지 못했습니다/.test(warn)) throw new Error('missing partial failure: ' + warn)
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (rows.length !== 1 || rows[0] !== 'photo1.jpg') throw new Error('outputs: ' + rows.join(','))
  ok('Convert rejects wrong type & reports partial failures', warn.replace(/\s+/g, ' ').slice(0, 90))
  await page.close()
} catch (error) {
  fail('Convert validation/partial failure', error)
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('problems:', problems.length ? problems : 'none')
fs.writeFileSync(path.join(OUT, 'convert-summary.json'), JSON.stringify({ results, problems }, null, 2))
await browser.close()
process.exit(results.some((r) => !r.ok) || problems.length ? 1 : 0)
