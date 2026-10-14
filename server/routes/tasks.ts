import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'
import { cancelTaskNotifications, rescheduleTaskNotifications } from '../lib/notificationScheduler.js'

type SqlVal = string | number | bigint | null

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

tasksRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { view, project_id, due_date, status, tag } = req.query as Record<string, string>
  const db = openDb()
  try {
    let sql = `
      SELECT t.*, p.name AS project_name, p.color AS project_color,
             GROUP_CONCAT(tg.name, ',') AS tag_names
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN task_tags tt ON tt.task_id = t.id
      LEFT JOIN tags tg ON tg.id = tt.tag_id
      WHERE t.user_id = ?
    `
    const params: SqlVal[] = [userId]

    if (view === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      sql += ` AND (t.due_date <= ? OR t.planned_date = ?) AND t.status != 'completed'`
      params.push(today, today)
    } else if (view === 'inbox') {
      sql += ` AND t.project_id IS NULL AND t.status != 'completed'`
    } else {
      if (project_id) { sql += ` AND t.project_id = ?`; params.push(project_id) }
      if (due_date)   { sql += ` AND t.due_date = ?`;   params.push(due_date) }
      if (status)     { sql += ` AND t.status = ?`;     params.push(status) }
      if (tag) {
        sql += ` AND EXISTS (
          SELECT 1 FROM task_tags tt2
          JOIN tags tg2 ON tg2.id = tt2.tag_id
          WHERE tt2.task_id = t.id AND tg2.name = ?
        )`
        params.push(tag)
      }
    }

    sql += ` GROUP BY t.id ORDER BY t.position ASC, t.created_at ASC`

    const tasks = db.prepare(sql).all(...params)
    res.json(tasks)
  } finally {
    db.close()
  }
})

tasksRouter.get('/search', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { q } = req.query as { q?: string }
  if (!q?.trim()) return res.json([])
  const db = openDb()
  try {
    const term = `%${q.trim()}%`
    const tasks = db.prepare(`
      SELECT t.*, p.name AS project_name FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ? AND (t.title LIKE ? OR t.notes LIKE ?) AND t.status != 'completed'
      ORDER BY t.due_date ASC, t.priority ASC LIMIT 50
    `).all(userId, term, term)
    res.json(tasks)
  } finally {
    db.close()
  }
})

tasksRouter.patch('/reorder', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { items } = req.body as { items: { id: string; position: number }[] }
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' })
  const db = openDb()
  try {
    const update = db.prepare('UPDATE tasks SET position = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?')
    for (const { id, position } of items) update.run(position, id, userId)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

tasksRouter.get('/upcoming', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(); future.setDate(future.getDate() + 14)
    const futureStr = future.toISOString().slice(0, 10)

    const tasks = db.prepare(`
      SELECT t.*, p.name AS project_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ? AND t.due_date > ? AND t.due_date <= ? AND t.status != 'completed'
      ORDER BY t.due_date ASC, t.priority ASC
    `).all(userId, today, futureStr)

    res.json(tasks)
  } finally {
    db.close()
  }
})

tasksRouter.get('/calendar', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { ym } = req.query as { ym?: string }
  const db = openDb()
  try {
    const prefix = ym ?? new Date().toISOString().slice(0, 7)
    const rows = db.prepare(`
      SELECT due_date, COUNT(*) AS cnt
      FROM tasks
      WHERE user_id = ? AND due_date LIKE ? AND status != 'completed'
      GROUP BY due_date
    `).all(userId, `${prefix}-%`) as { due_date: string; cnt: number }[]

    const result: Record<string, number> = {}
    for (const r of rows) result[r.due_date] = r.cnt
    res.json(result)
  } finally {
    db.close()
  }
})

