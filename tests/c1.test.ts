/**
 * Phase C1 tests — shared tool handlers, NVIDIA client, and tool definitions.
 * Uses the same isolated test DB as other test files (setup via tests/helpers/setup.ts).
 */
import { describe, it, expect } from 'vitest'
import { openDb } from '../db/migrate.js'

// ── Seed helper ────────────────────────────────────────────────────────────────

let _n = 0
function seed() {
  const email = `c1test${++_n}@test.com`
  const db = openDb()
  db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, 'C1User', 'h')
  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email) as { id: string }
  db.prepare('INSERT INTO areas (user_id, name, color, icon) VALUES (?,?,?,?)').run(user.id, 'Work', '#fff', 'circle')
  const area = db.prepare('SELECT id FROM areas WHERE user_id=?').get(user.id) as { id: string }
  db.prepare('INSERT INTO projects (user_id, area_id, name) VALUES (?,?,?)').run(user.id, area.id, 'Alpha')
  const project = db.prepare('SELECT id FROM projects WHERE user_id=?').get(user.id) as { id: string }
  db.prepare('INSERT INTO habits (user_id, name) VALUES (?,?)').run(user.id, 'Exercise')
  const habit = db.prepare('SELECT id FROM habits WHERE user_id=?').get(user.id) as { id: string }
  db.close()
  return { userId: user.id, projectId: project.id, areaId: area.id, habitId: habit.id }
}

// ── Migration — chat tables exist ─────────────────────────────────────────────

describe('C1.1 — 003_chat.sql migration', () => {
  it('chat_sessions table exists after migration', () => {
    const db = openDb()
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]).map(r => r.name)
    db.close()
    expect(tables).toContain('chat_sessions')
    expect(tables).toContain('chat_messages')
  })

  it('idx_chat_sessions_user index exists', () => {
    const db = openDb()
    const indexes = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index'`
    ).all() as { name: string }[]).map(r => r.name)
    db.close()
    expect(indexes).toContain('idx_chat_sessions_user')
    expect(indexes).toContain('idx_chat_messages_session')
  })

  it('chat_sessions accepts insert and cascade-deletes with user', () => {
    const { userId } = seed()
    const db = openDb()
    db.prepare(`INSERT INTO chat_sessions (user_id, title) VALUES (?,?)`).run(userId, 'Test Session')
    const session = db.prepare('SELECT * FROM chat_sessions WHERE user_id=?').get(userId) as { id: string; title: string }
    expect(session.title).toBe('Test Session')

    // Insert a message linked to the session
    db.prepare(`INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)`).run(session.id, 'user', 'Hello')
    const msg = db.prepare('SELECT * FROM chat_messages WHERE session_id=?').get(session.id) as { role: string; content: string }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')

    // Deleting user should cascade-delete session and messages
    db.prepare('DELETE FROM users WHERE id=?').run(userId)
    const afterSession = db.prepare('SELECT id FROM chat_sessions WHERE user_id=?').get(userId)
    expect(afterSession).toBeUndefined()
    db.close()
  })

  it('chat_messages role check enforces allowed values', () => {
    const { userId } = seed()
    const db = openDb()
    db.prepare(`INSERT INTO chat_sessions (user_id, title) VALUES (?,?)`).run(userId, 'S')
    const session = db.prepare('SELECT id FROM chat_sessions WHERE user_id=?').get(userId) as { id: string }
    expect(() => {
      db.prepare(`INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)`).run(session.id, 'invalid_role', 'x')
    }).toThrow()
    db.close()
  })
})

// ── C1.5 — NVIDIA client ──────────────────────────────────────────────────────

describe('C1.5 — nvidia.ts', () => {
  it('createNvidiaClient returns an OpenAI-compatible instance', async () => {
    const { createNvidiaClient } = await import('../server/lib/nvidia.js')
    const client = createNvidiaClient()
    expect(client).toBeDefined()
    // OpenAI client exposes .chat.completions resource
    expect(client.chat).toBeDefined()
    expect(typeof client.chat.completions.create).toBe('function')
  })

  it('createNvidiaClient uses NVIDIA_BASE_URL env var', async () => {
    const { createNvidiaClient } = await import('../server/lib/nvidia.js')
    const client = createNvidiaClient()
    const expectedBase = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1'
    // baseURL is exposed on the OpenAI instance
    expect((client as unknown as { baseURL: string }).baseURL).toBe(expectedBase)
  })

  it('NVIDIA_MODEL defaults to llama-3.3-70b-instruct when env not set', async () => {
    const { NVIDIA_MODEL } = await import('../server/lib/nvidia.js')
    const expected = process.env.NVIDIA_MODEL ?? 'meta/llama-3.3-70b-instruct'
    expect(NVIDIA_MODEL).toBe(expected)
  })
})

