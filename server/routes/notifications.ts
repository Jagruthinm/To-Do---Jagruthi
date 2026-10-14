import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const notifications = db.prepare(`
      SELECT n.*, t.title AS task_title
      FROM notifications n
      LEFT JOIN tasks t ON t.id = n.task_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all(userId)
    res.json(notifications)
  } finally {
    db.close()
  }
})

notificationsRouter.patch('/:id/read', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const result = db.prepare(
      'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'
    ).run(req.params.id, userId)
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

notificationsRouter.patch('/read-all', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

notificationsRouter.delete('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const result = db.prepare(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?'
    ).run(req.params.id, userId)
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } finally {
    db.close()
  }
})
