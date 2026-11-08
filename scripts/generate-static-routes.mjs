import fs from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const source = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
const routes = [
  {
    path: '/compress',
    title: '압축 만들기 — Dtools',
    description: '파일과 폴더를 브라우저에서 ZIP 또는 7Z로 안전하게 압축합니다.',
  },
  {
    path: '/extract',
    title: '압축 풀기 — Dtools',
    description: 'ZIP, 7Z, TAR, GZ 등 다양한 압축 파일을 브라우저에서 풉니다.',
  },
  {
    path: '/pdf/merge',
    title: 'PDF 합치기 — Dtools',
    description: '여러 PDF 파일을 순서대로 하나의 PDF로 합칩니다.',
  },
  {
    path: '/pdf/split',
    title: 'PDF 나누기 — Dtools',
    description: 'PDF 페이지 범위를 지정해 여러 파일로 나눕니다.',
  },
  {
    path: '/pdf/compress',
    title: 'PDF 압축 — Dtools',
    description: 'PDF 파일을 브라우저에서 무손실 또는 이미지 기반으로 압축합니다.',
  },
  {
    path: '/convert',
    title: '파일 변환 — Dtools',
    description: '이미지, PDF, CSV 파일을 브라우저에서 다양한 형식으로 변환합니다.',
  },
]

for (const route of routes) {
  const canonicalUrl = `https://dtols.duckdns.org${route.path}/`
  const html = source
    .replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${route.description}$2`,
    )
    .replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${canonicalUrl}" />`,
    )
  const target = path.join(dist, route.path.slice(1), 'index.html')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, html)
}
