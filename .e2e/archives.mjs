import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import SevenZip from '7z-wasm'

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

function ok(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name, error) {
  results.push({ name, ok: false, detail: String(error) })
  console.log(`FAIL ${name} — ${error}`)
}

async function open(route, expectTitle) {
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`[${route}] console: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`[${route}] pageerror: ${err.message}`))
  await page.goto(BASE + '#' + route, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    (title) => document.querySelector('h1')?.textContent?.includes(title),
    expectTitle,
    { timeout: 15000 },
  )
  return page
}

async function downloadFrom(page, click) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  const target = path.join(DL, `${Date.now()}-${download.suggestedFilename()}`)
  await download.saveAs(target)
  return target
}

async function readZip(file, password) {
  const buf = fs.readFileSync(file)
  const reader = new ZipReader(new BlobReader(new Blob([buf])), {
    password: password || undefined,
  })
  const entries = await reader.getEntries()
  const out = []
  for (const entry of entries) {
    if (entry.directory) {
      out.push({ name: entry.filename, dir: true, size: 0 })
      continue
    }
    const data = await entry.getData(new BlobWriter())
    out.push({ name: entry.filename, dir: false, size: data.size, bytes: Buffer.from(await data.arrayBuffer()) })
  }
  await reader.close()
  return out
}

function read7z(file, password) {
  // independent 7-Zip WASM check
  return (async () => {
    const wasm = fs.readFileSync('node_modules/7z-wasm/7zz.wasm')
    const logs = []
    const bin = await SevenZip({
      wasmBinary: wasm,
      noExitRuntime: true,
      print: (l) => logs.push(l),
      printErr: (l) => logs.push(l),
      stdin: () => null,
    })
    const archive = '/check.7z'
    const outDir = '/check-out'
    bin.FS.writeFile(archive, new Uint8Array(fs.readFileSync(file)))
    bin.FS.mkdir(outDir)
    const code = bin.callMain(['x', archive, `-o${outDir}`, `-p${password ?? ''}`, '-y', '-bso0', '-bsp0'])
    if (code !== 0) {
      throw new Error('7z exit ' + code + ': ' + logs.slice(-3).join(' '))
    }
    const out = []
    const walk = (dir, prefix) => {
      for (const name of bin.FS.readdir(dir)) {
        if (name === '.' || name === '..') continue
        const full = `${dir}/${name}`
        const rel = prefix ? `${prefix}/${name}` : name
        const stat = bin.FS.stat(full)
        if (bin.FS.isDir(stat.mode)) {
          out.push({ name: rel, dir: true, size: 0 })
          walk(full, rel)
        } else {
          const bytes = Buffer.from(bin.FS.readFile(full))
          out.push({ name: rel, dir: false, size: bytes.length, bytes })
        }
      }
    }
    walk(outDir, '')
    return out
  })()
}

function findFile(entries, suffix) {
  return entries.find((e) => !e.dir && e.name.endsWith(suffix))
}

// ---------- prepare images ----------
{
  const p = await context.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  const data = await p.evaluate(() => {
    const make = (hue) => {
      const c = document.createElement('canvas')
      c.width = 800
      c.height = 520
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, 800, 520)
      grad.addColorStop(0, `hsl(${hue}, 85%, 55%)`)
      grad.addColorStop(1, `hsl(${hue + 70}, 80%, 30%)`)
      g.fillStyle = grad
      g.fillRect(0, 0, 800, 520)
      g.fillStyle = 'rgba(255,255,255,0.85)'
      for (let i = 0; i < 40; i++) {
        g.beginPath()
        g.arc(40 + ((i * 197) % 720), 40 + ((i * 331) % 440), 8 + (i % 5) * 7, 0, Math.PI * 2)
        g.fill()
      }
      g.font = 'bold 72px sans-serif'
      g.fillStyle = '#101010'
      g.fillText('DTOOLS', 60, 300)
      return c
    }
    const a = make(18)
    const b = make(190)
    return {
      png: a.toDataURL('image/png').split(',')[1],
      jpg: b.toDataURL('image/jpeg', 0.93).split(',')[1],
    }
  })
  fs.writeFileSync(path.join(FIX, 'photo1.png'), Buffer.from(data.png, 'base64'))
  fs.writeFileSync(path.join(FIX, 'photo2.jpg'), Buffer.from(data.jpg, 'base64'))
  await p.close()
  console.log('images ready', fs.statSync(path.join(FIX, 'photo1.png')).size, fs.statSync(path.join(FIX, 'photo2.jpg')).size)
}

const UPLOAD = [path.join(FIX, 'photo1.png'), path.join(FIX, 'photo2.jpg')]
const PASSWORD = 'P@ssw0rd-한글'

// ---------- ZIP create ----------
let zipPath
try {
  const page = await open('/compress', '압축 만들기')
  await page.locator('.dropzone input[type=file]').first().setInputFiles(UPLOAD)
  await page.locator('.dropzone input[webkitdirectory]').setInputFiles(path.join(FIX, 'tree'))
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 4)
  await page.locator('input[placeholder="archive"]').fill('e2e-zip')
  await page.locator('.toggle-row').filter({ hasText: '비밀번호 설정' }).click()
  await page.locator('input[aria-label="비밀번호"]').fill(PASSWORD)
  await page.locator('input[aria-label="비밀번호 확인"]').fill(PASSWORD)
  await page.screenshot({ path: path.join(OUT, 'compress-zip-form.png'), fullPage: true })
  await page.getByRole('button', { name: /ZIP로 압축하기/ }).click()
  await page.waitForSelector('text=압축 파일이 만들어졌습니다', { timeout: 60000 })
  await page.screenshot({ path: path.join(OUT, 'compress-zip-result.png'), fullPage: true })
  zipPath = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const entries = await readZip(zipPath, PASSWORD)
  const names = entries.map((e) => e.name)
  const folded = names.join('|')
  if (!folded.includes('tree/문서/메모.txt')) throw new Error('missing korean nested file: ' + folded)
  if (!folded.includes('tree/문서/readme.txt')) throw new Error('missing nested file: ' + folded)
  if (!folded.includes('photo1.png') || !folded.includes('photo2.jpg')) throw new Error('missing root files: ' + folded)
  const memo = findFile(entries, '메모.txt')
  if (!memo || !memo.bytes.toString('utf8').includes('한글 파일명')) throw new Error('memo content mismatch')
  // wrong password must fail
  let wrongFailed = false
  try {
    await readZip(zipPath, 'wrong-password')
  } catch {
    wrongFailed = true
  }
  if (!wrongFailed) throw new Error('ZIP opened with wrong password!')
  ok('ZIP create (AES-256, Korean paths, folder tree)', `${entries.length} entries, ${fs.statSync(zipPath).size} bytes`)
  ok('ZIP wrong password rejected')
  await page.close()
} catch (error) {
  fail('ZIP create/verify', error)
}

// ---------- ZIP extract ----------
try {
  const page = await open('/extract', '압축 풀기')
  await page.locator('.dropzone input[type=file]').setInputFiles(zipPath)
  await page.waitForSelector('.file-row')
  // no password → auth error
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('.alert', { timeout: 30000 })
  const authText = await page.locator('.alert').first().innerText()
  if (!/비밀번호/.test(authText)) throw new Error('expected password error, got: ' + authText)
  ok('ZIP extract without password shows auth error')
  await page.locator('input[aria-label="비밀번호"]').fill(PASSWORD)
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('text=압축을 풀었습니다', { timeout: 60000 })
  await page.screenshot({ path: path.join(OUT, 'extract-zip-result.png'), fullPage: true })
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (!rows.some((r) => r === '메모.txt')) throw new Error('memo not extracted: ' + rows.join(','))
  // zip all
  const allPath = await downloadFrom(page, () => page.getByRole('button', { name: /ZIP으로 모두 받기/ }).click())
  const all = await readZip(allPath)
  const allNames = all.map((e) => e.name).join('|')
  if (!allNames.includes('tree/문서/메모.txt') || !allNames.includes('photo1.png')) {
    throw new Error('zip-all lost structure: ' + allNames)
  }
  ok('ZIP extract + ZIP-all preserves paths', `${rows.length} files`)
  await page.close()
} catch (error) {
  fail('ZIP extract', error)
}

// ---------- 7Z create ----------
let sevenPath
try {
  const page = await open('/compress', '압축 만들기')
  await page.locator('.dropzone input[type=file]').first().setInputFiles(UPLOAD)
  await page.locator('.dropzone input[webkitdirectory]').setInputFiles(path.join(FIX, 'tree'))
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 4)
  await page.locator('input[placeholder="archive"]').fill('e2e-7z')
  await page.getByRole('radiogroup', { name: '압축 형식' }).getByRole('radio', { name: '7Z' }).click()
  await page.locator('.toggle-row').filter({ hasText: '비밀번호 설정' }).click()
  await page.locator('input[aria-label="비밀번호"]').fill(PASSWORD)
  await page.locator('input[aria-label="비밀번호 확인"]').fill(PASSWORD)
  await page.getByRole('button', { name: '고급 압축 설정' }).click()
  await page.locator('.toggle-row').filter({ hasText: '파일 목록(이름)도 암호화' }).click()
  await page.getByRole('button', { name: /7Z로 압축하기/ }).click()
  await page.waitForSelector('text=압축 파일이 만들어졌습니다', { timeout: 90000 })
  await page.screenshot({ path: path.join(OUT, 'compress-7z-result.png'), fullPage: true })
  sevenPath = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const magic = fs.readFileSync(sevenPath).subarray(0, 6)
  if (magic.toString('hex') !== '377abcaf271c') throw new Error('bad 7z magic: ' + magic.toString('hex'))
  const entries = await read7z(sevenPath, PASSWORD)
  const names = entries.map((e) => e.name).join('|')
  if (!names.includes('tree/문서/메모.txt')) throw new Error('7z missing korean path: ' + names)
  if (!names.includes('photo1.png')) throw new Error('7z missing root file: ' + names)
  let wrongFailed = false
  try {
    await read7z(sevenPath, 'wrong-password')
  } catch {
    wrongFailed = true
  }
  if (!wrongFailed) throw new Error('7z opened with wrong password')
  ok('7Z create (AES-256 + header encryption, Korean paths)', `${entries.length} entries, ${fs.statSync(sevenPath).size} bytes`)
  ok('7Z wrong password rejected')
  await page.close()
} catch (error) {
  fail('7Z create/verify', error)
}

// ---------- 7Z extract ----------
try {
  const page = await open('/extract', '압축 풀기')
  await page.locator('.dropzone input[type=file]').setInputFiles(sevenPath)
  await page.waitForSelector('.file-row')
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('.alert', { timeout: 30000 })
  ok('7Z extract without password shows error')
  await page.locator('input[aria-label="비밀번호"]').fill(PASSWORD)
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('text=압축을 풀었습니다', { timeout: 60000 })
  await page.screenshot({ path: path.join(OUT, 'extract-7z-result.png'), fullPage: true })
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (!rows.some((r) => r === '메모.txt')) throw new Error('7z memo missing: ' + rows.join(','))
  ok('7Z extract', `${rows.length} files`)
  await page.close()
} catch (error) {
  fail('7Z extract', error)
}

// ---------- TAR.GZ extract (different format via 7-Zip engine) ----------
try {
  const { execFileSync } = await import('node:child_process')
  const tarPath = path.join(FIX, 'sample.tar.gz')
  execFileSync('tar.exe', ['-czf', tarPath, '-C', path.join(FIX, 'tree'), '.'])
  const page = await open('/extract', '압축 풀기')
  await page.locator('.dropzone input[type=file]').setInputFiles(tarPath)
  await page.waitForSelector('.file-row')
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('text=압축을 풀었습니다', { timeout: 60000 })
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (!rows.includes('메모.txt') || !rows.includes('readme.txt')) throw new Error('tar.gz entries: ' + rows.join(','))
  ok('TAR.GZ extract via 7-Zip engine', rows.join(', '))
  await page.close()
} catch (error) {
  fail('TAR.GZ extract', error)
}

// ---------- ZIP with legacy ZipCrypto ----------
try {
  const page = await open('/compress', '압축 만들기')
  await page.locator('.dropzone input[type=file]').first().setInputFiles(UPLOAD)
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 2)
  await page.locator('input[placeholder="archive"]').fill('e2e-zipcrypto')
  await page.locator('.toggle-row').filter({ hasText: '비밀번호 설정' }).click()
  await page.locator('input[aria-label="비밀번호"]').fill(PASSWORD)
  await page.locator('input[aria-label="비밀번호 확인"]').fill(PASSWORD)
  await page.getByRole('button', { name: '고급 압축 설정' }).click()
  await page.locator('.toggle-row').filter({ hasText: '구형 압축 호환' }).click()
  await page.getByRole('button', { name: /ZIP로 압축하기/ }).click()
  await page.waitForSelector('text=압축 파일이 만들어졌습니다', { timeout: 60000 })
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const entries = await readZip(file, PASSWORD)
  if (entries.length !== 2) throw new Error('zipcrypto entries ' + entries.length)
  let wrongFailed = false
  try {
    await readZip(file, 'wrong-password')
  } catch {
    wrongFailed = true
  }
  if (!wrongFailed) throw new Error('zipcrypto opened with wrong password')
  ok('ZIP legacy ZipCrypto create/extract', `${entries.length} entries`)
  await page.close()
} catch (error) {
  fail('ZIP ZipCrypto', error)
}

// ---------- password mismatch validation ----------
try {
  const page = await open('/compress', '압축 만들기')
  await page.locator('.dropzone input[type=file]').first().setInputFiles([UPLOAD[0]])
  await page.waitForFunction(() => document.querySelectorAll('.file-row').length === 1)
  await page.locator('.toggle-row').filter({ hasText: '비밀번호 설정' }).click()
  await page.locator('input[aria-label="비밀번호"]').fill('first-password')
  await page.locator('input[aria-label="비밀번호 확인"]').fill('second-password')
  await page.getByRole('button', { name: /ZIP로 압축하기/ }).click()
  await page.waitForSelector('.alert', { timeout: 15000 })
  const message = await page.locator('.alert').first().innerText()
  if (!/일치하지 않습니다/.test(message)) throw new Error('unexpected: ' + message)
  if (await page.getByRole('button', { name: '다운로드', exact: true }).count()) {
    throw new Error('archive created despite mismatch')
  }
  ok('Password confirmation mismatch blocks archive')
  await page.close()
} catch (error) {
  fail('Password validation', error)
}

// ---------- plain GZ keeps original file name ----------
try {
  const { gzipSync } = await import('node:zlib')
  const gzPath = path.join(FIX, '안내문.txt.gz')
  fs.writeFileSync(gzPath, gzipSync(Buffer.from('Dtools gzip 테스트 내용\n', 'utf8')))
  const page = await open('/extract', '압축 풀기')
  await page.locator('.dropzone input[type=file]').setInputFiles(gzPath)
  await page.waitForSelector('.file-row')
  await page.getByRole('button', { name: '압축 풀기', exact: true }).click()
  await page.waitForSelector('text=압축을 풀었습니다', { timeout: 60000 })
  const rows = await page.locator('.result-file .result-name').allInnerTexts()
  if (!rows.includes('안내문.txt')) throw new Error('gzip name: ' + rows.join(','))
  const file = await downloadFrom(page, () => page.getByRole('button', { name: '다운로드', exact: true }).click())
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes('gzip 테스트')) throw new Error('gzip content: ' + text)
  ok('GZ extract keeps original file name + content', rows.join(','))
  await page.close()
} catch (error) {
  fail('GZ extract', error)
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('problems:', problems.length ? problems : 'none')
fs.writeFileSync(path.join(OUT, 'archives-summary.json'), JSON.stringify({ results, problems }, null, 2))
await browser.close()
process.exit(results.some((r) => !r.ok) || problems.length ? 1 : 0)
