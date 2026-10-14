import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'node:path'
import { authRouter } from './routes/auth.js'
import { tasksRouter } from './routes/tasks.js'
import { projectsRouter } from './routes/projects.js'
import { habitsRouter } from './routes/habits.js'
import { areasRouter } from './routes/areas.js'
import { tagsRouter } from './routes/tags.js'
import { statsRouter } from './routes/stats.js'
import { chatRouter } from './routes/chat.js'
import { reportsRouter } from './routes/reports.js'
import { notificationsRouter } from './routes/notifications.js'

const IS_PROD = process.env.NODE_ENV === 'production'
// process.cwd() is always the project root when launched via npm scripts
const DIST = path.join(process.cwd(), 'dist')

export const app = express()
app.use(express.json())

if (IS_PROD) {
  app.use(express.static(DIST))
} else {
  app.use((req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173'
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

app.use('/auth', authRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/habits', habitsRouter)
app.use('/api/areas', areasRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/stats', statsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/notifications', notificationsRouter)

app.get('/api/health', (_, res) => res.json({ ok: true }))

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  if (res.headersSent) return
  res.status(500).json({ error: 'Internal server error' })
})

if (IS_PROD) {
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')))
}
