import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.message.includes(
            "new URL('MediaInfoModule.wasm', import.meta.url) doesn't exist at build time",
          )
        ) {
          return
        }

        warn(warning)
      },
    },
  },
})
