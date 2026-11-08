import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:4317/'
const OUT = path.resolve('.e2e/artifacts')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
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

const page = await context.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))

async function overflow(name) {
  const data = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScroll: document.body.scrollWidth,
  }))
  if (data.scrollWidth > data.innerWidth + 1) {
    throw new Error(`${name} horizontal overflow ${data.scrollWidth} > ${data.innerWidth}`)
  }
  return `${data.scrollWidth}/${data.innerWidth}`
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('파일은 여기서'))
try {
  ok('Desktop home width', await overflow('home'))
  await page.screenshot({ path: path.join(OUT, 'visual-home-dark.png'), fullPage: true })

  // theme toggle
  await page.getByRole('button', { name: /라이트 모드/ }).click()
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  if (theme !== 'light') throw new Error('theme not applied: ' + theme)
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(OUT, 'visual-home-light.png'), fullPage: true })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelector('h1'))
  const persisted = await page.evaluate(() => document.documentElement.dataset.theme)
  if (persisted !== 'light') throw new Error('theme not persisted')
  ok('Theme toggle + persistence', persisted)

  // in-app navigation via top bar
  await page.getByRole('navigation', { name: '도구 목록' }).getByRole('link', { name: '파일 변환' }).click()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('파일 변환'))
  const title = await page.title()
  if (!title.includes('파일 변환')) throw new Error('document.title not updated: ' + title)
  await page.screenshot({ path: path.join(OUT, 'visual-convert-light.png'), fullPage: true })
  ok('Top bar navigation + document title', title)

  // all routes render and do not overflow
  for (const [route, heading] of [
    ['/compress', '압축 만들기'],
    ['/extract', '압축 풀기'],
    ['/pdf/merge', 'PDF 합치기'],
    ['/pdf/split', 'PDF 나누기'],
    ['/pdf/compress', 'PDF 압축'],
    ['/convert', '파일 변환'],
  ]) {
    await page.evaluate((r) => { window.location.hash = r }, route)
    await page.waitForFunction((h) => document.querySelector('h1')?.textContent?.includes(h), heading)
    const width = await overflow(route)
    await page.screenshot({ path: path.join(OUT, `visual-${route.replace(/\//g, '_')}-light.png`), fullPage: true })
    ok(`Route ${route}`, width)
  }

  // 404
  await page.evaluate(() => { window.location.hash = '/does-not-exist' })
  await page.waitForSelector('text=페이지를 찾을 수 없습니다')
  ok('404 route')

  // back to dark for mobile gallery
  await page.evaluate(() => { window.location.hash = '/' })
  await page.waitForFunction(() => document.querySelector('h1'))
  await page.getByRole('button', { name: /다크 모드/ }).click()
} catch (error) {
  fail('Desktop visual/functional checks', error)
}

// mobile
const mobile = await context.newPage()
mobile.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[mobile] console: ${msg.text()}`)
})
mobile.on('pageerror', (err) => problems.push(`[mobile] pageerror: ${err.message}`))
try {
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(BASE, { waitUntil: 'networkidle' })
  await mobile.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('파일은 여기서'))
  const w = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  if (!w) throw new Error('mobile home overflow')
  await mobile.screenshot({ path: path.join(OUT, 'visual-mobile-home.png'), fullPage: true })

  await mobile.getByRole('button', { name: '메뉴 열기' }).click()
  await mobile.waitForSelector('.drawer.is-open')
  await mobile.screenshot({ path: path.join(OUT, 'visual-mobile-drawer.png') })
  await mobile.getByRole('navigation', { name: '도구 목록' }).getByRole('link', { name: '압축 만들기' }).click()
  await mobile.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('압축 만들기'))
  const drawerClosed = await mobile.locator('.drawer.is-open').count()
  if (drawerClosed) throw new Error('drawer stayed open after navigation')
  const ow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  if (!ow) throw new Error('mobile compress overflow')
  await mobile.screenshot({ path: path.join(OUT, 'visual-mobile-compress.png'), fullPage: true })
  ok('Mobile layout (390px) + drawer', 'no horizontal overflow')

  await mobile.setViewportSize({ width: 360, height: 800 })
  for (const route of ['/', '/compress', '/pdf/compress', '/convert']) {
    await mobile.evaluate((r) => { window.location.hash = r }, route)
    await mobile.waitForTimeout(400)
    const fits = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    if (!fits) throw new Error(`360px overflow on ${route}`)
  }
  ok('Mobile layout at 360px across routes')
} catch (error) {
  fail('Mobile visual checks', error)
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('problems:', problems.length ? problems : 'none')
fs.writeFileSync(path.join(OUT, 'visual-summary.json'), JSON.stringify({ results, problems }, null, 2))
await browser.close()
process.exit(results.some((r) => !r.ok) || problems.length ? 1 : 0)
