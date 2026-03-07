import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeBasePath = (value: string | undefined): string => {
  const raw = value?.trim()
  if (!raw || raw === '/') {
    return '/'
  }

  const trimmed = raw.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

// https://vite.dev/config/
export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
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
