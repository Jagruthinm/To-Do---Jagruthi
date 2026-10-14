import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

type SqlVal = string | number | bigint | null

export const projectsRouter = Router()
projectsRouter.use(requireAuth)

projectsRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const projects = db.prepare(`
      SELECT p.*, COUNT(t.id) AS task_count
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.status = 'pending'
      WHERE p.user_id = ? AND p.archived_at IS NULL
      GROUP BY p.id ORDER BY p.position ASC, p.name ASC
    `).all(userId)
    res.json(projects)
  } finally {
    db.close()
  }
})

projectsRouter.post('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { name, description, color = '#1D9E75', area_id, view_mode = 'list' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

  const db = openDb()
  try {
    const row = db.prepare(`
      INSERT INTO projects (user_id, area_id, name, description, color, view_mode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, area_id ?? null, name.trim(), description ?? null, color, view_mode)
    const project = db.prepare('SELECT * FROM projects WHERE rowid = ?').get(row.lastInsertRowid)
    res.status(201).json(project)
  } finally {
    db.close()
  }
})

projectsRouter.get('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!project) return res.status(404).json({ error: 'Not found' })
    res.json(project)
  } finally {
    db.close()
  }
})

projectsRouter.patch('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const allowed = ['name','description','color','view_mode','position','area_id','archived_at']
    const updates: string[] = ['updated_at = unixepoch()']
    const values: SqlVal[] = []

    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }
    values.push(req.params.id, userId)
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
    res.json(updated)
  } finally {
    db.close()
  }
})

projectsRouter.delete('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const result = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } finally {
    db.close()
  }
})
