import { useReducer, useCallback, useRef } from 'react'
import { getToken } from './useAuth'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ToolCallDisplay {
  callId: string
  tool: string
  args: unknown
  result?: unknown
  success?: boolean
  duration_ms?: number
  status: 'running' | 'success' | 'error' | 'retrying' | 'reverting'
  attempt: number
  revertTool?: string
  revertArgs?: unknown
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCallDisplay[]
}

// ── State & reducer ───────────────────────────────────────────────────────────

interface ChatState {
  sessionId: string | null
  messages: ChatMessage[]
  streamingText: string
  activeToolCalls: ToolCallDisplay[]
  isStreaming: boolean
  error: string | null
}

type Action =
  | { type: 'RESET' }
  | { type: 'LOAD_SESSION'; sessionId: string; messages: ChatMessage[] }
  | { type: 'ADD_USER_MSG'; content: string }
  | { type: 'START_STREAM' }
  | { type: 'TOOL_CALL'; callId: string; tool: string; args: unknown }
  | { type: 'TOOL_RESULT'; callId: string; result: unknown; success: boolean; duration_ms: number }
  | { type: 'TOOL_RETRY'; callId: string; attempt: number }
  | { type: 'TOOL_REVERT'; callId: string; revertTool: string; revertArgs: unknown }
  | { type: 'TEXT_DELTA'; delta: string }
  | { type: 'DONE'; sessionId: string; messageId: string }
  | { type: 'ERROR'; message: string }

const INITIAL: ChatState = {
  sessionId: null,
  messages: [],
  streamingText: '',
  activeToolCalls: [],
  isStreaming: false,
  error: null,
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL }

    case 'LOAD_SESSION':
      return {
        ...INITIAL,
        sessionId: action.sessionId,
        messages: action.messages,
      }

    case 'ADD_USER_MSG':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `user-${Date.now()}`, role: 'user', content: action.content, toolCalls: [] },
        ],
        error: null,
      }

    case 'START_STREAM':
      return { ...state, isStreaming: true, streamingText: '', activeToolCalls: [] }

    case 'TOOL_CALL':
      return {
        ...state,
        activeToolCalls: [
          ...state.activeToolCalls,
          { callId: action.callId, tool: action.tool, args: action.args, status: 'running', attempt: 1 },
        ],
      }

    case 'TOOL_RESULT':
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map(tc =>
          tc.callId === action.callId
            ? { ...tc, result: action.result, success: action.success, duration_ms: action.duration_ms, status: action.success ? 'success' : 'error' }
            : tc
        ),
      }

    case 'TOOL_RETRY':
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map(tc =>
          tc.callId === action.callId ? { ...tc, status: 'retrying', attempt: action.attempt } : tc
        ),
      }

    case 'TOOL_REVERT':
      return {
        ...state,
        activeToolCalls: state.activeToolCalls.map(tc =>
          tc.callId === action.callId
            ? { ...tc, status: 'reverting', revertTool: action.revertTool, revertArgs: action.revertArgs }
            : tc
        ),
      }

    case 'TEXT_DELTA':
      return { ...state, streamingText: state.streamingText + action.delta }

    case 'DONE': {
      const finalMsg: ChatMessage = {
        id: action.messageId,
        role: 'assistant',
        content: state.streamingText,
        toolCalls: state.activeToolCalls,
      }
      return {
        ...state,
        sessionId: action.sessionId,
        messages: [...state.messages, finalMsg],
        streamingText: '',
        activeToolCalls: [],
        isStreaming: false,
      }
    }

    case 'ERROR':
      return { ...state, isStreaming: false, streamingText: '', error: action.message }

    default:
      return state
  }
}

// ── SSE parsing helper ────────────────────────────────────────────────────────

function dispatchSSEBlock(block: string, dispatch: React.Dispatch<Action>): void {
  let eventName = ''
  let dataStr = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) eventName = line.slice(7).trim()
    else if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
  }
  if (!eventName || !dataStr) return

  try {
    const d = JSON.parse(dataStr) as Record<string, unknown>
    switch (eventName) {
      case 'tool_call':
        dispatch({ type: 'TOOL_CALL', callId: d.callId as string, tool: d.tool as string, args: d.args })
        break
      case 'tool_result':
        dispatch({
          type: 'TOOL_RESULT',
          callId: d.callId as string,
          result: d.result,
          success: d.success as boolean,
          duration_ms: d.duration_ms as number,
        })
        break
      case 'tool_retry':
        dispatch({ type: 'TOOL_RETRY', callId: d.callId as string, attempt: d.attempt as number })
        break
      case 'tool_revert':
        dispatch({
          type: 'TOOL_REVERT',
          callId: d.callId as string,
          revertTool: d.revertTool as string,
          revertArgs: d.revertArgs,
        })
        break
      case 'text_delta':
        dispatch({ type: 'TEXT_DELTA', delta: d.delta as string })
        break
      case 'done':
        dispatch({ type: 'DONE', sessionId: d.sessionId as string, messageId: d.messageId as string })
        break
      case 'error':
        dispatch({ type: 'ERROR', message: d.message as string })
        break
    }
  } catch { /* ignore parse errors */ }
}

// ── DB message shape (from GET /api/chat/sessions/:id) ───────────────────────

interface DbMessage {
  id: string
  role: string
  content: string
  tool_calls: string | null
  created_at: number
}

function dbMessagesToDisplay(dbMsgs: DbMessage[]): ChatMessage[] {
  return dbMsgs
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      let toolCalls: ToolCallDisplay[] = []
      if (m.tool_calls) {
        try {
          const logs = JSON.parse(m.tool_calls) as Array<{
            tool: string; args: unknown; result: unknown; duration_ms: number; success: boolean
          }>
          toolCalls = logs.map((log, i) => ({
            callId: `hist-${m.id}-${i}`,
            tool: log.tool,
            args: log.args,
            result: log.result,
            success: log.success,
            duration_ms: log.duration_ms,
            status: (log.success ? 'success' : 'error') as ToolCallDisplay['status'],
            attempt: 1,
          }))
        } catch { /* ignore */ }
      }
      return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content, toolCalls }
    })
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChat() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || state.isStreaming) return

    dispatch({ type: 'ADD_USER_MSG', content })
    dispatch({ type: 'START_STREAM' })

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const token = getToken()
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: state.sessionId, content }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
        dispatch({ type: 'ERROR', message: (err as { message?: string }).message ?? 'Request failed' })
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) dispatchSSEBlock(block, dispatch)
      }
      // flush remaining
      if (buffer.trim()) dispatchSSEBlock(buffer, dispatch)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      dispatch({ type: 'ERROR', message: err instanceof Error ? err.message : 'Connection failed' })
    }
  }, [state.sessionId, state.isStreaming])

  const loadSession = useCallback(async (sessionId: string) => {
    const token = getToken()
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const session = await res.json() as { messages: DbMessage[] }
      dispatch({ type: 'LOAD_SESSION', sessionId, messages: dbMessagesToDisplay(session.messages ?? []) })
    } catch { /* ignore */ }
  }, [])

  const resetSession = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'RESET' })
  }, [])

  return {
    sessionId: state.sessionId,
    messages: state.messages,
    streamingText: state.streamingText,
    activeToolCalls: state.activeToolCalls,
    isStreaming: state.isStreaming,
    error: state.error,
    sendMessage,
    loadSession,
    resetSession,
  }
}
