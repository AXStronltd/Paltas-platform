import http from 'node:http'
import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'
import { env } from './env.js'
import { api } from './routes/index.js'
import { attachRealtime } from './realtime.js'

const app = express()

app.use(cors({ origin: env.corsOrigin.split(',').map((o) => o.trim()), credentials: true }))
// Base64 document uploads ride in the JSON body, so the limit has to clear
// the 8 MB file cap with room for encoding overhead.
app.use(express.json({ limit: '12mb' }))

// One line per request — enough to see what the UI is doing without a log library.
app.use((req, _res, next) => {
  if (req.path !== '/api/health') console.log(`${req.method} ${req.originalUrl}`)
  next()
})

app.use('/api', api)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Zod failures are the client's fault (400); anything else is ours (500).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', issues: err.issues })
  }
  console.error(err)
  return res.status(500).json({ error: 'Internal server error' })
})

const server = http.createServer(app)
attachRealtime(server)

server.listen(env.port, () => {
  console.log(`\n  PALTAS API   http://localhost:${env.port}/api`)
  console.log(`  Realtime     ws://localhost:${env.port}/live`)
  console.log(`  Database     ${env.databaseUrl}`)
  console.log(`  CORS origin  ${env.corsOrigin}\n`)
})

const shutdown = () => { server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
