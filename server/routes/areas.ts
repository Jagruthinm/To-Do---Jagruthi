import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

type SqlVal = string | number | bigint | null

export const areasRouter = Router()
areasRouter.use(requireAuth)

areasRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const areas = db.prepare(`
      SELECT a.*, COUNT(p.id) AS project_count
      FROM areas a
      LEFT JOIN projects p ON p.area_id = a.id AND p.archived_at IS NULL
      WHERE a.user_id = ? AND a.archived_at IS NULL
      GROUP BY a.id ORDER BY a.position ASC, a.name ASC
    `).all(userId) as Array<Record<string, unknown> & { id: string }>

    const result = areas.map(area => {
      const projects = db.prepare(`
        SELECT p.id, p.name, p.color, p.view_mode, COUNT(t.id) AS task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'pending'
        WHERE p.area_id = ? AND p.archived_at IS NULL
        GROUP BY p.id ORDER BY p.position ASC
      `).all(area.id)
      return { ...area, projects }
    })

    res.json(result)
  } finally {
    db.close()
  }
})

areasRouter.post('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { name, color = '#888780', icon = 'circle' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

  const db = openDb()
  try {
    const row = db.prepare(`INSERT INTO areas (user_id, name, color, icon) VALUES (?, ?, ?, ?)`)
      .run(userId, name.trim(), color, icon)
    const area = db.prepare('SELECT * FROM areas WHERE rowid = ?').get(row.lastInsertRowid)
    res.status(201).json(area)
  } finally {
    db.close()
  }
})

areasRouter.patch('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const existing = db.prepare('SELECT * FROM areas WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const allowed = ['name', 'color', 'icon', 'position', 'archived_at']
    const updates = ['updated_at = unixepoch()']
    const values: SqlVal[] = []
    for (const key of allowed) {
      if (key in req.body) { updates.push(`${key} = ?`); values.push(req.body[key]) }
    }
    values.push(req.params.id, userId)
    db.prepare(`UPDATE areas SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
    res.json(db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id))
  } finally {
    db.close()
  }
})

areasRouter.delete('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const r = db.prepare('DELETE FROM areas WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    if (r.changes === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } finally {
    db.close()
  }
})
