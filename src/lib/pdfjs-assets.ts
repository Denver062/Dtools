import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let configured = false

/**
 * pdf.js needs its worker plus CMaps (for older CJK PDFs) and the standard
 * font data. All of them are served from our own origin — nothing is uploaded.
 */
export function pdfjsAssets() {
  if (!configured) {
    GlobalWorkerOptions.workerSrc = workerUrl
    configured = true
  }
  const base = new URL('pdfjs/', document.baseURI).href
  return {
    cMapUrl: `${base}cmaps/`,
    standardFontDataUrl: `${base}standard_fonts/`,
  }
}
