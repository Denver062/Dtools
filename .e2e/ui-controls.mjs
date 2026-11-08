import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:4317/'
const OUT = path.resolve('.e2e/artifacts')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const externalRequests = []
context.on('request', (request) => {
  const url = request.url()
  if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    externalRequests.push(url)
  }
})
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

function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    return rgb[1].split(',').slice(0, 3).map((v) => Number(v.trim()))
  }
  return null
}

function channel(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

async function tokens() {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const read = (name) => style.getPropertyValue(name).trim()
    return {
      bg: read('--bg'),
      surface: read('--surface'),
      surface2: read('--surface-2'),
      surface3: read('--surface-3'),
      sidebar: read('--sidebar'),
      text: read('--text'),
      textDim: read('--text-dim'),
      textFaint: read('--text-faint'),
      accent: read('--accent'),
      accentInk: read('--accent-ink'),
    }
  })
}

async function checkThemeContrast(theme) {
  if (theme === 'light') {
    await page.getByRole('button', { name: /라이트 모드/ }).click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  } else {
    const light = page.getByRole('button', { name: /다크 모드/ })
    if (await light.count()) {
      await light.click()
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
    }
  }
  const t = await tokens()
  const pairs = [
    ['text/bg', parseColor(t.text), parseColor(t.bg), 4.5],
    ['text-dim/surface', parseColor(t.textDim), parseColor(t.surface), 4.5],
    ['text-faint/surface', parseColor(t.textFaint), parseColor(t.surface), 4.5],
    ['text-faint/surface-2', parseColor(t.textFaint), parseColor(t.surface2), 4.5],
    ['text-faint/surface-3', parseColor(t.textFaint), parseColor(t.surface3), 4.5],
    ['text-faint/sidebar', parseColor(t.textFaint), parseColor(t.sidebar), 4.5],
    ['accent-ink/accent', parseColor(t.accentInk), parseColor(t.accent), 4.5],
  ]
  const detail = []
  for (const [name, fg, bg, min] of pairs) {
    if (!fg || !bg) throw new Error(`${name}: unparsable color`)
    const ratio = contrast(fg, bg)
    if (ratio < min) throw new Error(`${name} contrast ${ratio.toFixed(2)} < ${min}`)
    detail.push(`${name} ${ratio.toFixed(1)}`)
  }
  ok(`${theme} theme contrast`, detail.join(', '))
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('파일은 여기서'))

try {
  // fonts + shell geometry
  await page.evaluate(() => document.fonts.ready)
  const shell = await page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const topbarEl = document.querySelector('.topbar')
    const topbar = topbarEl.getBoundingClientRect()
    const topbarStyle = getComputedStyle(topbarEl)
    const main = document.querySelector('.main').getBoundingClientRect()
    const nav = document.querySelector('.nav')
    const navRect = nav ? nav.getBoundingClientRect() : null
    return {
      family: body.fontFamily,
      fontStatus: document.fonts.status,
      pretendardReady: document.fonts.check('16px "Pretendard Variable"'),
      topbar: {
        x: topbar.x,
        y: topbar.y,
        width: topbar.width,
        height: topbar.height,
        position: topbarStyle.position,
        display: topbarStyle.display,
      },
      main: { x: main.x, width: main.width },
      navVisible: Boolean(navRect && navRect.width > 300 && navRect.height < 60),
      sidebarPresent: Boolean(document.querySelector('.sidebar')),
      viewport: window.innerWidth,
      title: document.title,
    }
  })
  if (!/Pretendard/.test(shell.family)) throw new Error('Pretendard not in font stack: ' + shell.family)
  if (!shell.pretendardReady) throw new Error('Pretendard webfont not ready (status ' + shell.fontStatus + ')')
  if (shell.sidebarPresent) throw new Error('sidebar should be replaced by the top bar')
  if (shell.topbar.display === 'none') throw new Error('desktop top bar is hidden')
  if (shell.topbar.position !== 'sticky') throw new Error('top bar should be sticky, got ' + shell.topbar.position)
  if (shell.topbar.height < 50) throw new Error('top bar height ' + shell.topbar.height)
  if (Math.abs(shell.topbar.width - shell.viewport) > 2 || shell.topbar.x !== 0) {
    throw new Error('top bar must span the viewport: ' + JSON.stringify(shell.topbar))
  }
  if (Math.abs(shell.main.x) > 2) throw new Error('main should not be offset: ' + JSON.stringify(shell.main))
  if (!shell.navVisible) throw new Error('top bar navigation not visible')
  ok('Font + desktop top bar geometry', `${shell.topbar.height}px top bar, font ${shell.fontStatus}`)

  await checkThemeContrast('dark')
  await checkThemeContrast('light')
  await checkThemeContrast('dark')
} catch (error) {
  fail('Shell/font/contrast', error)
}

