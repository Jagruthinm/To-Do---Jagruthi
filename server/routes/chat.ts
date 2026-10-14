import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Router, type Response } from 'express'
import type OpenAI from 'openai'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'
import { agentLoop } from '../lib/agentLoop.js'
import { createNvidiaClient, NVIDIA_MODEL } from '../lib/nvidia.js'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam

const AGENT_SYSTEM_PROMPT = readFileSync(
  join(process.cwd(), 'Instructions', 'AGENT-LOOP.md'),
  'utf-8',
)

function sseErr(res: Response, message: string): void {
  res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
}

// C5.2 — fire-and-forget NVIDIA session title generation
async function generateSessionTitle(sessionId: string, userMessage: string): Promise<void> {
  try {
    const client = createNvidiaClient()
    const resp = await client.chat.completions.create({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: 'user',
          content: `Generate a 4–6 word title for this conversation based on the first user message: ${userMessage}`,
        },
      ],
    })
    const title = resp.choices[0]?.message?.content?.trim()
    if (!title) return
    const db = openDb()
    try {
      db.prepare('UPDATE chat_sessions SET title = ?, updated_at = unixepoch() WHERE id = ?')
        .run(title.slice(0, 100), sessionId)
    } finally {
      db.close()
    }
  } catch {
    // best-effort; title stays as truncated content
  }
}

// C5.3 — summarise oldest 10 messages when session exceeds 20 messages
async function compressSession(
  db: ReturnType<typeof openDb>,
  sessionId: string,
): Promise<void> {
  const oldest = db.prepare(`
    SELECT id, role, content FROM chat_messages
    WHERE session_id = ? AND role != 'system'
    ORDER BY created_at ASC
    LIMIT 10
  `).all(sessionId) as { id: string; role: string; content: string }[]

  if (oldest.length < 10) return

  try {
    const client = createNvidiaClient()
    const excerpt = oldest.map(m => `${m.role}: ${m.content}`).join('\n')
    const resp = await client.chat.completions.create({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: 'user',
          content: `Summarise the following conversation excerpt in 2–4 sentences for use as context in a continuing conversation:\n\n${excerpt}`,
        },
      ],
    })
    const summaryText = resp.choices[0]?.message?.content?.trim()
    if (!summaryText) return

    db.prepare('UPDATE chat_sessions SET summary = ? WHERE id = ?').run(summaryText, sessionId)

    const deleteStmt = db.prepare('DELETE FROM chat_messages WHERE id = ?')
    for (const m of oldest) deleteStmt.run(m.id)

    db.prepare(
      `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'system', ?)`,
    ).run(sessionId, `[Conversation summary: ${summaryText}]`)
  } catch {
    // best-effort; proceed without compression
  }
}

export const chatRouter = Router()
chatRouter.use(requireAuth)

// DIR-M-02: one active SSE stream per user — abort previous before starting new
const activeStreams = new Map<string, AbortController>()

// POST /api/chat/message — start or continue a conversation (SSE)
chatRouter.post('/message', async (req, res) => {
  const { userId, user } = req as unknown as AuthRequest
  const userName = user.name
  const { sessionId: inputSessionId, content } = req.body as {
    sessionId: string | null
    content: string
  }

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' })
  }

  // Abort any existing stream for this user
  activeStreams.get(userId)?.abort()
  const controller = new AbortController()
  activeStreams.set(userId, controller)
  res.on('close', () => activeStreams.delete(userId))

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const db = openDb()
  try {
    // Resolve or create session
    let sessionId = inputSessionId
    if (!sessionId) {
      const ins = db.prepare(
        `INSERT INTO chat_sessions (user_id, title) VALUES (?, 'New Chat')`,
      ).run(userId)
      const row = db.prepare('SELECT id FROM chat_sessions WHERE rowid = ?')
        .get(ins.lastInsertRowid) as { id: string }
      sessionId = row.id
    } else {
      const existing = db.prepare(
        'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
      ).get(sessionId, userId)
      if (!existing) {
        sseErr(res, 'Session not found')
        res.end()
        return
      }
    }

    // Save user message
    db.prepare(
      `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)`,
    ).run(sessionId, content)

    // C5.3 — compress if message count exceeds 20
    const totalMsgCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?',
    ).get(sessionId) as { c: number }).c
    if (totalMsgCount > 20) {
      await compressSession(db, sessionId)
    }

    // Load last 20 messages for context
    const history = db.prepare(`
      SELECT role, content FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT 20
    `).all(sessionId) as { role: string; content: string }[]

    // Build messages array (system + history including the user message we just saved)
    const messages: Msg[] = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      ...history.map(r => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      })),
    ]

    // Run the agentic loop (streams SSE events to res)
    const { assistantText, toolCallLog } = await agentLoop({ messages, userId, userName, res, signal: controller.signal })

    // Persist assistant turn
    const msgIns = db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, tool_calls)
      VALUES (?, 'assistant', ?, ?)
    `).run(
      sessionId,
      assistantText,
      toolCallLog.length > 0 ? JSON.stringify(toolCallLog) : null,
    )
    const msgRow = db.prepare('SELECT id FROM chat_messages WHERE rowid = ?')
      .get(msgIns.lastInsertRowid) as { id: string }

    // Update session metadata
    const msgCount = (
      db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE session_id = ?')
        .get(sessionId) as { c: number }
    ).c
    if (msgCount <= 2) {
      // Set a fallback title immediately; C5.2 overwrites it once NVIDIA responds
      db.prepare('UPDATE chat_sessions SET title = ?, updated_at = unixepoch() WHERE id = ?')
        .run(content.slice(0, 60), sessionId)
      void generateSessionTitle(sessionId, content)
    } else {
      db.prepare('UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?')
        .run(sessionId)
    }

    res.write(`event: done\ndata: ${JSON.stringify({ sessionId, messageId: msgRow.id })}\n\n`)
  } catch (err) {
    console.error('[chat] error:', err)
    sseErr(res, err instanceof Error ? err.message : String(err))
  } finally {
    db.close()
    res.end()
  }
})

// GET /api/chat/sessions — list sessions for current user
chatRouter.get('/sessions', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const db = openDb()
  try {
    const sessions = db.prepare(`
      SELECT id, title, created_at, updated_at, summary
      FROM chat_sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `).all(userId)
    res.json(sessions)
  } finally {
    db.close()
  }
})

// GET /api/chat/sessions/:id — get session with messages
chatRouter.get('/sessions/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { id } = req.params
  const db = openDb()
  try {
    const session = db.prepare(
      'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
    ).get(id, userId) as Record<string, unknown> | undefined
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const messages = db.prepare(`
      SELECT id, role, content, tool_calls, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(id)
    res.json({ ...session, messages })
  } finally {
    db.close()
  }
})

// DELETE /api/chat/sessions/:id — delete a session
chatRouter.delete('/sessions/:id', (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { id } = req.params
  const db = openDb()
  try {
    const session = db.prepare(
      'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
    ).get(id, userId)
    if (!session) return res.status(404).json({ error: 'Session not found' })

    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
    res.status(204).end()
  } finally {
    db.close()
  }
})
