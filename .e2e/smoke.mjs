import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:4317/'
const OUT = path.resolve('.e2e/artifacts')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()

const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(OUT, 'home.png'), fullPage: true })
console.log('title:', await page.title())
console.log('h1:', await page.locator('h1').first().innerText())
console.log('links:', await page.locator('a[href^="/"]').allInnerTexts())

for (const route of [
  '/compress/',
  '/extract/',
  '/pdf/merge/',
  '/pdf/split/',
  '/pdf/compress/',
  '/convert/',
]) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  const h1 = await page.locator('h1').first().innerText()
  console.log(route, '→', h1)
}

console.log('problems:', problems.length ? problems : 'none')
await browser.close()
