/**
 * API / UI-wiring integration tests
 * Uses supertest to drive the Express app against the test DB.
 * Covers every route that the React frontend calls.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../server/app.js'
import { openDb, runMigrations } from '../db/migrate.js'
import { hashPassword, createSession } from '../server/auth.js'

const api = request(app)

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function registerAndLogin(email = 'user@api.test', password = 'Pass1234!') {
  const db = openDb()
  const hash = await hashPassword(password)
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, 'Test User', hash)
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as { id: string; email: string; name: string }
  const token = createSession(db, user.id)
  db.close()
  return { user, token }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('registers a new user and returns token + user', async () => {
    const res = await api.post('/auth/register').send({ name: 'New', email: 'new@api.test', password: 'password1' })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('new@api.test')
    expect(res.body.user.password_hash).toBeUndefined()
  })

  it('rejects duplicate email with 409', async () => {
    await api.post('/auth/register').send({ name: 'A', email: 'dup@api.test', password: 'password1' })
    const res = await api.post('/auth/register').send({ name: 'B', email: 'dup@api.test', password: 'password1' })
    expect(res.status).toBe(409)
  })

  it('rejects short password with 400', async () => {
    const res = await api.post('/auth/register').send({ name: 'A', email: 'short@api.test', password: '1234567' })
    expect(res.status).toBe(400)
  })

  it('rejects missing name with 400', async () => {
    const res = await api.post('/auth/register').send({ email: 'noname@api.test', password: 'password1' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    await registerAndLogin('login@api.test', 'CorrectPass1')
    const res = await api.post('/auth/login').send({ email: 'login@api.test', password: 'CorrectPass1' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  it('rejects wrong password with 401', async () => {
    await registerAndLogin('wp@api.test', 'CorrectPass1')
    const res = await api.post('/auth/login').send({ email: 'wp@api.test', password: 'WrongPass1' })
    expect(res.status).toBe(401)
  })

  it('rejects unknown email with 401', async () => {
    const res = await api.post('/auth/login').send({ email: 'nobody@api.test', password: 'SomePass1' })
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns user with valid token', async () => {
    const { token, user } = await registerAndLogin('me@api.test')
    const res = await api.get('/auth/me').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(user.email)
  })

  it('returns 401 with invalid token', async () => {
    const res = await api.get('/auth/me').set({ Authorization: 'Bearer badtoken' })
    expect(res.status).toBe(401)
  })

  it('returns 401 with no token', async () => {
    const res = await api.get('/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/logout', () => {
  it('invalidates the session token', async () => {
    const { token } = await registerAndLogin('logout@api.test')
    await api.post('/auth/logout').set(auth(token))
    const res = await api.get('/auth/me').set(auth(token))
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/tasks', () => {
  it('requires authentication', async () => {
    const res = await api.get('/api/tasks')
    expect(res.status).toBe(401)
  })

  it('returns tasks for authenticated user', async () => {
    const { token } = await registerAndLogin('tasks@api.test')
    const res = await api.get('/api/tasks').set(auth(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('view=today filters to today\'s tasks', async () => {
    const { token } = await registerAndLogin('today@api.test')
    const today = new Date().toISOString().slice(0, 10)
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Today task', due_date: today })
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Future task', due_date: '2099-12-31' })
    const res = await api.get('/api/tasks?view=today').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.some((t: { title: string }) => t.title === 'Today task')).toBe(true)
    expect(res.body.every((t: { title: string }) => t.title !== 'Future task')).toBe(true)
  })

  it('view=inbox returns only unassigned tasks', async () => {
    const { token } = await registerAndLogin('inbox@api.test')
    const projRes = await api.post('/api/projects').set(auth(token)).send({ name: 'P' })
    const projId = projRes.body.id
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Inbox task' })
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Project task', project_id: projId })
    const res = await api.get('/api/tasks?view=inbox').set(auth(token))
    expect(res.body.some((t: { title: string }) => t.title === 'Inbox task')).toBe(true)
    expect(res.body.every((t: { title: string }) => t.title !== 'Project task')).toBe(true)
  })
})

describe('GET /api/tasks/search', () => {
  it('returns matching tasks', async () => {
    const { token } = await registerAndLogin('search@api.test')
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Design homepage' })
    await api.post('/api/tasks').set(auth(token)).send({ title: 'Write tests' })
    const res = await api.get('/api/tasks/search?q=homepage').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.some((t: { title: string }) => t.title === 'Design homepage')).toBe(true)
    expect(res.body.every((t: { title: string }) => t.title !== 'Write tests')).toBe(true)
  })

  it('returns empty array for blank query', async () => {
    const { token } = await registerAndLogin('search2@api.test')
    const res = await api.get('/api/tasks/search?q=').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    const { token } = await registerAndLogin('create@api.test')
    const res = await api.post('/api/tasks').set(auth(token)).send({ title: 'New task', priority: 2 })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('New task')
    expect(res.body.priority).toBe(2)
    expect(res.body.id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('rejects missing title with 400', async () => {
    const { token } = await registerAndLogin('notitle@api.test')
    const res = await api.post('/api/tasks').set(auth(token)).send({ priority: 1 })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/tasks/:id', () => {
  it('updates task fields', async () => {
    const { token } = await registerAndLogin('update@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(token)).send({ title: 'Before' })
    const res = await api.patch(`/api/tasks/${task.id}`).set(auth(token)).send({ title: 'After', priority: 1 })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('After')
    expect(res.body.priority).toBe(1)
  })

  it('setting status=completed sets completed_at', async () => {
    const { token } = await registerAndLogin('complete@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(token)).send({ title: 'Finish me' })
    const res = await api.patch(`/api/tasks/${task.id}`).set(auth(token)).send({ status: 'completed' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
    expect(res.body.completed_at).toBeGreaterThan(0)
  })

  it('updates kanban_column', async () => {
    const { token } = await registerAndLogin('kanban@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(token)).send({ title: 'Kan' })
    const res = await api.patch(`/api/tasks/${task.id}`).set(auth(token)).send({ kanban_column: 'done' })
    expect(res.body.kanban_column).toBe('done')
  })

  it('returns 404 for other user\'s task', async () => {
    const { token: t1 } = await registerAndLogin('own1@api.test')
    const { token: t2 } = await registerAndLogin('own2@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(t1)).send({ title: 'Secret' })
    const res = await api.patch(`/api/tasks/${task.id}`).set(auth(t2)).send({ title: 'Hijack' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tasks/:id', () => {
  it('deletes own task', async () => {
    const { token } = await registerAndLogin('del@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(token)).send({ title: 'Gone' })
    const res = await api.delete(`/api/tasks/${task.id}`).set(auth(token))
    expect(res.status).toBe(200)
    const check = await api.get(`/api/tasks/${task.id}`).set(auth(token))
    expect(check.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  it('returns projects with task_count', async () => {
    const { token } = await registerAndLogin('projlist@api.test')
    await api.post('/api/projects').set(auth(token)).send({ name: 'Alpha' })
    const res = await api.get('/api/projects').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body[0].task_count).toBeDefined()
  })
})

describe('POST /api/projects', () => {
  it('creates project with defaults', async () => {
    const { token } = await registerAndLogin('projcreate@api.test')
    const res = await api.post('/api/projects').set(auth(token)).send({ name: 'My Project' })
    expect(res.status).toBe(201)
    expect(res.body.view_mode).toBe('list')
    expect(res.body.color).toBe('#1D9E75')
  })
})

describe('PATCH /api/projects/:id', () => {
  it('switches view_mode to kanban', async () => {
    const { token } = await registerAndLogin('projmode@api.test')
    const { body: proj } = await api.post('/api/projects').set(auth(token)).send({ name: 'K' })
    const res = await api.patch(`/api/projects/${proj.id}`).set(auth(token)).send({ view_mode: 'kanban' })
    expect(res.status).toBe(200)
    expect(res.body.view_mode).toBe('kanban')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AREAS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/areas', () => {
  it('returns areas with nested projects', async () => {
    const { token } = await registerAndLogin('areas@api.test')
    const { body: area } = await api.post('/api/areas').set(auth(token)).send({ name: 'Work', color: '#123456', icon: 'briefcase' })
    await api.post('/api/projects').set(auth(token)).send({ name: 'Sub', area_id: area.id })
    const res = await api.get('/api/areas').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body[0].projects).toBeDefined()
    expect(res.body[0].projects.length).toBeGreaterThan(0)
  })
})

describe('POST /api/areas', () => {
  it('creates an area', async () => {
    const { token } = await registerAndLogin('areacreate@api.test')
    const res = await api.post('/api/areas').set(auth(token)).send({ name: 'Personal', color: '#abcdef', icon: 'home' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Personal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HABITS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/habits', () => {
  it('returns habits with streak', async () => {
    const { token } = await registerAndLogin('habits@api.test')
    await api.post('/api/habits').set(auth(token)).send({ name: 'Meditate', frequency: 'daily', color: '#fff' })
    const res = await api.get('/api/habits').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('Meditate')
    expect(res.body[0].streak).toBeDefined()
  })
})

describe('POST /api/habits/:id/log', () => {
  it('logs habit for today and increments streak', async () => {
    const { token } = await registerAndLogin('habitlog@api.test')
    const { body: habit } = await api.post('/api/habits').set(auth(token)).send({ name: 'Run', frequency: 'daily', color: '#0f0' })
    const today = new Date().toISOString().slice(0, 10)
    const res = await api.post(`/api/habits/${habit.id}/log`).set(auth(token)).send({ date: today })
    expect(res.status).toBe(200)
    const listRes = await api.get('/api/habits').set(auth(token))
    expect(listRes.body[0].streak).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/stats/summary', () => {
  it('returns all four summary fields', async () => {
    const { token } = await registerAndLogin('stats@api.test')
    const res = await api.get('/api/stats/summary').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      tasks_completed_today: expect.any(Number),
      tasks_completed_week:  expect.any(Number),
      overdue_count:         expect.any(Number),
      top_habit_streak:      expect.any(Number),
    })
  })

  it('counts completed tasks in summary', async () => {
    const { token } = await registerAndLogin('stats2@api.test')
    const { body: task } = await api.post('/api/tasks').set(auth(token)).send({ title: 'Done' })
    await api.patch(`/api/tasks/${task.id}`).set(auth(token)).send({ status: 'completed' })
    const res = await api.get('/api/stats/summary').set(auth(token))
    expect(res.body.tasks_completed_today).toBeGreaterThanOrEqual(1)
  })
})

describe('GET /api/stats/completions', () => {
  it('returns an array of day-count objects', async () => {
    const { token } = await registerAndLogin('compl@api.test')
    const res = await api.get('/api/stats/completions?days=7').set(auth(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await api.get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
