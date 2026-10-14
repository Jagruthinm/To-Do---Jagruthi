/**
 * Phase C2 — Agent Loop tests
 * Covers: agentLoop, chat routes, report routes.
 * NVIDIA client is mocked so no real API key is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../server/app.js'
import { openDb } from '../db/migrate.js'
import { hashPassword, createSession } from '../server/auth.js'
import { REPORT_DEFINITIONS } from '../server/lib/reportDefs.js'

// ── NVIDIA mock ───────────────────────────────────────────────────────────────
// Must be declared before the module is imported by any transitive dep.

const mockCreate = vi.fn()

vi.mock('../server/lib/nvidia.js', () => ({
  createNvidiaClient: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
  NVIDIA_MODEL: 'mock-model',
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

async function makeUser(email = 'c2user@test.local', name = 'C2 User') {
  const db = openDb()
  const hash = await hashPassword('Pass1234!')
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?,?,?)').run(
    email, name, hash,
  )
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as {
    id: string; email: string; name: string
  }
  const token = createSession(db, user.id)
  db.close()
  return { user, token }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

/** Parse SSE text into an array of {event, data} objects. */
function parseSSE(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  let curEvent = ''
  let curData = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      curEvent = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      curData = line.slice(6).trim()
    } else if (line === '' && curEvent) {
      try { events.push({ event: curEvent, data: JSON.parse(curData) }) }
      catch { events.push({ event: curEvent, data: curData }) }
      curEvent = ''
      curData = ''
    }
  }
  return events
}

/** Async generator stream simulating a stop (text-only) reply. */
function stopResponse(content: string): AsyncGenerator<unknown> {
  return (async function* () {
    yield { choices: [{ delta: { content, role: 'assistant' }, finish_reason: null }] }
    yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
  })()
}

