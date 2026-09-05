import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    // Proxy in dev so the browser sees one origin and CORS never enters the picture.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/live': { target: 'ws://localhost:4000', ws: true },
    },
  },
})
