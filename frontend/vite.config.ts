import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const LOCAL_WIDGET_FILES: Record<string, string> = {
  '/widget.js': 'public/widget.js',
  '/form-widget.js': 'public/form-widget.js',
  '/voice-widget.js': 'public/voice-widget.js',
}

function serveLocalWidget(backendUrl: string, voiceWsUrl: string): Plugin {
  return {
    name: 'serve-local-widget',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const relativePath = req.url ? LOCAL_WIDGET_FILES[req.url] : undefined
        if (!relativePath) {
          next()
          return
        }
        const raw = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf-8')
        res.setHeader('Content-Type', 'application/javascript')
        res.end(raw.replace(/__BACKEND_URL__/g, backendUrl).replace(/__WS_URL__/g, voiceWsUrl))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      // Before react(): the JSX that MDX compiles to still has to go through
      // the React plugin, and `enforce: 'pre'` is what puts it there first.
      { enforce: 'pre', ...mdx({ providerImportSource: '@mdx-js/react', remarkPlugins: [remarkGfm] }) },
      react(),
      tailwindcss(),
      serveLocalWidget(env.VITE_API_URL || '', env.VITE_VOICE_WS_URL || ''),
    ],
  }
})
