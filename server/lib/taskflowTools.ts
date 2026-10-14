import * as chrono from 'chrono-node'
import { openDb } from '../../db/migrate.js'

type SqlVal = string | number | bigint | null

// ── task_create ────────────────────────────────────────────────────────────────

export function taskCreate(userId: string, args: {
  title: string
  notes?: string | null
  due_date?: string
  priority?: number
  project_id?: string | null
}): unknown {
  const { title, notes, due_date, priority = 4, project_id } = args
  let parsedDate: string | null = null
  if (due_date && typeof due_date === 'string') {
    const parsed = chrono.parseDate(due_date)
    parsedDate = parsed ? parsed.toISOString().slice(0, 10) : due_date
  }
  const db = openDb()
  try {
    const row = db.prepare(`
      INSERT INTO tasks (user_id, title, notes, due_date, priority, project_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, title as SqlVal, (notes ?? null) as SqlVal, parsedDate, priority as SqlVal, (project_id ?? null) as SqlVal)
    const task = db.prepare('SELECT * FROM tasks WHERE rowid = ?').get(row.lastInsertRowid) as { id: string }
    db.prepare(`
      INSERT INTO notifications (user_id, task_id, type, title, message)
      VALUES (?, ?, 'task_created', ?, ?)
    `).run(userId, task.id, `Task added: ${title}`, `"${title}" was created via AI chat.`)
    return task
  } finally {
    db.close()
  }
}

// ── task_list ──────────────────────────────────────────────────────────────────

export function taskList(userId: string, args: {
  view?: string
  project_id?: string
  status?: string
  limit?: number
}): unknown {
  const { view, project_id, status, limit = 100 } = args
  const db = openDb()
  try {
    let sql = `
      SELECT t.*, p.name AS project_name FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ?
    `
    const params: SqlVal[] = [userId]
    const today = new Date().toISOString().slice(0, 10)

    if (view === 'today') {
      sql += ` AND t.due_date <= ? AND t.status = 'pending'`
      params.push(today)
    } else if (view === 'inbox') {
      sql += ` AND t.project_id IS NULL AND t.status = 'pending'`
    } else if (view === 'upcoming') {
      const future = new Date()
      future.setDate(future.getDate() + 14)
      sql += ` AND t.due_date > ? AND t.due_date <= ? AND t.status = 'pending'`
      params.push(today, future.toISOString().slice(0, 10))
    } else {
      if (project_id) { sql += ' AND t.project_id = ?'; params.push(project_id) }
      if (status)     { sql += ' AND t.status = ?';     params.push(status) }
    }

    sql += ' ORDER BY t.priority ASC, t.due_date ASC LIMIT ?'
    params.push(limit as SqlVal)
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

// ── task_update ────────────────────────────────────────────────────────────────

export function taskUpdate(userId: string, args: {
  id: string
  [key: string]: unknown
}): unknown {
  const { id, ...fields } = args
  const db = openDb()
  try {
    const row = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(id as SqlVal) as { user_id: string } | undefined
    if (!row || row.user_id !== userId) {
      return { error: 'Task not found or access denied' }
    }
    // Capture pre-image before mutation (for revert support in agent loop)
    const preImage = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id as SqlVal, userId) as Record<string, unknown>
    const allowed = ['title', 'notes', 'priority', 'status', 'due_date', 'due_time', 'project_id', 'kanban_column']
    const updates = ['updated_at = unixepoch()']
    const values: SqlVal[] = []
    for (const k of allowed) {
      if (k in fields) { updates.push(`${k} = ?`); values.push(fields[k] as SqlVal) }
    }
    if (fields.status === 'completed') updates.push('completed_at = unixepoch()')
    values.push(id as SqlVal)
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id as SqlVal)
    return { task, preImage }
  } finally {
    db.close()
  }
}

// ── task_complete ──────────────────────────────────────────────────────────────

export function taskComplete(userId: string, args: { id: string }): unknown {
  const { id } = args
  const db = openDb()
  try {
    const row = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(id as SqlVal) as { user_id: string } | undefined
    if (!row || row.user_id !== userId) {
      return { error: 'Task not found or access denied' }
    }
    db.prepare(`
      UPDATE tasks SET status='completed', completed_at=unixepoch(), updated_at=unixepoch() WHERE id=?
    `).run(id as SqlVal)
    return { success: true, message: `Task ${id} marked completed.` }
  } finally {
    db.close()
  }
}

// ── task_delete ────────────────────────────────────────────────────────────────

export function taskDelete(userId: string, args: { id: string }): unknown {
  const { id } = args
  const db = openDb()
  try {
    const row = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(id as SqlVal) as { user_id: string } | undefined
    if (!row || row.user_id !== userId) {
      return { error: 'Task not found or access denied' }
    }
    // Capture full snapshot including tags before deleting (for revert support in agent loop)
    const snapshot = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id as SqlVal)
    const tags = (db.prepare(
      'SELECT tag_id FROM task_tags WHERE task_id = ?'
    ).all(id as SqlVal) as { tag_id: string }[]).map(r => r.tag_id)
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id as SqlVal)
    return { success: true, message: `Task ${id} deleted.`, snapshot, tags }
  } finally {
    db.close()
  }
}

// ── task_restore (internal — revert path only, not an agent tool) ──────────────

export function taskRestore(snapshot: Record<string, unknown>, tags: string[]): unknown {
  const db = openDb()
  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(snapshot.id as SqlVal)
    if (existing) {
      return { error: `Task ${snapshot.id} already exists — cannot restore` }
    }
    db.prepare(`
      INSERT INTO tasks
        (id, user_id, project_id, parent_task_id, title, notes, priority, status,
         due_date, due_time, position, kanban_column, recurrence_rule, completed_at,
         created_at, updated_at, planned_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      snapshot.id as SqlVal,
      snapshot.user_id as SqlVal,
      (snapshot.project_id ?? null) as SqlVal,
      (snapshot.parent_task_id ?? null) as SqlVal,
      snapshot.title as SqlVal,
      (snapshot.notes ?? null) as SqlVal,
      (snapshot.priority ?? 4) as SqlVal,
      (snapshot.status ?? 'pending') as SqlVal,
      (snapshot.due_date ?? null) as SqlVal,
      (snapshot.due_time ?? null) as SqlVal,
      (snapshot.position ?? 0) as SqlVal,
      (snapshot.kanban_column ?? 'todo') as SqlVal,
      (snapshot.recurrence_rule ?? null) as SqlVal,
      (snapshot.completed_at ?? null) as SqlVal,
      (snapshot.created_at ?? null) as SqlVal,
      (snapshot.updated_at ?? null) as SqlVal,
      (snapshot.planned_date ?? null) as SqlVal,
    )
    for (const tagId of tags) {
      db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(snapshot.id as SqlVal, tagId as SqlVal)
    }
    return { success: true, message: `Task ${snapshot.id} restored.` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    db.close()
  }
}

// ── project_list ───────────────────────────────────────────────────────────────

export function projectList(userId: string): unknown {
  const db = openDb()
  try {
    const areas = db.prepare(`
      SELECT a.id, a.name, a.color FROM areas a WHERE a.user_id = ? AND a.archived_at IS NULL
    `).all(userId) as { id: string; name: string; color: string }[]
    const result = areas.map(area => {
      const projects = db.prepare(`
        SELECT p.id, p.name, p.color, COUNT(t.id) AS task_count
        FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.status='pending'
        WHERE p.area_id=? AND p.archived_at IS NULL GROUP BY p.id
      `).all(area.id)
      return { ...area, projects }
    })
    const inbox = db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND project_id IS NULL AND status='pending'`
    ).get(userId) as { n: number }
    return { inbox_count: inbox.n, areas: result }
  } finally {
    db.close()
  }
}

// ── habit_log ──────────────────────────────────────────────────────────────────

export function habitLog(userId: string, args: { habit_id: string; date?: string }): unknown {
  const { habit_id, date } = args
  const db = openDb()
  try {
    const habitRow = db.prepare('SELECT user_id FROM habits WHERE id = ?').get(habit_id as SqlVal) as { user_id: string } | undefined
    if (!habitRow || habitRow.user_id !== userId) {
      return { error: 'Habit not found or access denied' }
    }
    const d = date ?? new Date().toISOString().slice(0, 10)
    const existing = db.prepare('SELECT 1 FROM habit_logs WHERE habit_id=? AND log_date=?').get(habit_id as SqlVal, d)
    if (existing) {
      db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND log_date=?').run(habit_id as SqlVal, d)
      return { toggled: 'off', date: d }
    }
    db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id,log_date,completed) VALUES (?,?,1)').run(habit_id as SqlVal, d)
    return { toggled: 'on', date: d }
  } finally {
    db.close()
  }
}

// ── habit_stats ────────────────────────────────────────────────────────────────

export function habitStats(userId: string, args: { habit_id: string; days?: number }): unknown {
  const { habit_id, days = 30 } = args
  const db = openDb()
  try {
    const habitRow = db.prepare('SELECT user_id FROM habits WHERE id = ?').get(habit_id as SqlVal) as { user_id: string } | undefined
    if (!habitRow || habitRow.user_id !== userId) {
      return { error: 'Habit not found or access denied' }
    }
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const cutoff365 = new Date(); cutoff365.setDate(cutoff365.getDate() - 365)
    const cutoff365Str = cutoff365.toISOString().slice(0, 10)

    const logsInWindow = (db.prepare(
      `SELECT log_date FROM habit_logs WHERE habit_id=? AND log_date>=? AND completed=1 ORDER BY log_date DESC`
    ).all(habit_id as SqlVal, cutoffStr) as { log_date: string }[]).map(r => r.log_date)

    const allLogs = (db.prepare(
      `SELECT log_date FROM habit_logs WHERE habit_id=? AND log_date>=? AND completed=1`
    ).all(habit_id as SqlVal, cutoff365Str) as { log_date: string }[]).map(r => r.log_date)

    let streak = 0
    const today = new Date()
    for (let i = 0; ; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      if (!allLogs.includes(d.toISOString().slice(0, 10))) break
      streak++
    }
    const completionRate = days > 0 ? Math.round((logsInWindow.length / days) * 100) : 0
    return { current_streak: streak, completion_rate: completionRate, logs_in_window: logsInWindow.length }
  } finally {
    db.close()
  }
}

// ── productivity_summary ───────────────────────────────────────────────────────

export function productivitySummary(userId: string): unknown {
  const db = openDb()
  try {
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400
    const todayCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='completed' AND date(completed_at,'unixepoch')=?`
    ).get(userId, today) as { n: number }).n
    const weekCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='completed' AND completed_at>?`
    ).get(userId, weekAgo) as { n: number }).n
    const overdueCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='pending' AND due_date<? AND due_date IS NOT NULL`
    ).get(userId, today) as { n: number }).n
    const topStreak = db.prepare(`
      WITH RECURSIVE s AS (
        SELECT habit_id, log_date, 1 AS len FROM habit_logs
        WHERE habit_id IN (SELECT id FROM habits WHERE user_id=?)
          AND completed=1
          AND (log_date = date('now') OR log_date = date('now', '-1 day'))
          AND NOT EXISTS (
            SELECT 1 FROM habit_logs h2
            WHERE h2.habit_id = habit_logs.habit_id AND h2.completed=1
              AND h2.log_date = date(habit_logs.log_date, '+1 day')
          )
        UNION ALL SELECT hl.habit_id, hl.log_date, s.len+1
        FROM habit_logs hl JOIN s ON hl.habit_id=s.habit_id
          AND hl.log_date=date(s.log_date,'-1 day') AND hl.completed=1
      ) SELECT MAX(len) AS m FROM s
    `).get(userId) as { m: number | null }
    return {
      tasks_completed_today: todayCount,
      tasks_completed_week:  weekCount,
      overdue_count:         overdueCount,
      top_habit_streak:      topStreak.m ?? 0,
    }
  } finally {
    db.close()
  }
}

// ── task_search ────────────────────────────────────────────────────────────────

export function taskSearch(userId: string, args: { q: string }): unknown {
  const { q } = args
  const db = openDb()
  try {
    return db.prepare(`
      SELECT t.*, p.name AS project_name FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.user_id=? AND (t.title LIKE ? OR t.notes LIKE ?) AND t.status != 'completed'
      LIMIT 20
    `).all(userId, `%${q}%`, `%${q}%`)
  } finally {
    db.close()
  }
}
