import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { openDb } from '../../db/migrate.js'
import { hashPassword, comparePassword, createSession, deleteSession } from '../auth.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

export const authRouter = Router()

const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Too many attempts, try again in a minute.' } })

authRouter.post('/register', loginLimiter, async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password are required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' })

  const db = openDb()
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' })

    const passwordHash = await hashPassword(password)
    db.prepare(`INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)`)
      .run(email.toLowerCase(), name.trim(), passwordHash)

    const user = db.prepare('SELECT id, email, name, avatar_url, theme FROM users WHERE email = ?').get(email.toLowerCase()) as
      { id: string; email: string; name: string; avatar_url?: string; theme: string }
    const token = createSession(db, user.id)

    res.status(201).json({ token, user })
  } finally {
    db.close()
  }
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

  const db = openDb()
  try {
    const user = db.prepare('SELECT id, email, name, password_hash, avatar_url, theme FROM users WHERE email = ?').get(email.toLowerCase()) as
      { id: string; email: string; name: string; password_hash: string; avatar_url?: string; theme: string } | undefined

    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    const token = createSession(db, user.id)
    const { password_hash: _, ...safeUser } = user
    res.json({ token, user: safeUser })
  } finally {
    db.close()
  }
})

authRouter.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization!.slice(7)
  const db = openDb()
  try {
    deleteSession(db, token)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json((req as AuthRequest).user)
})
