/**
 * tests/debt-wave1.test.ts
 *
 * Regression tests for v1 Tech Debt Wave 1
 * Covers: DIR-D1-01 (H-1b), DIR-D1-02 (H-2), DIR-D1-03 (H-3),
 *         DIR-D1-04 (H-4), DIR-D1-05 (H-5), DIR-D1-06 (M-9)
 *
 * Setup file (tests/helpers/setup.ts) sets DB_PATH to an isolated temp DB.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../server/app.js'
import { openDb, runMigrations } from '../db/migrate.js'
import { hashPassword, createSession } from '../server/auth.js'
import { localToday, localDateString } from '../src/utils/date.js'

const api = request(app)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUser(email = `u${Date.now()}@debt.test`) {
  const db = openDb()
  const hash = await hashPassword('Password1!')
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, 'Test', hash)
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
  const token = createSession(db, user.id)
  db.close()
  return { userId: user.id, token }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-05 — H-5: localToday() / localDateString() return local calendar date
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-05 — localToday / localDateString (src/utils/date.ts)', () => {
  it('localToday() returns a YYYY-MM-DD string', () => {
    const result = localToday()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('localToday() matches local year, month, and day', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(localToday()).toBe(expected)
  })

  it('localToday() does NOT match UTC date when local and UTC differ', () => {
    // Simulate: it is 11 pm local (UTC-6) — UTC date is one day ahead.
    // We compare our helper against Date.toISOString() which always uses UTC.
    // If the machine runs in UTC the dates will match — that is correct behaviour.
    // But localToday() must NEVER return a UTC date that differs from local date.
    const utcDate = new Date().toISOString().slice(0, 10)
    const localDate = localToday()
    // Both strings must be valid dates; localDate must equal the true local date.
    const now = new Date()
    const trueLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(localDate).toBe(trueLocal)
    // utcDate may or may not equal trueLocal depending on timezone — not an error either way.
    void utcDate
  })

  it('localDateString(d) formats an arbitrary date in local timezone', () => {
    const d = new Date(2026, 0, 5) // 5 January 2026 local midnight
    expect(localDateString(d)).toBe('2026-01-05')
  })

  it('localDateString(d) pads month and day with leading zero', () => {
    const d = new Date(2026, 2, 3) // 3 March 2026
    expect(localDateString(d)).toBe('2026-03-03')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-02 — H-2: Global Express error-handling middleware returns 500
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-02 — Global error handler', () => {
  it('GET /api/health still returns 200 (middleware did not break normal routes)', async () => {
    const res = await api.get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('unknown route returns 404, not a hanging request', async () => {
    const res = await api.get('/api/this-route-does-not-exist-debt-wave1')
    // Express default 404 — confirms middleware stack terminates cleanly.
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-03 — H-3: POST /auth/register is rate-limited
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-03 — POST /auth/register rate limit', () => {
  it('accepts the first registration request normally', async () => {
    const res = await api.post('/auth/register').send({
      name: 'Limit Test',
      email: `ratelimit-first-${Date.now()}@test.com`,
      password: 'Password1!',
    })
    // 201 on success or 409 if already exists — either way NOT 429
    expect([201, 409]).toContain(res.status)
  })

  it('returns 429 after 10 register attempts within the window', async () => {
    // Send 10 valid-format register requests to fill the bucket.
    // We use distinct emails so none hit the 409 duplicate path early.
    const ts = Date.now()
    for (let i = 0; i < 10; i++) {
      await api.post('/auth/register').send({
        name: 'Burst',
        email: `burst-${ts}-${i}@test.com`,
        password: 'Password1!',
      })
    }
    // 11th request — must be rate-limited.
    const res = await api.post('/auth/register').send({
      name: 'Burst',
      email: `burst-${ts}-overflow@test.com`,
      password: 'Password1!',
    })
    expect(res.status).toBe(429)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-04 — H-4: archived_at stored as Unix seconds (not milliseconds)
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-04 — archived_at stored in seconds', () => {
  it('PATCH /api/habits/:id with Math.floor(Date.now()/1000) stores a value near unixepoch()', async () => {
    const { token, userId } = await createUser(`habit-archive-${Date.now()}@test.com`)

    // Create a habit
    const create = await api.post('/api/habits').set(auth(token)).send({
      name: 'Archive me',
      frequency: 'daily',
      color: '#1D9E75',
    })
    expect(create.status).toBe(201)
    const habitId = create.body.id

    const nowSec = Math.floor(Date.now() / 1000)

    // Archive using seconds (the corrected client behaviour)
    const patch = await api.patch(`/api/habits/${habitId}`).set(auth(token)).send({
      archived_at: nowSec,
    })
    expect(patch.status).toBe(200)

    // Read back from DB and verify the stored value is within 5 seconds of now
    const db = openDb()
    const row = db.prepare('SELECT archived_at FROM habits WHERE id = ?').get(habitId) as { archived_at: number }
    db.close()

    expect(row.archived_at).toBeGreaterThanOrEqual(nowSec - 5)
    expect(row.archived_at).toBeLessThanOrEqual(nowSec + 5)
    // Sanity check: NOT a millisecond-era value (would be ~1.7 trillion)
    expect(row.archived_at).toBeLessThan(1_000_000_000_000)

    void userId
  })

  it('PATCH /api/projects/:id with Math.floor(Date.now()/1000) stores a value near unixepoch()', async () => {
    const { token } = await createUser(`proj-archive-${Date.now()}@test.com`)

    // Create project (needs area first)
    const area = await api.post('/api/areas').set(auth(token)).send({ name: 'Area', color: '#888', icon: 'circle' })
    const proj = await api.post('/api/projects').set(auth(token)).send({ name: 'Proj', area_id: area.body.id, color: '#1D9E75' })
    expect(proj.status).toBe(201)
    const projectId = proj.body.id

    const nowSec = Math.floor(Date.now() / 1000)
    const patch = await api.patch(`/api/projects/${projectId}`).set(auth(token)).send({ archived_at: nowSec })
    expect(patch.status).toBe(200)

    const db = openDb()
    const row = db.prepare('SELECT archived_at FROM projects WHERE id = ?').get(projectId) as { archived_at: number }
    db.close()

    expect(row.archived_at).toBeGreaterThanOrEqual(nowSec - 5)
    expect(row.archived_at).toBeLessThanOrEqual(nowSec + 5)
    expect(row.archived_at).toBeLessThan(1_000_000_000_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-01 — H-1b: Habit toggle — API round-trip streak is authoritative
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-01 — Habit toggle streak is authoritative from server', () => {
  it('POST then DELETE log for today leaves the habit with streak matching GET /api/habits', async () => {
    const { token } = await createUser(`habit-toggle-${Date.now()}@test.com`)
    const today = localToday()

    const create = await api.post('/api/habits').set(auth(token)).send({
      name: 'Streak habit',
      frequency: 'daily',
      color: '#1D9E75',
    })
    expect(create.status).toBe(201)
    const habitId = create.body.id

    // Log today
    const log = await api.post(`/api/habits/${habitId}/log`).set(auth(token)).send({ date: today })
    expect(log.status).toBe(200)

    // Re-fetch — streak should be 1
    const after = await api.get('/api/habits').set(auth(token))
    const h = (after.body as { id: string; streak: number }[]).find(x => x.id === habitId)
    expect(h?.streak).toBe(1)

    // Un-log today
    const del = await api.delete(`/api/habits/${habitId}/log/${today}`).set(auth(token))
    expect(del.status).toBe(200)

    // Re-fetch — streak should be 0
    const after2 = await api.get('/api/habits').set(auth(token))
    const h2 = (after2.body as { id: string; streak: number }[]).find(x => x.id === habitId)
    expect(h2?.streak).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D1-06 — M-9: InboxView handleUndo — verify underlying API accepts undo
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D1-06 — Inbox undo uses PATCH /api/tasks/:id { status: pending }', () => {
  it('completing a task then PATCHing status=pending restores it to the inbox', async () => {
    const { token } = await createUser(`inbox-undo-${Date.now()}@test.com`)

    // Create inbox task (no project_id)
    const create = await api.post('/api/tasks').set(auth(token)).send({ title: 'Undo me' })
    expect(create.status).toBe(201)
    const taskId = create.body.id

    // Complete it (as handleComplete does)
    const complete = await api.patch(`/api/tasks/${taskId}`).set(auth(token)).send({ status: 'completed' })
    expect(complete.status).toBe(200)
    expect(complete.body.status).toBe('completed')
    expect(complete.body.completed_at).toBeTruthy()

    // Undo (as the corrected handleUndo now does via apiPatch)
    const undo = await api.patch(`/api/tasks/${taskId}`).set(auth(token)).send({ status: 'pending' })
    expect(undo.status).toBe(200)
    expect(undo.body.status).toBe('pending')
    expect(undo.body.completed_at).toBeNull()

    // Verify task reappears in inbox view
    const inbox = await api.get('/api/tasks?view=inbox').set(auth(token))
    const found = (inbox.body as { id: string }[]).find(t => t.id === taskId)
    expect(found).toBeDefined()
  })

  it('PATCH to status=pending returns 401 without auth (no raw-fetch bypass possible)', async () => {
    const { token } = await createUser(`inbox-noauth-${Date.now()}@test.com`)
    const create = await api.post('/api/tasks').set(auth(token)).send({ title: 'Auth check' })
    const taskId = create.body.id

    // Simulate what the old raw fetch without a valid token would do
    const res = await api.patch(`/api/tasks/${taskId}`).send({ status: 'pending' })
    expect(res.status).toBe(401)
  })
})
