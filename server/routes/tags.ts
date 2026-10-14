import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

export const tagsRouter = Router()
tagsRouter.use(requireAuth)

tagsRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    res.json(db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC').all(userId))
  } finally {
    db.close()
  }
})

tagsRouter.post('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { name, color = '#888780' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
  const db = openDb()
  try {
    const existing = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(userId, name.trim())
    if (existing) return res.status(409).json({ error: 'Tag already exists' })
    const row = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, name.trim(), color)
    res.status(201).json(db.prepare('SELECT * FROM tags WHERE rowid = ?').get(row.lastInsertRowid))
  } finally {
    db.close()
  }
})

