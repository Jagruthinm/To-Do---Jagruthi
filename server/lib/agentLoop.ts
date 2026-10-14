import type { Response } from 'express'
import type OpenAI from 'openai'
import { createNvidiaClient, NVIDIA_MODEL } from './nvidia.js'
import { TOOL_DEFINITIONS } from './toolDefs.js'
import { openDb } from '../../db/migrate.js'
import {
  taskCreate,
  taskList,
  taskUpdate,
  taskComplete,
  taskDelete,
  taskRestore,
  projectList,
  habitLog,
  habitStats,
  productivitySummary,
  taskSearch,
} from './taskflowTools.js'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam

export interface ToolCallLog {
  tool: string
  args: unknown
  result: unknown
  duration_ms: number
  success: boolean
}

export interface AgentLoopResult {
  assistantText: string
  toolCallLog: ToolCallLog[]
}

export interface AgentLoopParams {
  messages: Msg[]
  userId: string
  userName?: string
  res: Response
  signal?: AbortSignal
}

const MAX_ITERATIONS = 10
const MAX_RETRIES = 3

const WRITE_TOOLS = new Set([
  'task_create', 'task_update', 'task_complete', 'task_delete', 'habit_log',
])

interface CompletedWrite {
  tool: string
  args: Record<string, unknown>
  result: unknown
  preImage?: Record<string, unknown>
}

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function isError(result: unknown): boolean {
  return !!(result && typeof result === 'object' && 'error' in result)
}

function dispatchTool(userId: string, toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    case 'task_create':          return taskCreate(userId, args as Parameters<typeof taskCreate>[1])
    case 'task_list':            return taskList(userId, (args ?? {}) as Parameters<typeof taskList>[1])
    case 'task_update':          return taskUpdate(userId, args as Parameters<typeof taskUpdate>[1])
    case 'task_complete':        return taskComplete(userId, args as { id: string })
    case 'task_delete':          return taskDelete(userId, args as { id: string })
    case 'task_restore':         return taskRestore(args.snapshot as Record<string, unknown>, (args.tags as string[]) ?? [])
    case 'project_list':         return projectList(userId)
    case 'habit_log':            return habitLog(userId, args as Parameters<typeof habitLog>[1])
    case 'habit_stats':          return habitStats(userId, args as Parameters<typeof habitStats>[1])
    case 'productivity_summary': return productivitySummary(userId)
    case 'task_search':          return taskSearch(userId, args as { q: string })
    default: throw new Error(`Unknown tool: ${toolName}`)
  }
}

function getRevertInfo(
  write: CompletedWrite,
): { tool: string; args: Record<string, unknown> } | null {
  switch (write.tool) {
    case 'task_create': {
      const r = write.result as { id?: string }
      return r?.id ? { tool: 'task_delete', args: { id: r.id } } : null
    }
    case 'task_update': {
      const pre = write.preImage
      if (!pre) return null
      return { tool: 'task_update', args: { id: pre.id as string, ...pre } }
    }
    case 'task_complete': {
      const id = write.args.id as string | undefined
      return id ? { tool: 'task_update', args: { id, status: 'pending' } } : null
    }
    case 'task_delete': {
      const r = write.result as { snapshot?: Record<string, unknown>; tags?: string[] }
      return r?.snapshot
        ? { tool: 'task_restore', args: { snapshot: r.snapshot, tags: r.tags ?? [] } }
        : null
    }
    case 'habit_log':
      return { tool: 'habit_log', args: write.args }
    default:
      return null
  }
}

// Accumulated tool call entry during streaming
type TcAcc = { id: string; type: 'function'; function: { name: string; arguments: string } }

