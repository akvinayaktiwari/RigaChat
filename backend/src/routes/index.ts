import { Hono } from 'hono'
import { botRoutes } from './bot-routes.js'
import { chatRoutes } from './chat-routes.js'
import { clientRoutes } from './client-routes.js'
import { kbRoutes } from './kb-routes.js'
import { leadRoutes } from './lead-routes.js'
import type { ApiResponse } from '../types/index.js'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  })
})

app.route('/api/bots', botRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api/leads', leadRoutes)
app.route('/api/kb', kbRoutes)
app.route('/api/clients', clientRoutes)

app.notFound((c) => {
  return c.json<ApiResponse<null>>({
    success: false,
    error: 'Route not found',
  }, 404)
})

app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json<ApiResponse<null>>({
    success: false,
    error: 'Internal server error',
  }, 500)
})

export default app
