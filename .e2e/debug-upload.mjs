import { chromium } from 'playwright'
import path from 'node:path'
const BASE = 'http://localhost:4317/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('console', (m) => console.log('console', m.type(), m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(BASE + '#/compress', { waitUntil: 'networkidle' })
await page.waitForSelector('h1')
console.log('h1', await page.locator('h1').innerText())
console.log('inputs', await page.locator('.dropzone input[type=file]').count())
await page.locator('.dropzone input[type=file]').first().setInputFiles([path.resolve('.e2e/fixtures/photo1.png'), path.resolve('.e2e/fixtures/photo2.jpg')])
await page.waitForTimeout(1500)
console.log('rows', await page.locator('.file-row').count())
console.log('alerts', await page.locator('.alert').allInnerTexts())
console.log('body excerpt', (await page.locator('.page').innerText()).slice(0, 400))
await page.screenshot({ path: '.e2e/artifacts/debug-upload.png', fullPage: true })
await browser.close()
