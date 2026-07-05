import { serve } from '@hono/node-server'
import { handle } from 'hono/aws-lambda'
import app from './src/routes/index.js'

export const handler = handle(app)

if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 3000

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  })
}
