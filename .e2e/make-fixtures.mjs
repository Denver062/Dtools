import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs'
import path from 'node:path'

fs.mkdirSync('.e2e/fixtures', { recursive: true })

async function makePdf(file, pages, label) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842])
    page.drawRectangle({ x: 0, y: 700, width: 595, height: 142, color: rgb(0.06, 0.09, 0.08) })
    page.drawText(`${label}`, { x: 48, y: 780, size: 26, font: bold, color: rgb(0.75, 1, 0.3) })
    page.drawText(`Page ${i} of ${pages}`, { x: 48, y: 730, size: 16, font, color: rgb(0.85, 0.88, 0.85) })
    page.drawText(`This is sample content for ${label}, page ${i}.`, {
      x: 48,
      y: 640,
      size: 13,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })
    for (let line = 0; line < 8; line++) {
      page.drawText(`Line ${line + 1}: lorem ipsum dolor sit amet, consectetur adipiscing elit.`, {
        x: 48,
        y: 600 - line * 22,
        size: 10,
        font,
        color: rgb(0.25, 0.25, 0.25),
      })
    }
  }
  fs.writeFileSync(file, await doc.save())
  console.log(file, fs.statSync(file).size)
}

await makePdf('.e2e/fixtures/alpha-3p.pdf', 3, 'Alpha Report')
await makePdf('.e2e/fixtures/beta-2p.pdf', 2, 'Beta Notes')
await makePdf('.e2e/fixtures/gamma-5p.pdf', 5, 'Gamma Manual')

// folder fixture for archive structure
const folder = '.e2e/fixtures/tree'
fs.mkdirSync(path.join(folder, '문서'), { recursive: true })
fs.mkdirSync(path.join(folder, 'images'), { recursive: true })
fs.writeFileSync(path.join(folder, '문서', '메모.txt'), 'Dtools 한글 파일명 테스트\n빈 폴더 보존 확인\n', 'utf8')
fs.writeFileSync(path.join(folder, '문서', 'readme.txt'), 'nested file\n', 'utf8')
console.log('fixtures ready')
