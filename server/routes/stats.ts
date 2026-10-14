import { Router } from 'express'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'

export const statsRouter = Router()
statsRouter.use(requireAuth)

statsRouter.get('/completions', (req, res) => {
  const { userId } = req as AuthRequest
  const days = Math.min(Number(req.query.days) || 30, 365)
  const db = openDb()
  try {
    const rows = db.prepare(`
      SELECT date(completed_at, 'unixepoch') AS date, COUNT(*) AS count
      FROM tasks
      WHERE user_id = ?
        AND status = 'completed'
        AND completed_at > unixepoch() - (? * 86400)
      GROUP BY date ORDER BY date ASC
    `).all(userId, days) as { date: string; count: number }[]
    res.json(rows)
  } finally {
    db.close()
  }
})

statsRouter.get('/summary', (req, res) => {
  const { userId } = req as AuthRequest
  const db = openDb()
  try {
    const today = new Date().toISOString().slice(0, 10)
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400

    const todayCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status='completed' AND date(completed_at,'unixepoch')=?
    `).get(userId, today) as { n: number }).n

    const weekCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status='completed' AND completed_at > ?
    `).get(userId, weekStart) as { n: number }).n

    const overdueCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status='pending' AND due_date < ? AND due_date IS NOT NULL
    `).get(userId, today) as { n: number }).n

    const topStreak = db.prepare(`
      WITH RECURSIVE streak AS (
        SELECT hl.habit_id, hl.log_date, 1 AS len
        FROM habit_logs hl
        WHERE hl.habit_id IN (SELECT id FROM habits WHERE user_id = ?)
          AND hl.completed = 1
          AND (hl.log_date = date('now') OR hl.log_date = date('now', '-1 day'))
          AND NOT EXISTS (
            SELECT 1 FROM habit_logs h2
            WHERE h2.habit_id = hl.habit_id AND h2.completed = 1
              AND h2.log_date = date(hl.log_date, '+1 day')
          )
        UNION ALL
        SELECT hl.habit_id, hl.log_date, s.len + 1
        FROM habit_logs hl JOIN streak s ON hl.habit_id = s.habit_id
          AND hl.log_date = date(s.log_date, '-1 day') AND hl.completed = 1
      )
      SELECT MAX(len) AS max_streak FROM streak
    `).get(userId) as { max_streak: number | null }

    res.json({
      tasks_completed_today: todayCount,
      tasks_completed_week: weekCount,
      overdue_count: overdueCount,
      top_habit_streak: topStreak.max_streak ?? 0,
    })
  } finally {
    db.close()
  }
})
