import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In production Express injects window.__WEEK_START_DOW__ into index.html (see
// server/index.js). The dev server serves index.html directly and would otherwise
// always fall back to Monday, so mirror the injection here by reading WEEK_START
// from the repo-root .env — otherwise a Sunday-start install is untestable in dev.
function injectWeekStart(mode) {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const dow = String(env.WEEK_START || '').trim().toLowerCase().startsWith('sun') ? 0 : 1
  return {
    name: 'inject-week-start',
    // Dev server only. In a build this would bake the build machine's value into
    // dist/index.html, and since Express prepends its script tag the baked one
    // would evaluate last and win — silently overriding the real install setting.
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><script>window.__WEEK_START_DOW__=${dow};</script>`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), injectWeekStart(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
}))
