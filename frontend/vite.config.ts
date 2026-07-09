import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function serveLocalWidget(backendUrl: string): Plugin {
  return {
    name: 'serve-local-widget',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/widget.js') {
          next()
          return
        }
        const raw = fs.readFileSync(path.resolve(__dirname, 'public/widget.js'), 'utf-8')
        res.setHeader('Content-Type', 'application/javascript')
        res.end(raw.replace(/__BACKEND_URL__/g, backendUrl))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      serveLocalWidget(env.VITE_API_URL || ''),
    ],
  }
})
