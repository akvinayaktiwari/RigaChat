import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  })
})

export default app