tasksRouter.get('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const task = db.prepare(`
      SELECT t.*, p.name AS project_name FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ? AND t.user_id = ?
    `).get(req.params.id, userId)
    if (!task) return res.status(404).json({ error: 'Not found' })
    res.json(task)
  } finally {
    db.close()
  }
})

tasksRouter.post('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { title, notes, priority = 4, project_id, due_date, due_time, kanban_column = 'todo', recurrence_rule } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
  const VALID_PRIORITIES = [1, 2, 3, 4]
  if (priority !== undefined && !VALID_PRIORITIES.includes(Number(priority))) {
    return res.status(400).json({ error: 'priority must be 1, 2, 3, or 4' })
  }

  const db = openDb()
  try {
    const row = db.prepare(`
      INSERT INTO tasks (user_id, project_id, title, notes, priority, due_date, due_time, kanban_column, recurrence_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, project_id ?? null, title.trim(), notes ?? null, priority, due_date ?? null, due_time ?? null, kanban_column, recurrence_rule ?? null)

    const task = db.prepare('SELECT * FROM tasks WHERE rowid = ?').get(row.lastInsertRowid)
    res.status(201).json(task)
  } finally {
    db.close()
  }
})

tasksRouter.patch('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId) as { status: string } | undefined
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const VALID_STATUSES = ['pending', 'completed', 'cancelled']
    if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    }
    if (req.body.priority !== undefined && ![1,2,3,4].includes(Number(req.body.priority))) {
      return res.status(400).json({ error: 'priority must be 1, 2, 3, or 4' })
    }

    const allowed = ['title','notes','priority','status','due_date','due_time','position','project_id','kanban_column','recurrence_rule','planned_date']
    const updates: string[] = []
    const values: SqlVal[] = []

    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = ?`)
        values.push(req.body[key])
      }
    }

    if (req.body.status === 'completed' && existing.status !== 'completed') {
      updates.push('completed_at = unixepoch()')
    } else if (req.body.status && req.body.status !== 'completed') {
      updates.push('completed_at = NULL')
    }

    if (updates.length === 0) return res.json(existing)

    updates.push('updated_at = unixepoch()')
    values.push(req.params.id, userId)

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
    const updated = db.prepare(`
      SELECT t.*, p.name AS project_name FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(req.params.id)

    // Cancel notifications when task is completed/cancelled; reschedule when due_date changes
    if (req.body.status === 'completed' || req.body.status === 'cancelled') {
      cancelTaskNotifications(req.params.id)
    } else if ('due_date' in req.body || 'due_time' in req.body) {
      rescheduleTaskNotifications(req.params.id)
    }

    res.json(updated)
  } finally {
    db.close()
  }
})

tasksRouter.delete('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, userId)
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
    cancelTaskNotifications(req.params.id)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

// Subtasks (PLAN.md 2A.5)
tasksRouter.get('/:id/subtasks', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const parent = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!parent) return res.status(404).json({ error: 'Not found' })
    const subtasks = db.prepare(`
      SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY position ASC, created_at ASC
    `).all(req.params.id)
    res.json(subtasks)
  } finally {
    db.close()
  }
})

tasksRouter.post('/:id/subtasks', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { title, notes, priority = 4, due_date, due_time } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' })
  const db = openDb()
  try {
    const parent = db.prepare('SELECT id, project_id FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, userId) as { id: string; project_id: string | null } | undefined
    if (!parent) return res.status(404).json({ error: 'Not found' })
    const row = db.prepare(`
      INSERT INTO tasks (user_id, project_id, parent_task_id, title, notes, priority, due_date, due_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, parent.project_id, parent.id, title.trim(), notes ?? null, priority, due_date ?? null, due_time ?? null)
    const subtask = db.prepare('SELECT * FROM tasks WHERE rowid = ?').get(row.lastInsertRowid)
    res.status(201).json(subtask)
  } finally {
    db.close()
  }
})

// Task-tag association routes (BUG-04: moved here from tagsRouter — correct path is /api/tasks/:taskId/tags/:tagId)
tasksRouter.post('/:taskId/tags/:tagId', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { taskId, tagId } = req.params
  const db = openDb()
  try {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tagId)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})

tasksRouter.delete('/:taskId/tags/:tagId', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { taskId, tagId } = req.params
  const db = openDb()
  try {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(taskId, tagId)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})