// ── C1.7 — tool definitions ───────────────────────────────────────────────────

describe('C1.7 — toolDefs.ts', () => {
  it('exports exactly 10 tool definitions', async () => {
    const { TOOL_DEFINITIONS } = await import('../server/lib/toolDefs.js')
    expect(TOOL_DEFINITIONS).toHaveLength(10)
  })

  it('every definition has type=function, name, description, and parameters', async () => {
    const { TOOL_DEFINITIONS } = await import('../server/lib/toolDefs.js')
    for (const def of TOOL_DEFINITIONS) {
      expect(def.type).toBe('function')
      expect(typeof def.function.name).toBe('string')
      expect(def.function.name.length).toBeGreaterThan(0)
      expect(typeof def.function.description).toBe('string')
      expect(def.function.parameters).toBeDefined()
    }
  })

  it('contains all 10 expected tool names', async () => {
    const { TOOL_DEFINITIONS } = await import('../server/lib/toolDefs.js')
    const names = TOOL_DEFINITIONS.map(d => d.function.name)
    const expected = [
      'task_create', 'task_list', 'task_update', 'task_complete', 'task_delete',
      'task_search', 'project_list', 'habit_log', 'habit_stats', 'productivity_summary',
    ]
    for (const name of expected) {
      expect(names).toContain(name)
    }
  })

  it('task_create has required title parameter', async () => {
    const { TOOL_DEFINITIONS } = await import('../server/lib/toolDefs.js')
    const def = TOOL_DEFINITIONS.find(d => d.function.name === 'task_create')!
    const params = def.function.parameters as { required: string[] }
    expect(params.required).toContain('title')
  })
})

// ── C1.6 — taskflowTools shared handlers ─────────────────────────────────────

