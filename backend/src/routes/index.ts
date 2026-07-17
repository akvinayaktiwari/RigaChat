import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './auth-routes.js'
import { botRoutes } from './bot-routes.js'
import { chatRoutes } from './chat-routes.js'
import { clientRoutes } from './client-routes.js'
import { formRoutes } from './form-routes.js'
import { integrationRoutes } from './integration-routes.js'
import { kbRoutes } from './kb-routes.js'
import { leadRoutes } from './lead-routes.js'
import { voiceRoutes } from './voice-routes.js'
import { webhookRoutes } from './webhooks.js'
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
app.use('/api/kb/*', dashboardCors)
app.use('/api/integrations/*', dashboardCors)
// /api/auth/confirm is called by the dashboard frontend right after signup,
// before the user has a token — public, but still dashboard-origin only, not
// the wildcard widget origin.
app.use('/api/auth/*', dashboardCors)

app.use('/api/chat/*', widgetCors)

// POST /api/leads (exact path, no auth) is the public lead-capture endpoint
// widget.js calls from any client's external website — it must get widgetCors.
// The nested GET routes (/bot/:botId, /all, /:botId/:leadId) are dashboard-only
// and require auth, so they keep the strict dashboardCors. Same single-dispatch
// pattern as /api/bots/* above, for the same reason (cors() only sets headers,
// never clears them).
app.use('/api/leads/*', (c, next) => {
  const corsMiddleware = c.req.path === '/api/leads' ? widgetCors : dashboardCors
  return corsMiddleware(c, next)
})

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

// /api/forms/public/:formId and /api/forms/leads are called by form-widget.js from
// any client's external website, so they need widgetCors. Every other /api/forms/*
// route is dashboard-only. Same single-dispatch pattern as /api/bots/* above.
app.use('/api/forms/*', (c, next) => {
  const isPublicRoute = c.req.path.startsWith('/api/forms/public/') || c.req.path === '/api/forms/leads'
  const corsMiddleware = isPublicRoute ? widgetCors : dashboardCors
  return corsMiddleware(c, next)
})

// /api/voice-agents/public/:id and the session start/end routes are called by
// the voice widget from any client's external website, so they need widgetCors.
// Every other /api/voice-agents/* route is dashboard-only. Same single-dispatch
// pattern as /api/bots/* and /api/forms/* above.
app.use('/api/voice-agents/*', (c, next) => {
  const isPublicRoute =
    c.req.path.startsWith('/api/voice-agents/public/') ||
    c.req.path.startsWith('/api/voice-agents/context/') ||
    /^\/api\/voice-agents\/[^/]+\/session(\/[^/]+)?$/.test(c.req.path) ||
    c.req.path === '/api/voice-agents/token'
  const corsMiddleware = isPublicRoute ? widgetCors : dashboardCors
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

app.route('/api/auth', authRoutes)
app.route('/api/bots', botRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api/leads', leadRoutes)
app.route('/api/kb', kbRoutes)
app.route('/api/clients', clientRoutes)
app.route('/api/forms', formRoutes)
app.route('/api/integrations', integrationRoutes)
app.route('/api/voice-agents', voiceRoutes)
app.route('/api/webhooks', webhookRoutes)

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