export async function agentLoop({ messages, userId, userName, res, signal }: AgentLoopParams): Promise<AgentLoopResult> {
  const client = createNvidiaClient()

  // C5.1 — inject live context as second system message
  let conv: Msg[]
  try {
    const summary = productivitySummary(userId) as {
      tasks_completed_today: number
      overdue_count: number
    }
    const habitsDb = openDb()
    let habitCount = 0
    try {
      const row = habitsDb.prepare(
        `SELECT COUNT(*) AS c FROM habits WHERE user_id = ? AND archived_at IS NULL`,
      ).get(userId) as { c: number }
      habitCount = row.c
    } finally {
      habitsDb.close()
    }
    const today = new Date().toISOString().slice(0, 10)
    const contextMsg: Msg = {
      role: 'system',
      content: `[Live Context — ${today}]\nUser: ${userName ?? 'unknown'}\nTasks completed today: ${summary.tasks_completed_today}\nOverdue tasks: ${summary.overdue_count}\nActive habits: ${habitCount}`,
    }
    conv = [messages[0], contextMsg, ...messages.slice(1)]
  } catch {
    conv = [...messages]
  }

  const toolCallLog: ToolCallLog[] = []
  const completedWrites: CompletedWrite[] = []
  let assistantText = ''

  // DIR-M-01: streaming loop; track iter outside for cap detection (DIR-H-01)
  let iter = 0
  for (; iter < MAX_ITERATIONS; iter++) {
    if (signal?.aborted) break

    let stream: Awaited<ReturnType<typeof client.chat.completions.create>>
    {
      let lastErr: unknown
      let created = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          stream = await client.chat.completions.create({
            model: NVIDIA_MODEL,
            messages: conv,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            // llama-3.1 only supports one tool call per response
            parallel_tool_calls: false,
            stream: true as const,
          }, { signal })
          created = true
          break
        } catch (apiErr: unknown) {
          lastErr = apiErr
          const status = (apiErr as Record<string, unknown>)['status'] as number | undefined
          const isRetryable = !status || status === 429 || status >= 500
          console.error('[agentLoop] NVIDIA API error (attempt', attempt + 1, '):', status, (apiErr as Error).message)
          if (!isRetryable || attempt === 2) throw apiErr
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000))
        }
      }
      if (!created) throw lastErr
    }

    const tcMap = new Map<number, TcAcc>()
    let finishReason: string | null = null
    let chunkContent = ''

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue
      const delta = choice.delta

      // Stream text deltas as they arrive
      if (delta.content) {
        chunkContent += delta.content
        sseWrite(res, 'text_delta', { delta: delta.content })
      }

      // Accumulate tool call fragments across chunks
      for (const tc of (delta.tool_calls ?? [])) {
        const acc = tcMap.get(tc.index)
        if (!acc) {
          tcMap.set(tc.index, {
            id: tc.id ?? '',
            type: 'function',
            function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' },
          })
        } else {
          if (tc.function?.arguments) acc.function.arguments += tc.function.arguments
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason
    }

    // No tool calls or explicit stop → text response, end loop
    if (!tcMap.size || finishReason === 'stop') {
      assistantText += chunkContent
      conv.push({ role: 'assistant', content: chunkContent })
      break
    }

    const toolCalls = [...tcMap.entries()].sort(([a], [b]) => a - b).map(([, tc]) => tc)

    conv.push({
      role: 'assistant',
      content: chunkContent || null,
      tool_calls: toolCalls,
    })

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue  // DIR-C-01: skip non-function tool calls

      const callId = tc.id
      const toolName = tc.function.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* ignore */ }

      sseWrite(res, 'tool_call', { tool: toolName, args, callId })

      let result: unknown = null
      let success = false
      let duration_ms = 0
      let lastError = ''

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          sseWrite(res, 'tool_retry', { callId, attempt, reason: lastError })
        }

        const t0 = Date.now()
        try {
          result = dispatchTool(userId, toolName, args)
          duration_ms = Date.now() - t0
          if (isError(result)) {
            lastError = (result as { error: string }).error
          } else {
            success = true
            break
          }
        } catch (err) {
          duration_ms = Date.now() - t0
          lastError = err instanceof Error ? err.message : String(err)
          result = { error: lastError }
        }
      }

      if (!success && completedWrites.length > 0) {
        for (let i = completedWrites.length - 1; i >= 0; i--) {
          const revert = getRevertInfo(completedWrites[i])
          if (revert) {
            sseWrite(res, 'tool_revert', {
              callId,
              revertTool: revert.tool,
              revertArgs: revert.args,
            })
            try { dispatchTool(userId, revert.tool, revert.args) } catch { /* best-effort */ }
          }
        }
        completedWrites.length = 0
      }

      sseWrite(res, 'tool_result', { callId, tool: toolName, result, success, duration_ms })
      toolCallLog.push({ tool: toolName, args, result, duration_ms, success })

      if (success && WRITE_TOOLS.has(toolName)) {
        const write: CompletedWrite = { tool: toolName, args, result }
        // DIR-C-02B: capture pre-image for task_update revert
        if (toolName === 'task_update') {
          const r = result as { preImage?: Record<string, unknown> }
          write.preImage = r.preImage
        }
        completedWrites.push(write)
      }

      conv.push({
        role: 'tool',
        tool_call_id: callId,
        content: JSON.stringify(result),
      })
    }
  }

  // DIR-H-01: emit friendly error when 10-iteration cap is hit without a text reply
  if (assistantText === '' && iter >= MAX_ITERATIONS) {
    const capMsg = "I wasn't able to complete this after several tool calls. Please try a more specific request."
    sseWrite(res, 'error', { message: capMsg })
    assistantText = capMsg
  }

  return { assistantText, toolCallLog }
}
