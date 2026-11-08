import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // 7z-wasm ships a hand-rolled Emscripten bundle with top-level await.
    exclude: ['7z-wasm'],
  },
})
