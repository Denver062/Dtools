import { chromium } from 'playwright'
import path from 'node:path'
const BASE = 'http://localhost:4317/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
page.on('console', (m) => console.log('console', m.type(), m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(BASE + '#/compress', { waitUntil: 'networkidle' })
await page.waitForSelector('h1')
const folder = page.locator('.dropzone input[webkitdirectory]')
console.log('folder count', await folder.count())
console.log('webkitdirectory attr', await folder.getAttribute('webkitdirectory'))
try {
  await folder.setInputFiles(path.resolve('.e2e/fixtures/tree'))
  console.log('set folder ok')
} catch (e) {
  console.log('folder set failed', e.message)
}
await page.waitForTimeout(1500)
console.log('rows', await page.locator('.file-row').count())
console.log('names', await page.locator('.file-name').allInnerTexts())
console.log('subs', await page.locator('.file-sub').allInnerTexts())
console.log('alerts', await page.locator('.alert').allInnerTexts())
await browser.close()
