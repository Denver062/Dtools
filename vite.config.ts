import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Dtools/', // './' 대신 깃허브 레포지토리 이름을 앞뒤로 슬래시를 붙여 적어줍니다.
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['7z-wasm'],
  },
})

