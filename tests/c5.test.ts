/**
 * Phase C5 — Memory tests
 * NVIDIA client is mocked so no real API key is needed.
 * All acceptance criteria run deterministically without a live NVIDIA key.
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

async function makeUser(email: string, name = 'Test User') {
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

// Non-streaming response for compressSession / generateSessionTitle calls
function plainResponse(content: string) {
  return { choices: [{ message: { content } }] }
}

// ── C5.1 — Context injection ─────────────────────────────────────────────────

describe('C5.1 — Context injection: system message includes date and user name', () => {
  it('agentLoop receives a system message containing current date and user name', async () => {
    const userName = `C5-CtxUser-${Date.now()}`
    const { token } = await makeUser(`c5-ctx-${Date.now()}@test.local`, userName)

    mockCreate.mockReset()
    mockCreate.mockImplementation(() => Promise.resolve(stopResponse('Hello!')))

    await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'Hello context test' })

    expect(mockCreate).toHaveBeenCalled()
    const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const systemMessages = callArgs.messages.filter(m => m.role === 'system')

    const today = new Date().toISOString().slice(0, 10)
    const contextMsg = systemMessages.find(m =>
      m.content.includes(today) && m.content.includes(userName),
    )
    expect(contextMsg).toBeDefined()
    expect(contextMsg!.content).toContain('[Live Context')
  })
})

// ── C5.2 — Session title auto-generation ─────────────────────────────────────

describe('C5.2 — Session title: non-default title set after first message', () => {
  it('GET /api/chat/sessions returns session with title !== "New Chat"', async () => {
    const { token } = await makeUser(`c5-title-${Date.now()}@test.local`)
    mockCreate.mockReset()
    // agentLoop call → streaming response
    mockCreate.mockImplementation(() => Promise.resolve(stopResponse('Got it!')))

    const content = 'What tasks do I have due today?'
    const res = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content })

    expect(res.status).toBe(200)
    const events = parseSSE(res.text)
    const done = events.find(e => e.event === 'done')
    expect(done).toBeDefined()
    const { sessionId } = done!.data as { sessionId: string }

    const sessionsRes = await request(app)
      .get('/api/chat/sessions')
      .set(auth(token))
    expect(sessionsRes.status).toBe(200)
    const sessions = sessionsRes.body as Array<{ id: string; title: string }>
    const session = sessions.find(s => s.id === sessionId)
    expect(session).toBeDefined()
    // Fallback title is set synchronously from content; must not remain 'New Chat'
    expect(session!.title).not.toBe('New Chat')
    expect(session!.title.length).toBeGreaterThan(0)
  })
})

// ── C5.3 & C5.4 — Context compression + rolling window ───────────────────────

describe('C5.3 & C5.4 — Context compression: rolling ≤20 message window', () => {
  it('C5.3: chat_sessions.summary is set after compression triggers', async () => {
    const { token } = await makeUser(`c5-compress-${Date.now()}@test.local`)
    mockCreate.mockReset()

    // Seed session via first message
    mockCreate.mockImplementation(() => Promise.resolve(stopResponse('Session seeded.')))
    const seedRes = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'Seed message' })
    const seedEvents = parseSSE(seedRes.text)
    const seedDone = seedEvents.find(e => e.event === 'done')
    expect(seedDone).toBeDefined()
    const { sessionId } = seedDone!.data as { sessionId: string }

    // Insert 21 extra messages directly to push total over the 20-message threshold
    const db = openDb()
    try {
      const insertMsg = db.prepare(
        `INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)`,
      )
      for (let i = 0; i < 21; i++) {
        insertMsg.run(sessionId, i % 2 === 0 ? 'user' : 'assistant', `Filler message ${i + 1}`)
      }
    } finally {
      db.close()
    }

    mockCreate.mockReset()
    // compressSession calls NVIDIA (non-streaming) → return plain response
    mockCreate.mockResolvedValueOnce(plainResponse('Earlier in the session the user asked about tasks.'))
    // agentLoop calls NVIDIA (streaming) → return stream
    mockCreate.mockResolvedValueOnce(stopResponse('Your tasks are on track!'))
    // generateSessionTitle won't fire (msgCount > 2); nothing else needs mocking

    const longRes = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId, content: 'Are my tasks on track?' })

    expect(longRes.status).toBe(200)
    expect(longRes.headers['content-type']).toContain('text/event-stream')
    const longEvents = parseSSE(longRes.text)
    expect(longEvents.some(e => e.event === 'done')).toBe(true)

    // C5.3: summary should be stored in chat_sessions
    const db2 = openDb()
    try {
      const row = db2.prepare('SELECT summary FROM chat_sessions WHERE id = ?').get(sessionId) as { summary: string | null }
      expect(row.summary).toBeTruthy()
      expect(row.summary).toContain('Earlier in the session')
    } finally {
      db2.close()
    }
  })

  it('C5.4: messages array passed to NVIDIA for agentLoop never exceeds 20 entries', async () => {
    const { token } = await makeUser(`c5-window-${Date.now()}@test.local`)
    mockCreate.mockReset()

    // Seed session
    mockCreate.mockImplementation(() => Promise.resolve(stopResponse('Session seeded.')))
    const seedRes = await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId: null, content: 'Seed' })
    const seedEvents = parseSSE(seedRes.text)
    const { sessionId } = (seedEvents.find(e => e.event === 'done')!.data as { sessionId: string })

    // Push total over 20
    const db = openDb()
    try {
      const insertMsg = db.prepare(
        `INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)`,
      )
      for (let i = 0; i < 21; i++) {
        insertMsg.run(sessionId, i % 2 === 0 ? 'user' : 'assistant', `Msg ${i}`)
      }
    } finally {
      db.close()
    }

    mockCreate.mockReset()
    // compressSession (non-streaming)
    mockCreate.mockResolvedValueOnce(plainResponse('Conversation summary here.'))
    // agentLoop (streaming) — capture the call args
    mockCreate.mockResolvedValueOnce(stopResponse('Here is your answer.'))

    await request(app)
      .post('/api/chat/message')
      .set(auth(token))
      .send({ sessionId, content: 'Turn 25+' })

    // The second mockCreate call is the agentLoop NVIDIA call
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(2)
    const agentLoopCall = mockCreate.mock.calls[1][0] as { messages: unknown[]; stream?: boolean }
    // agentLoop call includes stream: true
    expect(agentLoopCall.stream).toBe(true)
    // messages array must be ≤ 20 (system prompt + context msg + compressed history)
    expect(agentLoopCall.messages.length).toBeLessThanOrEqual(20)
  })
})