// controls on the compress page
try {
  await page.evaluate(() => { window.location.hash = '/compress' })
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('압축 만들기'))

  const passwordRow = page.locator('.toggle-row').filter({ hasText: '비밀번호 설정' })
  const input = passwordRow.locator('.toggle-input')
  const track = passwordRow.locator('.toggle-track')
  if ((await passwordRow.count()) !== 1) throw new Error('password toggle row missing')

  const inputBox = await input.boundingBox()
  const trackBox = await track.boundingBox()
  if (!inputBox || inputBox.width > 2 || inputBox.height > 2) {
    throw new Error('checkbox input should be visually clipped: ' + JSON.stringify(inputBox))
  }
  if (!trackBox || Math.abs(trackBox.width - 36) > 2 || Math.abs(trackBox.height - 20) > 2) {
    throw new Error('toggle track size ' + JSON.stringify(trackBox))
  }
  if (await input.isChecked()) throw new Error('password toggle starts checked')

  const before = await track.evaluate((el) => getComputedStyle(el).backgroundColor)
  await passwordRow.click()
  await page.waitForTimeout(260)
  if (!(await input.isChecked())) throw new Error('label click did not check toggle')
  const after = await track.evaluate((el) => getComputedStyle(el).backgroundColor)
  const accent = parseColor((await tokens()).accent)
  if (!/rgb/.test(after)) throw new Error('toggle track has no background: ' + after)
  const afterRgb = parseColor(after)
  if (Math.abs(afterRgb[0] - accent[0]) > 2 || Math.abs(afterRgb[1] - accent[1]) > 2 || Math.abs(afterRgb[2] - accent[2]) > 2) {
    throw new Error(`checked track not accent: ${after} vs ${accent}`)
  }
  if (before === after) throw new Error('toggle track did not change on check')
  if ((await page.locator('input[aria-label="비밀번호"]').count()) !== 1) {
    throw new Error('password field did not appear')
  }
  ok('Toggle control (checkbox DOM, 36×20 track, accent when checked)', `${before} → ${after}`)

  // advanced panel starts closed and reveals its body
  const advanced = page.getByRole('button', { name: '고급 압축 설정' })
  if ((await advanced.getAttribute('aria-expanded')) !== 'false') throw new Error('advanced should start collapsed')
  if (await page.locator('.advanced-box-body').count()) throw new Error('advanced body visible while collapsed')
  await advanced.click()
  if ((await advanced.getAttribute('aria-expanded')) !== 'true') throw new Error('advanced did not expand')
  const level = page.getByRole('radiogroup', { name: '압축 수준' })
  if ((await level.count()) !== 1) throw new Error('compression level radiogroup missing')
  if ((await level.getByRole('radio').count()) !== 4) throw new Error('compression level should have 4 options')
  const levelBox = await level.boundingBox()
  if (!levelBox || levelBox.height < 26) throw new Error('level radiogroup too small')
  ok('Advanced panel collapse/expand reveals level radiogroup')

  // segmented radio group updates the active state and primary action
  const format = page.getByRole('radiogroup', { name: '압축 형식' })
  if ((await format.count()) !== 1) throw new Error('format radiogroup missing')
  const zip = format.getByRole('radio', { name: 'ZIP', exact: true })
  const seven = format.getByRole('radio', { name: '7Z', exact: true })
  if ((await zip.getAttribute('aria-checked')) !== 'true') throw new Error('ZIP should be active')
  const itemBox = await zip.boundingBox()
  if (!itemBox || itemBox.height < 26) throw new Error('segmented item too small')
  await seven.click()
  if ((await seven.getAttribute('aria-checked')) !== 'true') throw new Error('7Z radio not active after click')
  if ((await zip.getAttribute('aria-checked')) !== 'false') throw new Error('ZIP still active')
  const primary = page.getByRole('button', { name: /7Z로 압축하기/ })
  if ((await primary.count()) !== 1) throw new Error('primary action did not follow format')
  const primaryBg = await primary.evaluate((el) => getComputedStyle(el).backgroundColor)
  if (!parseColor(primaryBg)) throw new Error('primary button background missing')
  ok('Segmented radiogroup (ARIA state + action label)', `7Z item ${Math.round(itemBox.width)}×${Math.round(itemBox.height)}`)

  // 7Z + password reveals the header-encryption toggle inside advanced settings
  const header = page.locator('.toggle-row').filter({ hasText: '파일 목록(이름)도 암호화' })
  if ((await header.count()) !== 1) throw new Error('header encryption toggle missing for 7Z + password')
  const headerInput = header.locator('.toggle-input')
  await header.click()
  if (!(await headerInput.isChecked())) throw new Error('header encryption toggle did not check')

  const card = page.locator('.rail .card').first()
  const cardBox = await card.boundingBox()
  const headerBox = await header.boundingBox()
  if (!cardBox || !headerBox || headerBox.x + headerBox.width > cardBox.x + cardBox.width + 1) {
    throw new Error('header toggle overflows rail card')
  }
  await page.screenshot({ path: path.join(OUT, 'ui-controls-compress.png'), fullPage: true })
  ok('Header-encryption toggle stays inside rail')
} catch (error) {
  fail('Compress controls', error)
}

// control presence on every tool page
try {
  const pages = [
    ['/extract', '압축 풀기', '.dropzone'],
    ['/pdf/merge', 'PDF 합치기', '.dropzone'],
    ['/pdf/split', 'PDF 나누기', '.segmented'],
    ['/pdf/compress', 'PDF 압축', '.mode-card'],
    ['/convert', '파일 변환', '.settings-summary'],
  ]
  for (const [route, heading, selector] of pages) {
    await page.evaluate((r) => { window.location.hash = r }, route)
    await page.waitForFunction((h) => document.querySelector('h1')?.textContent?.includes(h), heading)
    if (!(await page.locator(selector).count())) throw new Error(`${selector} missing on ${route}`)
  }
  ok('All tool pages render expected key controls')
} catch (error) {
  fail('Tool page controls', error)
}

// local-only runtime: no third-party network requests (fonts, CDNs, analytics)
try {
  if (externalRequests.length) {
    throw new Error('external requests: ' + [...new Set(externalRequests)].join(', '))
  }
  ok('No external network requests (fully local UI)')
} catch (error) {
  fail('Local-only runtime', error)
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log('problems:', problems.length ? problems : 'none')
fs.writeFileSync(path.join(OUT, 'ui-controls-summary.json'), JSON.stringify({ results, problems }, null, 2))
await browser.close()
process.exit(results.some((r) => !r.ok) || problems.length ? 1 : 0)
