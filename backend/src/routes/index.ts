import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { botRoutes } from './bot-routes.js'
import { chatRoutes } from './chat-routes.js'
import { clientRoutes } from './client-routes.js'
import { kbRoutes } from './kb-routes.js'
import { leadRoutes } from './lead-routes.js'
import type { ApiResponse } from '../types/index.js'

export const app = new Hono()

// Config 1: CRM dashboard routes — strict origin, credentials allowed.
const dashboardCors = cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
})

// Config 2: widget routes — called from any client website, so origin is wildcard.
const widgetCors = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 86400,
})

app.use('/api/clients/*', dashboardCors)
app.use('/api/leads/*', dashboardCors)
app.use('/api/kb/*', dashboardCors)

app.use('/api/chat/*', widgetCors)

// /api/bots/public/:botId must get widgetCors ONLY — never dashboardCors.
// Hono's cors() middleware only sets headers, it never clears them, so if both
// middlewares ran on this path (as two overlapping app.use('/api/bots/*', ...)
// registrations would), dashboardCors's Access-Control-Allow-Credentials: true
// would leak onto this wildcard-origin, unauthenticated route. Dispatching to
// exactly one cors config per request avoids that entirely.
app.use('/api/bots/*', (c, next) => {
  const corsMiddleware = c.req.path.startsWith('/api/bots/public/') ? widgetCors : dashboardCors
  return corsMiddleware(c, next)
})

app.options('*', (c) => c.body(null, 204))

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
