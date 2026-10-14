import { Router, type Response } from 'express'
import type OpenAI from 'openai'
import { openDb } from '../../db/migrate.js'
import { requireAuth, type AuthRequest } from '../middleware/requireAuth.js'
import { agentLoop } from '../lib/agentLoop.js'
import { REPORT_DEFINITIONS } from '../lib/reportDefs.js'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam

function sseErr(res: Response, message: string): void {
  res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
}

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

// DIR-M-02: one active SSE stream per user — abort previous before starting new
const activeStreams = new Map<string, AbortController>()

// GET /api/reports/definitions — list available report definitions (without systemPrompt)
reportsRouter.get('/definitions', (_req, res) => {
  res.json(
    REPORT_DEFINITIONS.map(({ id, title, description, tools }) => ({
      id,
      title,
      description,
      tools,
    })),
  )
})

// POST /api/reports/run/:reportId — run a pre-built report (SSE)
reportsRouter.post('/run/:reportId', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { reportId } = req.params

  const report = REPORT_DEFINITIONS.find(r => r.id === reportId)
  if (!report) {
    return res.status(404).json({ error: `Report '${reportId}' not found` })
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
    // Create a new chat session for this report run
    const ins = db.prepare(
      `INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)`,
    ).run(userId, `Report: ${report.title}`)
    const sessionRow = db.prepare('SELECT id FROM chat_sessions WHERE rowid = ?')
      .get(ins.lastInsertRowid) as { id: string }
    const sessionId = sessionRow.id

    // Build messages with the report-mode system prompt
    const messages: Msg[] = [
      { role: 'system', content: report.systemPrompt },
      { role: 'user', content: `Generate the ${report.title} report.` },
    ]

    // Run agentic loop (streams SSE events to res)
    const { assistantText, toolCallLog } = await agentLoop({ messages, userId, res, signal: controller.signal })

    // Persist user trigger message
    db.prepare(
      `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)`,
    ).run(sessionId, `Generate the ${report.title} report.`)

    // Persist assistant report
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

    db.prepare('UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?').run(sessionId)

    res.write(`event: done\ndata: ${JSON.stringify({ sessionId, messageId: msgRow.id })}\n\n`)
  } catch (err) {
    sseErr(res, err instanceof Error ? err.message : String(err))
  } finally {
    db.close()
    res.end()
  }
})
