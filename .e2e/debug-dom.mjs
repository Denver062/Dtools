import { chromium } from 'playwright'
import path from 'node:path'
const BASE = 'http://localhost:4317/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('console', (m) => console.log('console', m.type(), m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
page.on('requestfailed', (r) => console.log('requestfailed', r.url(), r.failure()?.errorText))
page.on('response', (r) => { if (r.status() >= 400) console.log('http', r.status(), r.url()) })
await page.goto(BASE + '#/compress', { waitUntil: 'networkidle' })
await page.waitForSelector('h1')
await page.locator('.dropzone input[type=file]').first().setInputFiles([path.resolve('.e2e/fixtures/photo1.png')])
await page.waitForTimeout(1500)
console.log('rail', await page.locator('.rail').count())
console.log('cards', await page.locator('.card').count())
console.log('switch-row', await page.locator('.switch-row').count())
console.log('page text:\n' + (await page.locator('.page').innerText()))
console.log('main html tail:\n' + (await page.locator('.main').innerHTML()).slice(-3000))
await browser.close()