describe('C1.6 — taskCreate', () => {
  it('creates a task and returns it with an id', async () => {
    const { taskCreate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const task = taskCreate(userId, { title: 'Buy groceries', priority: 2 }) as { id: string; title: string; priority: number }
    expect(task.id).toMatch(/^[0-9a-f]{16}$/)
    expect(task.title).toBe('Buy groceries')
    expect(task.priority).toBe(2)
  })

  it('parses natural language due date', async () => {
    const { taskCreate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = tomorrow.toISOString().slice(0, 10)
    const task = taskCreate(userId, { title: 'Meeting', due_date: 'tomorrow' }) as { due_date: string }
    expect(task.due_date).toBe(expected)
  })

  it('accepts ISO date unchanged', async () => {
    const { taskCreate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const task = taskCreate(userId, { title: 'Iso task', due_date: '2027-03-15' }) as { due_date: string }
    expect(task.due_date).toBe('2027-03-15')
  })

  it('assigns task to a project', async () => {
    const { taskCreate } = await import('../server/lib/taskflowTools.js')
    const { userId, projectId } = seed()
    const task = taskCreate(userId, { title: 'Project task', project_id: projectId }) as { project_id: string }
    expect(task.project_id).toBe(projectId)
  })
})

describe('C1.6 — taskList', () => {
  it('returns all pending tasks for user', async () => {
    const { taskCreate, taskList } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    taskCreate(userId, { title: 'Alpha' })
    taskCreate(userId, { title: 'Beta' })
    const tasks = taskList(userId, {}) as unknown[]
    expect(tasks.length).toBeGreaterThanOrEqual(2)
  })

  it('view=today returns today\'s and overdue tasks only', async () => {
    const { taskCreate, taskList } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const today = new Date().toISOString().slice(0, 10)
    taskCreate(userId, { title: 'TodayTask', due_date: today })
    taskCreate(userId, { title: 'FutureTask', due_date: '2099-12-31' })
    taskCreate(userId, { title: 'OverdueTask', due_date: '2000-01-01' })
    const tasks = taskList(userId, { view: 'today' }) as { title: string }[]
    expect(tasks.some(t => t.title === 'TodayTask')).toBe(true)
    expect(tasks.some(t => t.title === 'OverdueTask')).toBe(true)
    expect(tasks.every(t => t.title !== 'FutureTask')).toBe(true)
  })

  it('view=inbox returns unassigned tasks', async () => {
    const { taskCreate, taskList } = await import('../server/lib/taskflowTools.js')
    const { userId, projectId } = seed()
    taskCreate(userId, { title: 'InboxTask' })
    taskCreate(userId, { title: 'ProjectTask', project_id: projectId })
    const tasks = taskList(userId, { view: 'inbox' }) as { title: string }[]
    expect(tasks.some(t => t.title === 'InboxTask')).toBe(true)
    expect(tasks.every(t => t.title !== 'ProjectTask')).toBe(true)
  })

  it('filters by project_id', async () => {
    const { taskCreate, taskList } = await import('../server/lib/taskflowTools.js')
    const { userId, projectId } = seed()
    taskCreate(userId, { title: 'InProj', project_id: projectId })
    taskCreate(userId, { title: 'NoProj' })
    const tasks = taskList(userId, { project_id: projectId }) as { title: string; project_id: string }[]
    expect(tasks.every(t => t.project_id === projectId)).toBe(true)
    expect(tasks.some(t => t.title === 'InProj')).toBe(true)
  })
})

describe('C1.6 — taskUpdate', () => {
  it('updates title', async () => {
    const { taskCreate, taskUpdate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Old title' }) as { id: string }
    const updated = taskUpdate(userId, { id: t.id, title: 'New title' }) as { task: { title: string } }
    expect(updated.task.title).toBe('New title')
  })

  it('sets completed_at when status → completed', async () => {
    const { taskCreate, taskUpdate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Complete me' }) as { id: string }
    const updated = taskUpdate(userId, { id: t.id, status: 'completed' }) as { task: { status: string; completed_at: number } }
    expect(updated.task.status).toBe('completed')
    expect(updated.task.completed_at).toBeGreaterThan(0)
  })

  it('returns error for wrong user', async () => {
    const { taskCreate, taskUpdate } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const { userId: otherUserId } = seed()
    const t = taskCreate(userId, { title: 'Mine' }) as { id: string }
    const result = taskUpdate(otherUserId, { id: t.id, title: 'Stolen' }) as { error: string }
    expect(result.error).toMatch(/access denied/i)
  })
})

describe('C1.6 — taskComplete', () => {
  it('marks task completed', async () => {
    const { taskCreate, taskComplete } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Finish me' }) as { id: string }
    const result = taskComplete(userId, { id: t.id }) as { success: boolean }
    expect(result.success).toBe(true)
    // Verify in DB
    const db = openDb()
    const row = db.prepare('SELECT status FROM tasks WHERE id=?').get(t.id) as { status: string }
    db.close()
    expect(row.status).toBe('completed')
  })

  it('returns error for wrong user', async () => {
    const { taskCreate, taskComplete } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const { userId: otherId } = seed()
    const t = taskCreate(userId, { title: 'Not yours' }) as { id: string }
    const result = taskComplete(otherId, { id: t.id }) as { error: string }
    expect(result.error).toMatch(/access denied/i)
  })
})

describe('C1.6 — taskDelete', () => {
  it('deletes task and returns snapshot', async () => {
    const { taskCreate, taskDelete } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Ephemeral' }) as { id: string }
    const result = taskDelete(userId, { id: t.id }) as { success: boolean; snapshot: { id: string } }
    expect(result.success).toBe(true)
    expect(result.snapshot.id).toBe(t.id)
    // Verify gone from DB
    const db = openDb()
    expect(db.prepare('SELECT id FROM tasks WHERE id=?').get(t.id)).toBeUndefined()
    db.close()
  })

  it('returns tags array (empty when no tags)', async () => {
    const { taskCreate, taskDelete } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'No tags' }) as { id: string }
    const result = taskDelete(userId, { id: t.id }) as { tags: string[] }
    expect(Array.isArray(result.tags)).toBe(true)
  })

  it('returns error for wrong user', async () => {
    const { taskCreate, taskDelete } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const { userId: otherId } = seed()
    const t = taskCreate(userId, { title: 'Protected' }) as { id: string }
    const result = taskDelete(otherId, { id: t.id }) as { error: string }
    expect(result.error).toMatch(/access denied/i)
  })
})

describe('C1.6 — projectList', () => {
  it('returns areas with nested projects and inbox count', async () => {
    const { taskCreate, projectList } = await import('../server/lib/taskflowTools.js')
    const { userId, projectId } = seed()
    taskCreate(userId, { title: 'Task in project', project_id: projectId })
    const data = projectList(userId) as { inbox_count: number; areas: { name: string; projects: { name: string; task_count: number }[] }[] }
    expect(typeof data.inbox_count).toBe('number')
    expect(Array.isArray(data.areas)).toBe(true)
    expect(data.areas.length).toBeGreaterThan(0)
    expect(data.areas[0].projects.length).toBeGreaterThan(0)
    expect(data.areas[0].projects[0].task_count).toBe(1)
  })
})

describe('C1.6 — habitLog', () => {
  it('toggles habit on then off', async () => {
    const { habitLog } = await import('../server/lib/taskflowTools.js')
    const { userId, habitId } = seed()
    const today = new Date().toISOString().slice(0, 10)
    const r1 = habitLog(userId, { habit_id: habitId, date: today }) as { toggled: string }
    expect(r1.toggled).toBe('on')
    const r2 = habitLog(userId, { habit_id: habitId, date: today }) as { toggled: string }
    expect(r2.toggled).toBe('off')
  })

  it('returns error for wrong user', async () => {
    const { habitLog } = await import('../server/lib/taskflowTools.js')
    const { habitId } = seed()
    const { userId: otherId } = seed()
    const result = habitLog(otherId, { habit_id: habitId }) as { error: string }
    expect(result.error).toMatch(/access denied/i)
  })
})

describe('C1.6 — habitStats', () => {
  it('returns 0 streak when no logs', async () => {
    const { habitStats } = await import('../server/lib/taskflowTools.js')
    const { userId, habitId } = seed()
    const stats = habitStats(userId, { habit_id: habitId }) as { current_streak: number; completion_rate: number; logs_in_window: number }
    expect(stats.current_streak).toBe(0)
    expect(stats.completion_rate).toBe(0)
    expect(stats.logs_in_window).toBe(0)
  })

  it('calculates consecutive streak', async () => {
    const { habitLog, habitStats } = await import('../server/lib/taskflowTools.js')
    const { userId, habitId } = seed()
    const today = new Date()
    for (let i = 0; i < 3; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      habitLog(userId, { habit_id: habitId, date: d.toISOString().slice(0, 10) })
    }
    const stats = habitStats(userId, { habit_id: habitId }) as { current_streak: number; logs_in_window: number }
    expect(stats.current_streak).toBe(3)
    expect(stats.logs_in_window).toBe(3)
  })

  it('returns error for wrong user', async () => {
    const { habitStats } = await import('../server/lib/taskflowTools.js')
    const { habitId } = seed()
    const { userId: otherId } = seed()
    const result = habitStats(otherId, { habit_id: habitId }) as { error: string }
    expect(result.error).toMatch(/access denied/i)
  })
})

describe('C1.6 — productivitySummary', () => {
  it('counts completed tasks today', async () => {
    const { taskCreate, taskComplete, productivitySummary } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Done today' }) as { id: string }
    taskComplete(userId, { id: t.id })
    const s = productivitySummary(userId) as { tasks_completed_today: number; tasks_completed_week: number; overdue_count: number; top_habit_streak: number }
    expect(s.tasks_completed_today).toBe(1)
    expect(s.tasks_completed_week).toBe(1)
    expect(typeof s.overdue_count).toBe('number')
    expect(typeof s.top_habit_streak).toBe('number')
  })

  it('counts overdue tasks', async () => {
    const { taskCreate, productivitySummary } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    taskCreate(userId, { title: 'Very late', due_date: '2000-01-01' })
    const s = productivitySummary(userId) as { overdue_count: number }
    expect(s.overdue_count).toBeGreaterThanOrEqual(1)
  })
})

describe('C1.6 — taskSearch', () => {
  it('finds tasks by title substring', async () => {
    const { taskCreate, taskSearch } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    taskCreate(userId, { title: 'Write documentation' })
    taskCreate(userId, { title: 'Fix auth bug' })
    const results = taskSearch(userId, { q: 'doc' }) as { title: string }[]
    expect(results.some(r => r.title === 'Write documentation')).toBe(true)
    expect(results.every(r => r.title !== 'Fix auth bug')).toBe(true)
  })

  it('finds tasks by notes substring', async () => {
    const { taskCreate, taskUpdate, taskSearch } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Generic task' }) as { id: string }
    taskUpdate(userId, { id: t.id, notes: 'important keyword here' })
    const results = taskSearch(userId, { q: 'keyword' }) as { title: string }[]
    expect(results.some(r => r.title === 'Generic task')).toBe(true)
  })

  it('does not return completed tasks', async () => {
    const { taskCreate, taskComplete, taskSearch } = await import('../server/lib/taskflowTools.js')
    const { userId } = seed()
    const t = taskCreate(userId, { title: 'Finished work' }) as { id: string }
    taskComplete(userId, { id: t.id })
    const results = taskSearch(userId, { q: 'Finished' }) as unknown[]
    expect(results.length).toBe(0)
  })
})
