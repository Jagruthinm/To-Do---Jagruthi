import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

export const habitsRouter = Router()
habitsRouter.use(requireAuth)

habitsRouter.get('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const habits = db.prepare(`
      SELECT * FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY position ASC
    `).all(userId) as Array<Record<string, unknown> & { id: string }>

    // 21-day cutoff for the dot-grid display only
    const cutoff21 = new Date(); cutoff21.setDate(cutoff21.getDate() - 21)
    const cutoff21Str = cutoff21.toISOString().slice(0, 10)
    // 365-day cutoff for streak calculation — avoids silently capping real streaks at 21
    const cutoff365 = new Date(); cutoff365.setDate(cutoff365.getDate() - 365)
    const cutoff365Str = cutoff365.toISOString().slice(0, 10)

    const result = habits.map(habit => {
      const logs = (db.prepare(`
        SELECT log_date FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND completed = 1
      `).all(habit.id, cutoff21Str) as { log_date: string }[]).map(r => r.log_date)

      const logsStreak = (db.prepare(`
        SELECT log_date FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND completed = 1
      `).all(habit.id, cutoff365Str) as { log_date: string }[]).map(r => r.log_date)

      let streak = 0
      const today = new Date()
      for (let i = 0; ; i++) {
        const d = new Date(today); d.setDate(today.getDate() - i)
        if (!logsStreak.includes(d.toISOString().slice(0, 10))) break
        streak++
      }

      return { ...habit, logs, streak }
    })

    res.json(result)
  } finally {
    db.close()
  }
})

habitsRouter.post('/', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { name, description, frequency = 'daily', target_days, color = '#1D9E75' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

  const VALID_FREQUENCIES = ['daily', 'weekdays', 'weekly']
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` })
  }

  const db = openDb()
  try {
    const row = db.prepare(`
      INSERT INTO habits (user_id, name, description, frequency, target_days, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), description ?? null, frequency, target_days ? JSON.stringify(target_days) : null, color)
    const habit = db.prepare('SELECT * FROM habits WHERE rowid = ?').get(row.lastInsertRowid)
    res.status(201).json(habit)
  } finally {
    db.close()
  }
})

habitsRouter.patch('/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const existing = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const allowed = ['name', 'description', 'frequency', 'color', 'position', 'archived_at']
    const updates = ['updated_at = unixepoch()']
    const values: (string | number | null)[] = []
    for (const key of allowed) {
      if (key in req.body) { updates.push(`${key} = ?`); values.push(req.body[key]) }
    }
    values.push(req.params.id, userId)
    db.prepare(`UPDATE habits SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
    res.json(db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id))
  } finally {
    db.close()
  }
})

habitsRouter.get('/:id/logs', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const days = Math.min(365, Math.max(1, parseInt((req.query as { days?: string }).days ?? '30', 10) || 30))
  const db = openDb()
  try {
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!habit) return res.status(404).json({ error: 'Not found' })

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (days - 1))
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const logs = db.prepare(`
      SELECT log_date, completed FROM habit_logs
      WHERE habit_id = ? AND log_date >= ?
      ORDER BY log_date ASC
    `).all(req.params.id, cutoffStr)

    res.json(logs)
  } finally {
    db.close()
  }
})

habitsRouter.post('/:id/log', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { date } = req.body
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  const db = openDb()
  try {
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!habit) return res.status(404).json({ error: 'Not found' })

    db.prepare(`
      INSERT OR REPLACE INTO habit_logs (habit_id, log_date, completed) VALUES (?, ?, 1)
    `).run(req.params.id, date)

    res.json({ ok: true })
  } finally {
    db.close()
  }
})

habitsRouter.delete('/:id/log/:date', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, userId)
    if (!habit) return res.status(404).json({ error: 'Not found' })

    db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?').run(req.params.id, req.params.date)
    res.json({ ok: true })
  } finally {
    db.close()
  }
})
