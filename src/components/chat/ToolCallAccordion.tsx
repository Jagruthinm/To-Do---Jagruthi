import { useState } from 'react'
import type { ToolCallDisplay } from '@/hooks/useChat'
import styles from './ToolCallAccordion.module.css'

interface Props {
  toolCall: ToolCallDisplay
}

function statusLabel(status: ToolCallDisplay['status'], attempt: number): string {
  switch (status) {
    case 'running':   return '…'
    case 'success':   return '✓'
    case 'error':     return '✗'
    case 'retrying':  return `↻ retry ${attempt}`
    case 'reverting': return '↩ reverting'
  }
}

function statusClass(status: ToolCallDisplay['status']): string {
  switch (status) {
    case 'success':   return styles.success
    case 'error':     return styles.error
    case 'retrying':
    case 'reverting': return styles.amber
    default:          return styles.running
  }
}

export function ToolCallAccordion({ toolCall }: Props) {
  const [open, setOpen] = useState(false)
  const { tool, args, result, duration_ms, status, attempt } = toolCall

  return (
    <div className={`${styles.accordion} ${statusClass(status)}`}>
      <button
        className={styles.header}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={styles.arrow}>{open ? '▼' : '▶'}</span>
        <span className={styles.tool}>{tool}</span>
        {duration_ms !== undefined && (
          <span className={styles.duration}>{duration_ms}ms</span>
        )}
        <span className={`${styles.badge} ${statusClass(status)}`}>
          {statusLabel(status, attempt)}
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.section}>
            <span className={styles.label}>Input</span>
            <pre className={styles.code}>{JSON.stringify(args, null, 2)}</pre>
          </div>
          {result !== undefined && (
            <div className={styles.section}>
              <span className={styles.label}>Output</span>
              <pre className={styles.code}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
          {toolCall.revertTool && (
            <div className={styles.section}>
              <span className={styles.label}>Reverted via</span>
              <pre className={styles.code}>{toolCall.revertTool}({JSON.stringify(toolCall.revertArgs)})</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
