import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getToken } from '@/hooks/useAuth'
import styles from './ReportRunView.module.css'

interface ToolRow {
  callId: string
  tool: string
  args: unknown
  result?: unknown
  success?: boolean
  duration_ms?: number
  status: 'running' | 'success' | 'error' | 'retrying' | 'reverting'
  attempt: number
}

interface RunState {
  phase: 'idle' | 'running' | 'done' | 'error' | 'aborted'
  rows: ToolRow[]
  phaseText: string
  completedCount: number
  doneSessionId: string | null
  error: string | null
}

const INITIAL: RunState = {
  phase: 'idle',
  rows: [],
  phaseText: 'Starting…',
  completedCount: 0,
  doneSessionId: null,
  error: null,
}

// Heuristic: most reports make ~5 tool calls; cap progress at 95% until done
const EXPECTED_TOOL_CALLS = 5

export function ReportRunView() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const abortRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<RunState>(INITIAL)
  const [showComplete, setShowComplete] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom whenever rows change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.rows.length, state.phaseText])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setState(s => ({ ...s, phase: 'aborted' }))
    navigate('/agentic-reports')
  }, [navigate])

  // Navigate to chat session after completion animation
  useEffect(() => {
    if (!showComplete || !state.doneSessionId) return
    const timer = setTimeout(() => {
      navigate(`/chat/${state.doneSessionId}`)
    }, 900)
    return () => clearTimeout(timer)
  }, [showComplete, state.doneSessionId, navigate])

  useEffect(() => {
    if (!reportId) return

    const controller = new AbortController()
    abortRef.current = controller
    const token = getToken()

    setState({ ...INITIAL, phase: 'running', phaseText: 'Calling tools…' })

    async function run() {
      try {
        const res = await fetch(`/api/reports/run/${reportId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
          setState(s => ({
            ...s,
            phase: 'error',
            error: (err as { message?: string }).message ?? 'Request failed',
          }))
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
          for (const block of blocks) processBlock(block)
        }
        if (buffer.trim()) processBlock(buffer)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setState(s => ({
          ...s,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Connection failed',
        }))
      }
    }

    function processBlock(block: string) {
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
            setState(s => ({
              ...s,
              phaseText: `Calling ${d.tool as string}…`,
              rows: [
                ...s.rows,
                {
                  callId: d.callId as string,
                  tool: d.tool as string,
                  args: d.args,
                  status: 'running',
                  attempt: 1,
                },
              ],
            }))
            break

          case 'tool_result':
            setState(s => ({
              ...s,
              completedCount: s.completedCount + 1,
              rows: s.rows.map(r =>
                r.callId === (d.callId as string)
                  ? {
                      ...r,
                      result: d.result,
                      success: d.success as boolean,
                      duration_ms: d.duration_ms as number,
                      status: (d.success ? 'success' : 'error') as ToolRow['status'],
                    }
                  : r
              ),
            }))
            break

          case 'tool_retry':
            setState(s => ({
              ...s,
              rows: s.rows.map(r =>
                r.callId === (d.callId as string)
                  ? { ...r, status: 'retrying', attempt: d.attempt as number }
                  : r
              ),
            }))
            break

          case 'tool_revert':
            setState(s => ({
              ...s,
              rows: s.rows.map(r =>
                r.callId === (d.callId as string)
                  ? { ...r, status: 'reverting' }
                  : r
              ),
            }))
            break

          case 'text_delta':
            setState(s => ({ ...s, phaseText: 'Generating report…' }))
            break

          case 'done':
            setState(s => ({
              ...s,
              phase: 'done',
              phaseText: 'Report complete.',
              doneSessionId: d.sessionId as string,
            }))
            setShowComplete(true)
            break

          case 'error':
            setState(s => ({
              ...s,
              phase: 'error',
              error: d.message as string,
            }))
            break
        }
      } catch { /* ignore */ }
    }

    run()
    return () => controller.abort()
  }, [reportId])

  const progress =
    state.phase === 'done'
      ? 1
      : Math.min(state.completedCount / EXPECTED_TOOL_CALLS, 0.95)

  const progressPct = Math.round(progress * 100)

  return (
    <div className={styles.overlay} role="dialog" aria-label="Running report">
      {/* Completion flash */}
      {showComplete && <div className={styles.completeFlash} aria-hidden="true" />}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.brandDot} aria-hidden="true" />
          <span className={styles.headerTitle}>
            FocusAI — {state.phase === 'done' ? 'Complete' : 'Running Report'}
          </span>
        </div>
        <button
          className={styles.closeBtn}
          onClick={abort}
          aria-label="Abort and close"
          disabled={state.phase === 'done'}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Phase indicator */}
        <div className={styles.phaseRow}>
          {state.phase === 'running' && (
            <span className={styles.spinner} aria-hidden="true" />
          )}
          {state.phase === 'done' && (
            <span className={styles.checkmark} aria-hidden="true">✓</span>
          )}
          {state.phase === 'error' && (
            <span className={styles.errorMark} aria-hidden="true">✗</span>
          )}
          <span className={styles.phaseText}>{state.phaseText}</span>
        </div>

        {/* Tool call rows */}
        {state.rows.map(row => (
          <ToolCallRow key={row.callId} row={row} />
        ))}

        {/* Error message */}
        {state.error && (
          <div className={styles.errorMsg} role="alert">
            {state.error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Progress bar */}
      <div className={styles.progressBar} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`${styles.progressFill} ${state.phase === 'done' ? styles.progressDone : ''}`}
          style={{ width: `${progressPct}%` }}
        />
        <span className={styles.progressLabel}>{progressPct}%</span>
      </div>
    </div>
  )
}

// ── ToolCallRow sub-component ──────────────────────────────────────────────

interface ToolCallRowProps {
  row: ToolRow
}

function statusIcon(status: ToolRow['status']): string {
  switch (status) {
    case 'running':   return '…'
    case 'success':   return '✓'
    case 'error':     return '✗'
    case 'retrying':  return '↻'
    case 'reverting': return '↩'
  }
}

function statusClass(status: ToolRow['status']): string {
  switch (status) {
    case 'success':   return styles.rowSuccess
    case 'error':     return styles.rowError
    case 'retrying':
    case 'reverting': return styles.rowAmber
    default:          return styles.rowRunning
  }
}

function ToolCallRow({ row }: ToolCallRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`${styles.row} ${statusClass(row.status)}`}>
      <button
        className={styles.rowHeader}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className={styles.rowArrow}>{expanded ? '▼' : '▶'}</span>
        <span className={styles.rowTool}>{row.tool}</span>
        {row.attempt > 1 && (
          <span className={styles.rowAttempt}>retry {row.attempt}</span>
        )}
        {row.duration_ms !== undefined && (
          <span className={styles.rowDuration}>{row.duration_ms}ms</span>
        )}
        <span className={`${styles.rowStatus} ${statusClass(row.status)}`}>
          {statusIcon(row.status)}
        </span>
      </button>

      {expanded && (
        <div className={styles.rowBody}>
          <div className={styles.rowSection}>
            <span className={styles.rowLabel}>Input</span>
            <pre className={styles.rowCode}>{JSON.stringify(row.args, null, 2)}</pre>
          </div>
          {row.result !== undefined && (
            <div className={styles.rowSection}>
              <span className={styles.rowLabel}>Output</span>
              <pre className={styles.rowCode}>{JSON.stringify(row.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
