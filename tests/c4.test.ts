/**
 * Phase C4 — Agentic Reports tests
 * NVIDIA client is mocked so no real API key is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../server/app.js'
import { openDb, runMigrations } from '../db/migrate.js'
import { hashPassword, createSession } from '../server/auth.js'

// ── NVIDIA mock ───────────────────────────────────────────────────────────────

const mockCreate = vi.fn()

vi.mock('../server/lib/nvidia.js', () => ({
  createNvidiaClient: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
  NVIDIA_MODEL: 'mock-model',
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

async function makeUser(email: string, name = 'C4 User') {
  await runMigrations()
  const db = openDb()
  const hash = await hashPassword('Pass1234!')
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, name, hash)
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as { id: string; email: string; name: string }
  const token = createSession(db, user.id)
  db.close()
  return { user, token }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

function parseSSE(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  let curEvent = ''
  let curData = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) curEvent = line.slice(7).trim()
    else if (line.startsWith('data: ')) curData = line.slice(6).trim()
    else if (line === '' && curEvent) {
      try { events.push({ event: curEvent, data: JSON.parse(curData) }) }
      catch { events.push({ event: curEvent, data: curData }) }
      curEvent = ''
      curData = ''
    }
  }
  return events
}

function stopResponse(content: string): AsyncGenerator<unknown> {
  return (async function* () {
    yield { choices: [{ delta: { content, role: 'assistant' }, finish_reason: null }] }
    yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
  })()
}

// ── Report definition tests (no NVIDIA) ──────────────────────────────────────

describe('Phase C4 — Report Definitions API', () => {
  let token: string

  beforeEach(async () => {
    const u = await makeUser(`c4-defs-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
  })

  it('GET /api/reports/definitions returns 5 report objects', async () => {
    const res = await request(app).get('/api/reports/definitions').set(auth(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect((res.body as unknown[]).length).toBe(5)
  })

  it('report definitions have required fields and no systemPrompt', async () => {
    const res = await request(app).get('/api/reports/definitions').set(auth(token))
    const defs = res.body as Array<Record<string, unknown>>
    for (const def of defs) {
      expect(typeof def.id).toBe('string')
      expect(typeof def.title).toBe('string')
      expect(typeof def.description).toBe('string')
      expect(Array.isArray(def.tools)).toBe(true)
      expect(def.systemPrompt).toBeUndefined()
    }
  })

  it('all 5 expected report IDs are present', async () => {
    const res = await request(app).get('/api/reports/definitions').set(auth(token))
    const ids = (res.body as Array<{ id: string }>).map(d => d.id)
    expect(ids).toContain('productivity_today')
    expect(ids).toContain('weekly_review')
    expect(ids).toContain('overdue_analysis')
    expect(ids).toContain('habit_performance')
    expect(ids).toContain('project_status')
  })

  it('GET /api/reports/definitions returns 401 without token', async () => {
    const res = await request(app).get('/api/reports/definitions')
    expect(res.status).toBe(401)
  })

  it('POST /api/reports/run/unknown returns 404', async () => {
    const res = await request(app)
      .post('/api/reports/run/nonexistent_report')
      .set(auth(token))
    expect(res.status).toBe(404)
  })

  it('POST /api/reports/run/:reportId returns 401 without token', async () => {
    const res = await request(app).post('/api/reports/run/productivity_today')
    expect(res.status).toBe(401)
  })
})

// ── C4.3 — Report run creates session with assistant message ─────────────────

describe('C4.3 — report run creates session with assistant message', () => {
  let token: string

  beforeEach(async () => {
    const u = await makeUser(`c4-run-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
    mockCreate.mockImplementation(() =>
      Promise.resolve(stopResponse('## Productivity Report\n\nAll tasks on track!')),
    )
  })

  it('POST /api/reports/run/:reportId returns text/event-stream with done event', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    const events = parseSSE(res.text)
    expect(events.some(e => e.event === 'done')).toBe(true)
  })

  it('C4.3: GET /api/chat/sessions/:id returns session with assistant message after report run', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
    const events = parseSSE(res.text)
    const done = events.find(e => e.event === 'done')
    expect(done).toBeDefined()
    const { sessionId } = done!.data as { sessionId: string }
    expect(sessionId).toBeDefined()

    const sessRes = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    expect(sessRes.status).toBe(200)
    const messages = sessRes.body.messages as Array<{ role: string; content: string }>
    const assistantMsg = messages.find(m => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.content.length).toBeGreaterThan(0)
  })
})

// ── C4.4 — Follow-up chat in a report session ────────────────────────────────

describe('C4.4 — follow-up message in report session returns valid SSE stream', () => {
  let token: string
  let reportSessionId: string

  beforeEach(async () => {
    const u = await makeUser(`c4-followup-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
    mockCreate.mockImplementation(() =>
      Promise.resolve(stopResponse('Here is the report summary.')),
    )

    // Create a report session to use as the base for follow-up
    const runRes = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
    const events = parseSSE(runRes.text)
    const done = events.find(e => e.event === 'done')
    reportSessionId = (done?.data as { sessionId?: string })?.sessionId ?? ''
  })

  it('C4.4: POST /api/chat/message with report session returns SSE stream with done event', async () => {
    expect(reportSessionId).toBeTruthy()

    mockCreate.mockReset()
    mockCreate.mockImplementation(() =>
      Promise.resolve(stopResponse('Based on the report, everything looks great!')),
    )

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: reportSessionId, content: 'Can you summarise the report?' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    const events = parseSSE(res.text)
    expect(events.some(e => e.event === 'done')).toBe(true)
    const done = events.find(e => e.event === 'done')
    const data = done!.data as { sessionId: string }
    expect(data.sessionId).toBe(reportSessionId)
  })
})