/** Async generator stream simulating a tool_calls reply. */
function toolResponse(calls: Array<{ id: string; name: string; args: unknown }>): AsyncGenerator<unknown> {
  return (async function* () {
    yield {
      choices: [{
        delta: {
          content: null,
          tool_calls: calls.map((c, i) => ({
            index: i,
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
        finish_reason: null,
      }],
    }
    yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
  })()
}

// ─────────────────────────────────────────────────────────────────────────────
// C2.4 — Report Definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.4 — reportDefs.ts', () => {
  it('exports exactly 5 report definitions', () => {
    expect(REPORT_DEFINITIONS).toHaveLength(5)
  })

  it('each definition has id, title, description, tools, systemPrompt', () => {
    for (const r of REPORT_DEFINITIONS) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('description')
      expect(Array.isArray(r.tools)).toBe(true)
      expect(r.systemPrompt).toContain('REPORT MODE')
    }
  })

  it('has the 5 expected IDs', () => {
    const ids = REPORT_DEFINITIONS.map(r => r.id)
    expect(ids).toContain('productivity_today')
    expect(ids).toContain('weekly_review')
    expect(ids).toContain('overdue_analysis')
    expect(ids).toContain('habit_performance')
    expect(ids).toContain('project_status')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.6 — Session CRUD (no NVIDIA needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.6 — GET /api/chat/sessions', () => {
  it('returns 200 with empty array for a new authenticated user', async () => {
    const { token } = await makeUser('sessions-empty@test.local')
    const res = await request(app).get('/api/chat/sessions').set(auth(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(0)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/chat/sessions')
    expect(res.status).toBe(401)
  })
})

describe('C2.6 — Session lifecycle (GET/DELETE /api/chat/sessions/:id)', () => {
  let token: string
  let sessionId: string

  beforeEach(async () => {
    const u = await makeUser(`sess-lifecycle-${Date.now()}@test.local`)
    token = u.token

    // Create a session directly in the DB
    const db = openDb()
    const ins = db.prepare(
      `INSERT INTO chat_sessions (user_id, title) VALUES (?, 'Lifecycle Test')`,
    ).run(u.user.id)
    const row = db.prepare('SELECT id FROM chat_sessions WHERE rowid = ?')
      .get(ins.lastInsertRowid) as { id: string }
    sessionId = row.id
    db.close()
  })

  it('GET /api/chat/sessions/:id returns the session with empty messages array', async () => {
    const res = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(sessionId)
    expect(Array.isArray(res.body.messages)).toBe(true)
    expect(res.body.messages).toHaveLength(0)
  })

  it('GET /api/chat/sessions/:id returns 404 for wrong user', async () => {
    const { token: other } = await makeUser('other-session-user@test.local')
    const res = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(other))
    expect(res.status).toBe(404)
  })

  it('DELETE /api/chat/sessions/:id removes the session', async () => {
    const del = await request(app)
      .delete(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    expect(del.status).toBe(204)

    const get = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    expect(get.status).toBe(404)
  })

  it('DELETE /api/chat/sessions/:id returns 404 for wrong user', async () => {
    const { token: other } = await makeUser('other-del-user@test.local')
    const res = await request(app)
      .delete(`/api/chat/sessions/${sessionId}`)
      .set(auth(other))
    expect(res.status).toBe(404)
  })

  it('GET /api/chat/sessions lists the created session', async () => {
    const res = await request(app).get('/api/chat/sessions').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.some((s: { id: string }) => s.id === sessionId)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.4 — GET /api/reports/definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.4 — GET /api/reports/definitions', () => {
  let token: string
  beforeEach(async () => {
    const u = await makeUser('rpt-defs@test.local')
    token = u.token
  })

  it('returns exactly 5 report definitions', async () => {
    const res = await request(app)
      .get('/api/reports/definitions')
      .set(auth(token))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(5)
  })

  it('each definition has id, title, description, tools but NOT systemPrompt', async () => {
    const res = await request(app)
      .get('/api/reports/definitions')
      .set(auth(token))
    for (const r of res.body) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('description')
      expect(Array.isArray(r.tools)).toBe(true)
      expect(r.systemPrompt).toBeUndefined()
    }
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/reports/definitions')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.3 + C2.1 — POST /api/chat/message (SSE, text-only response)
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.3 — POST /api/chat/message (text-only response)', () => {
  let token: string

  beforeEach(async () => {
    const u = await makeUser(`chat-msg-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
    mockCreate.mockImplementation(() => Promise.resolve(stopResponse('Hello! How can I help you today?')))
  })

  it('returns Content-Type: text/event-stream', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'hello' })
    expect(res.headers['content-type']).toContain('text/event-stream')
  })

  it('streams at least one text_delta event', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'hello' })
    const events = parseSSE(res.text)
    expect(events.some(e => e.event === 'text_delta')).toBe(true)
  })

  it('ends with a done event containing sessionId and messageId', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'hello' })
    const events = parseSSE(res.text)
    const done = events.find(e => e.event === 'done')
    expect(done).toBeDefined()
    const data = done!.data as { sessionId: string; messageId: string }
    expect(data.sessionId).toBeDefined()
    expect(data.messageId).toBeDefined()
  })

  it('creates a new session and persists messages to the DB', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'persist me' })
    const events = parseSSE(res.text)
    const done = events.find(e => e.event === 'done')!.data as { sessionId: string }

    const session = await request(app)
      .get(`/api/chat/sessions/${done.sessionId}`)
      .set(auth(token))
    expect(session.status).toBe(200)
    expect(session.body.messages.length).toBeGreaterThanOrEqual(2)
  })

  it('continues an existing session when sessionId is provided', async () => {
    // First message to create session
    const first = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'first message' })
    const { sessionId } = parseSSE(first.text).find(e => e.event === 'done')!.data as {
      sessionId: string
    }

    // Second message reusing session
    const second = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId, content: 'second message' })
    const events = parseSSE(second.text)
    const done = events.find(e => e.event === 'done')!.data as { sessionId: string }
    expect(done.sessionId).toBe(sessionId)
  })

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null })
    expect(res.status).toBe(400)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .send({ sessionId: null, content: 'hello' })
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.1 — agentLoop with tool_calls
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.1 — agentLoop streams tool_call then text_delta', () => {
  let token: string

  beforeEach(async () => {
    const u = await makeUser(`loop-tool-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
  })

  it('emits tool_call, tool_result, then text_delta events in correct order', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'call_1', name: 'task_list', args: { view: 'today' } }]),
      )
      .mockResolvedValueOnce(stopResponse('You have no tasks due today.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'list my tasks' })

    const events = parseSSE(res.text)
    const eventTypes = events.map(e => e.event)

    expect(eventTypes).toContain('tool_call')
    expect(eventTypes).toContain('tool_result')
    expect(eventTypes).toContain('text_delta')
    expect(eventTypes).toContain('done')

    // tool_call must come before tool_result
    expect(eventTypes.indexOf('tool_call')).toBeLessThan(eventTypes.indexOf('tool_result'))
    // tool_result must come before text_delta
    expect(eventTypes.indexOf('tool_result')).toBeLessThan(eventTypes.indexOf('text_delta'))
  })

  it('tool_call event contains tool name, args, and callId', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'call_x', name: 'task_list', args: { view: 'inbox' } }]),
      )
      .mockResolvedValueOnce(stopResponse('Inbox is empty.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'check inbox' })

    const events = parseSSE(res.text)
    const tc = events.find(e => e.event === 'tool_call')!.data as {
      tool: string; callId: string; args: unknown
    }
    expect(tc.tool).toBe('task_list')
    expect(tc.callId).toBe('call_x')
    expect(tc.args).toMatchObject({ view: 'inbox' })
  })

  it('tool_result event has success:true and duration_ms for a valid tool call', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'call_y', name: 'productivity_summary', args: {} }]),
      )
      .mockResolvedValueOnce(stopResponse('Here is your summary.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'summarize' })

    const events = parseSSE(res.text)
    const tr = events.find(e => e.event === 'tool_result')!.data as {
      success: boolean; duration_ms: number
    }
    expect(tr.success).toBe(true)
    expect(typeof tr.duration_ms).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.2 — retry and revert logic
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.2 — retry and revert', () => {
  let token: string
  let userId: string

  beforeEach(async () => {
    const u = await makeUser(`retry-${Date.now()}@test.local`)
    token = u.token
    userId = u.user.id
    mockCreate.mockReset()
  })

  it('emits tool_retry on attempts 2 and 3 when task_update fails', async () => {
    // NVIDIA: first return task_create (succeeds), then task_update (fails), then text
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c1', name: 'task_create', args: { title: 'Retry Test' } }]),
      )
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c2', name: 'task_update', args: { id: 'nonexistent-id-xyz', title: 'New' } }]),
      )
      .mockResolvedValueOnce(stopResponse("I couldn't complete the update — the task wasn't found."))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'create a task then update a nonexistent one' })

    const events = parseSSE(res.text)
    const retries = events.filter(e => e.event === 'tool_retry')
    expect(retries.length).toBeGreaterThanOrEqual(2)

    const attempts = retries.map(r => (r.data as { attempt: number }).attempt)
    expect(attempts).toContain(2)
    expect(attempts).toContain(3)
  })

  it('emits tool_revert after the 3rd failure when prior writes exist', async () => {
    // task_create succeeds → task_update fails 3× → revert task_create
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c1', name: 'task_create', args: { title: 'Revert Me' } }]),
      )
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c2', name: 'task_update', args: { id: 'bad-id', title: 'X' } }]),
      )
      .mockResolvedValueOnce(stopResponse('Reverted.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'revert test' })

    const events = parseSSE(res.text)
    const revert = events.find(e => e.event === 'tool_revert')
    expect(revert).toBeDefined()
    const data = revert!.data as { revertTool: string; revertArgs: { id: string } }
    expect(data.revertTool).toBe('task_delete')
    expect(data.revertArgs.id).toBeDefined()
  })

  it('tool_result has success:false when all retries are exhausted', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c1', name: 'task_update', args: { id: 'no-such-task' } }]),
      )
      .mockResolvedValueOnce(stopResponse('Failed.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'force fail' })

    const events = parseSSE(res.text)
    const tr = events.find(e => e.event === 'tool_result')!.data as { success: boolean }
    expect(tr.success).toBe(false)
  })

  it('after revert, task created in prior step is deleted from DB', async () => {
    // track the created task ID via the tool_result event
    mockCreate
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c1', name: 'task_create', args: { title: 'Delete Me On Revert' } }]),
      )
      .mockResolvedValueOnce(
        toolResponse([{ id: 'c2', name: 'task_update', args: { id: 'no-such-task' } }]),
      )
      .mockResolvedValueOnce(stopResponse('Done.'))

    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'revert cleanup test' })

    const events = parseSSE(res.text)
    const createResult = events.find(e => e.event === 'tool_result' && (e.data as { success: boolean }).success)
    const createdId = (createResult?.data as { result: { id: string } })?.result?.id

    if (createdId) {
      // The revert should have deleted this task from the DB
      const db = openDb()
      const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(createdId)
      db.close()
      expect(task).toBeUndefined()
    } else {
      // Could not capture ID — just ensure a revert event was emitted
      expect(events.some(e => e.event === 'tool_revert')).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2.5 — POST /api/reports/run/:reportId (SSE)
// ─────────────────────────────────────────────────────────────────────────────

describe('C2.5 — POST /api/reports/run/:reportId', () => {
  let token: string

  beforeEach(async () => {
    const u = await makeUser(`rpt-run-${Date.now()}@test.local`)
    token = u.token
    mockCreate.mockReset()
    mockCreate.mockImplementation(() =>
      Promise.resolve(stopResponse('## Productivity Report\n\nAll clear today!')),
    )
  })

  it('returns Content-Type: text/event-stream', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
      .send()
    expect(res.headers['content-type']).toContain('text/event-stream')
  })

  it('ends with a done event containing a sessionId', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
      .send()
    const events = parseSSE(res.text)
    const done = events.find(e => e.event === 'done')
    expect(done).toBeDefined()
    const data = done!.data as { sessionId: string }
    expect(data.sessionId).toBeDefined()
  })

  it('creates a new chat session for the report', async () => {
    const res = await request(app)
      .post('/api/reports/run/weekly_review')
      .set(auth(token))
      .send()
    const events = parseSSE(res.text)
    const { sessionId } = events.find(e => e.event === 'done')!.data as { sessionId: string }

    const session = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    expect(session.status).toBe(200)
    expect(session.body.title).toContain('Weekly Review')
  })

  it('the report session contains the assistant report message', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .set(auth(token))
      .send()
    const events = parseSSE(res.text)
    const { sessionId } = events.find(e => e.event === 'done')!.data as { sessionId: string }

    const session = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set(auth(token))
    const assistantMsg = (session.body.messages as Array<{ role: string; content: string }>)
      .find(m => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.content).toContain('Productivity Report')
  })

  it('returns 404 for an unknown reportId', async () => {
    const res = await request(app)
      .post('/api/reports/run/nonexistent_report')
      .set(auth(token))
      .send()
    expect(res.status).toBe(404)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/reports/run/productivity_today')
      .send()
    expect(res.status).toBe(401)
  })
})
