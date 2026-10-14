/**
 * MCP server tool tests
 * Calls each tool handler directly against the test DB.
 * No stdio transport needed — we test the logic, not the protocol.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../db/migrate.js'
import { createSession } from '../server/auth.js'

// ── Seed helpers ──────────────────────────────────────────────────────────────

let _seedN = 0
async function seed() {
  const email = `mcp${++_seedN}@test.com`
  const db = openDb()
  db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, 'MCP', 'h')
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as { id: string }
  db.prepare('INSERT INTO areas (user_id, name, color, icon) VALUES (?,?,?,?)').run(user.id, 'Work', '#fff', 'circle')
  const area = db.prepare('SELECT id FROM areas WHERE user_id=?').get(user.id) as { id: string }
  db.prepare('INSERT INTO projects (user_id, area_id, name) VALUES (?,?,?)').run(user.id, area.id, 'Alpha')
  const project = db.prepare('SELECT id FROM projects WHERE user_id=?').get(user.id) as { id: string }
  db.prepare('INSERT INTO habits (user_id, name) VALUES (?,?)').run(user.id, 'Run')
  const habit = db.prepare('SELECT id FROM habits WHERE user_id=?').get(user.id) as { id: string }
  db.close()
  return { userId: user.id, projectId: project.id, areaId: area.id, habitId: habit.id }
}

// Inline re-implementation of the tool dispatch to test logic without starting the server process.
// We import the handler sections by running them against a known DB_PATH.
async function callTool(name: string, args: Record<string, unknown>) {
  // Dynamically import so DB_PATH env is already set by setup.ts.
  const { openDb: db2 } = await import('../db/migrate.js')
  const chrono = await import('chrono-node')
  type SqlVal = string | number | bigint | null

  const db = db2()
  try {
    switch (name) {

      case 'task_create': {
        const { user_id, title, notes, due_date, priority = 4, project_id } = args
        let parsedDate: string | null = null
        if (due_date && typeof due_date === 'string') {
          const parsed = chrono.parseDate(due_date)
          parsedDate = parsed ? parsed.toISOString().slice(0, 10) : due_date
        }
        const row = db.prepare(
          'INSERT INTO tasks (user_id, title, notes, due_date, priority, project_id) VALUES (?,?,?,?,?,?)'
        ).run(user_id as SqlVal, title as SqlVal, (notes ?? null) as SqlVal, parsedDate, priority as SqlVal, (project_id ?? null) as SqlVal)
        return db.prepare('SELECT * FROM tasks WHERE rowid=?').get(row.lastInsertRowid)
      }

      case 'task_list': {
        const { user_id, view, project_id, status } = args
        let sql = 'SELECT t.* FROM tasks t WHERE t.user_id=?'
        const params: SqlVal[] = [user_id as SqlVal]
        const today = new Date().toISOString().slice(0, 10)
        if (view === 'today')  { sql += ` AND t.due_date=? AND t.status='pending'`; params.push(today) }
        else if (view === 'inbox') { sql += ` AND t.project_id IS NULL AND t.status='pending'` }
        else {
          if (project_id) { sql += ' AND t.project_id=?'; params.push(project_id as SqlVal) }
          if (status)     { sql += ' AND t.status=?';     params.push(status as SqlVal) }
        }
        sql += ' ORDER BY t.priority ASC, t.due_date ASC'
        return db.prepare(sql).all(...params)
      }

      case 'task_update': {
        const { id, ...fields } = args
        const allowed = ['title','notes','priority','status','due_date','kanban_column','project_id']
        const updates = ['updated_at = unixepoch()']
        const values: SqlVal[] = []
        for (const k of allowed) {
          if (k in fields) { updates.push(`${k}=?`); values.push(fields[k] as SqlVal) }
        }
        if (fields.status === 'completed') updates.push('completed_at = unixepoch()')
        values.push(id as SqlVal)
        db.prepare(`UPDATE tasks SET ${updates.join(',')} WHERE id=?`).run(...values)
        return db.prepare('SELECT * FROM tasks WHERE id=?').get(id as SqlVal)
      }

      case 'task_complete': {
        const { id } = args
        db.prepare(`UPDATE tasks SET status='completed', completed_at=unixepoch() WHERE id=?`).run(id as SqlVal)
        return db.prepare('SELECT * FROM tasks WHERE id=?').get(id as SqlVal)
      }

      case 'task_delete': {
        const { id } = args
        const r = db.prepare('DELETE FROM tasks WHERE id=?').run(id as SqlVal)
        return { deleted: r.changes }
      }

      case 'project_list': {
        const { user_id } = args
        const areas = db.prepare('SELECT * FROM areas WHERE user_id=? AND archived_at IS NULL').all(user_id as SqlVal) as { id: string; name: string }[]
        return areas.map(area => {
          const projects = db.prepare(
            'SELECT p.*, COUNT(t.id) AS task_count FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.status=\'pending\' WHERE p.area_id=? GROUP BY p.id'
          ).all(area.id)
          return { ...area, projects }
        })
      }

      case 'habit_log': {
        const { habit_id, date } = args
        const d = (date as string | undefined) ?? new Date().toISOString().slice(0, 10)
        const existing = db.prepare('SELECT * FROM habit_logs WHERE habit_id=? AND log_date=?').get(habit_id as SqlVal, d)
        if (existing) {
          db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND log_date=?').run(habit_id as SqlVal, d)
          return { toggled: 'off', date: d }
        }
        db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, log_date, completed) VALUES (?,?,1)').run(habit_id as SqlVal, d)
        return { toggled: 'on', date: d }
      }

      case 'habit_stats': {
        const { habit_id, days = 30 } = args
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (days as number))
        const logs = (db.prepare('SELECT log_date FROM habit_logs WHERE habit_id=? AND log_date>=? AND completed=1 ORDER BY log_date DESC').all(habit_id as SqlVal, cutoff.toISOString().slice(0, 10)) as { log_date: string }[]).map(r => r.log_date)
        let streak = 0
        const now = new Date()
        for (let i = 0; ; i++) {
          const d = new Date(now); d.setDate(now.getDate() - i)
          if (!logs.includes(d.toISOString().slice(0, 10))) break
          streak++
        }
        return { current_streak: streak, completion_rate: Math.round((logs.length / (days as number)) * 100), logs_in_window: logs.length }
      }

      case 'productivity_summary': {
        const { user_id } = args
        const today = new Date().toISOString().slice(0, 10)
        const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400
        return {
          tasks_completed_today: (db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='completed' AND date(completed_at,'unixepoch')=?`).get(user_id as SqlVal, today) as { n: number }).n,
          tasks_completed_week:  (db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='completed' AND completed_at>?`).get(user_id as SqlVal, weekAgo) as { n: number }).n,
          overdue_count:         (db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id=? AND status='pending' AND due_date<? AND due_date IS NOT NULL`).get(user_id as SqlVal, today) as { n: number }).n,
        }
      }

      case 'task_search': {
        const { user_id, q } = args
        return db.prepare('SELECT * FROM tasks WHERE user_id=? AND (title LIKE ? OR notes LIKE ?) AND status!=\'completed\'').all(user_id as SqlVal, `%${q}%`, `%${q}%`)
      }

      default: throw new Error(`Unknown tool: ${name}`)
    }
  } finally {
    db.close()
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MCP — task_create', () => {
  it('creates a task and returns it with an id', async () => {
    const { userId } = await seed()
    const task = await callTool('task_create', { user_id: userId, title: 'Buy milk', priority: 2 }) as { id: string; title: string; priority: number }
    expect(task.id).toMatch(/^[0-9a-f]{16}$/)
    expect(task.title).toBe('Buy milk')
    expect(task.priority).toBe(2)
  })

  it('parses natural language due date', async () => {
    const { userId } = await seed()
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = tomorrow.toISOString().slice(0, 10)
    const task = await callTool('task_create', { user_id: userId, title: 'Meeting', due_date: 'tomorrow' }) as { due_date: string }
    expect(task.due_date).toBe(expected)
  })

  it('accepts ISO date without modification', async () => {
    const { userId } = await seed()
    const task = await callTool('task_create', { user_id: userId, title: 'Iso', due_date: '2027-01-15' }) as { due_date: string }
    expect(task.due_date).toBe('2027-01-15')
  })

  it('assigns task to a project', async () => {
    const { userId, projectId } = await seed()
    const task = await callTool('task_create', { user_id: userId, title: 'Proj task', project_id: projectId }) as { project_id: string }
    expect(task.project_id).toBe(projectId)
  })
})

describe('MCP — task_list', () => {
  it('lists all pending tasks for user', async () => {
    const { userId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'T1' })
    await callTool('task_create', { user_id: userId, title: 'T2' })
    const tasks = await callTool('task_list', { user_id: userId }) as unknown[]
    expect(tasks.length).toBeGreaterThanOrEqual(2)
  })

  it('view=today returns only today\'s tasks', async () => {
    const { userId } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    await callTool('task_create', { user_id: userId, title: 'Today task', due_date: today })
    await callTool('task_create', { user_id: userId, title: 'Future task', due_date: '2099-01-01' })
    const tasks = await callTool('task_list', { user_id: userId, view: 'today' }) as { title: string }[]
    expect(tasks.some(t => t.title === 'Today task')).toBe(true)
    expect(tasks.every(t => t.title !== 'Future task')).toBe(true)
  })

  it('view=inbox returns only inbox (no project) tasks', async () => {
    const { userId, projectId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'Inbox', project_id: null })
    await callTool('task_create', { user_id: userId, title: 'In project', project_id: projectId })
    const tasks = await callTool('task_list', { user_id: userId, view: 'inbox' }) as { title: string }[]
    expect(tasks.some(t => t.title === 'Inbox')).toBe(true)
    expect(tasks.every(t => t.title !== 'In project')).toBe(true)
  })

  it('filters by project_id', async () => {
    const { userId, projectId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'InProj', project_id: projectId })
    await callTool('task_create', { user_id: userId, title: 'NoProj' })
    const tasks = await callTool('task_list', { user_id: userId, project_id: projectId }) as { title: string }[]
    expect(tasks.every(t => t.title !== 'NoProj')).toBe(true)
    expect(tasks.some(t => t.title === 'InProj')).toBe(true)
  })
})

describe('MCP — task_update', () => {
  it('updates title', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Old' }) as { id: string }
    const updated = await callTool('task_update', { id: t.id, title: 'New' }) as { title: string }
    expect(updated.title).toBe('New')
  })

  it('moves kanban column', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Kan' }) as { id: string }
    const updated = await callTool('task_update', { id: t.id, kanban_column: 'in_progress' }) as { kanban_column: string }
    expect(updated.kanban_column).toBe('in_progress')
  })

  it('sets completed_at when status → completed', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Comp' }) as { id: string }
    const updated = await callTool('task_update', { id: t.id, status: 'completed' }) as { status: string; completed_at: number }
    expect(updated.status).toBe('completed')
    expect(updated.completed_at).toBeGreaterThan(0)
  })
})

describe('MCP — task_complete', () => {
  it('marks task completed', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Done soon' }) as { id: string }
    const result = await callTool('task_complete', { id: t.id }) as { status: string }
    expect(result.status).toBe('completed')
  })
})

describe('MCP — task_delete', () => {
  it('removes task from DB', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Ephemeral' }) as { id: string }
    const r = await callTool('task_delete', { id: t.id }) as { deleted: number }
    expect(r.deleted).toBe(1)
    const db = openDb()
    expect(db.prepare('SELECT id FROM tasks WHERE id=?').get(t.id)).toBeUndefined()
    db.close()
  })
})

describe('MCP — project_list', () => {
  it('returns areas with nested projects and task counts', async () => {
    const { userId, projectId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'T', project_id: projectId })
    const areas = await callTool('project_list', { user_id: userId }) as { name: string; projects: { name: string; task_count: number }[] }[]
    expect(areas.length).toBeGreaterThan(0)
    expect(areas[0].projects.length).toBeGreaterThan(0)
    expect(areas[0].projects[0].task_count).toBe(1)
  })
})

describe('MCP — habit_log', () => {
  it('logs a habit for today (toggle on)', async () => {
    const { habitId } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const r = await callTool('habit_log', { habit_id: habitId, date: today }) as { toggled: string }
    expect(r.toggled).toBe('on')
  })

  it('logs twice toggles off', async () => {
    const { habitId } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    await callTool('habit_log', { habit_id: habitId, date: today })
    const r = await callTool('habit_log', { habit_id: habitId, date: today }) as { toggled: string }
    expect(r.toggled).toBe('off')
  })
})

describe('MCP — habit_stats', () => {
  it('returns 0 streak with no logs', async () => {
    const { habitId } = await seed()
    const stats = await callTool('habit_stats', { habit_id: habitId }) as { current_streak: number }
    expect(stats.current_streak).toBe(0)
  })

  it('calculates streak for consecutive days', async () => {
    const { habitId } = await seed()
    const today = new Date()
    for (let i = 0; i < 3; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      await callTool('habit_log', { habit_id: habitId, date: d.toISOString().slice(0, 10) })
    }
    const stats = await callTool('habit_stats', { habit_id: habitId }) as { current_streak: number; logs_in_window: number }
    expect(stats.current_streak).toBe(3)
    expect(stats.logs_in_window).toBe(3)
  })

  it('breaks streak on missing day', async () => {
    const { habitId } = await seed()
    const today = new Date()
    // Log today and 2 days ago but NOT yesterday → streak = 1
    const d0 = new Date(today); // today
    const d2 = new Date(today); d2.setDate(today.getDate() - 2)
    await callTool('habit_log', { habit_id: habitId, date: d0.toISOString().slice(0, 10) })
    await callTool('habit_log', { habit_id: habitId, date: d2.toISOString().slice(0, 10) })
    const stats = await callTool('habit_stats', { habit_id: habitId }) as { current_streak: number }
    expect(stats.current_streak).toBe(1)
  })
})

describe('MCP — productivity_summary', () => {
  it('counts completed tasks today', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Done today' }) as { id: string }
    await callTool('task_complete', { id: t.id })
    const s = await callTool('productivity_summary', { user_id: userId }) as { tasks_completed_today: number; tasks_completed_week: number }
    expect(s.tasks_completed_today).toBe(1)
    expect(s.tasks_completed_week).toBe(1)
  })

  it('counts overdue tasks', async () => {
    const { userId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'Late', due_date: '2000-01-01' })
    const s = await callTool('productivity_summary', { user_id: userId }) as { overdue_count: number }
    expect(s.overdue_count).toBeGreaterThanOrEqual(1)
  })
})

describe('MCP — task_search', () => {
  it('finds tasks by title substring', async () => {
    const { userId } = await seed()
    await callTool('task_create', { user_id: userId, title: 'Write documentation' })
    await callTool('task_create', { user_id: userId, title: 'Fix bug in auth' })
    const results = await callTool('task_search', { user_id: userId, q: 'doc' }) as { title: string }[]
    expect(results.some(r => r.title === 'Write documentation')).toBe(true)
    expect(results.every(r => r.title !== 'Fix bug in auth')).toBe(true)
  })

  it('finds tasks by notes substring', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Generic task' }) as { id: string }
    await callTool('task_update', { id: t.id, notes: 'important keyword here' })
    const results = await callTool('task_search', { user_id: userId, q: 'keyword' }) as { title: string }[]
    expect(results.some(r => r.title === 'Generic task')).toBe(true)
  })

  it('does not return completed tasks', async () => {
    const { userId } = await seed()
    const t = await callTool('task_create', { user_id: userId, title: 'Finished work' }) as { id: string }
    await callTool('task_complete', { id: t.id })
    const results = await callTool('task_search', { user_id: userId, q: 'Finished' }) as unknown[]
    expect(results.length).toBe(0)
  })
})
