import { useEffect } from 'react'
import styles from './Toast.module.css'

interface Props {
  message: string
  action?: { label: string; onClick: () => void }
  onDismiss: () => void
  duration?: number
}

export function Toast({ message, action, onDismiss, duration = 4000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.msg}>{message}</span>
      {action && (
        <button className={styles.action} onClick={() => { action.onClick(); onDismiss() }}>
          {action.label}
        </button>
      )}
    </div>
  )
}
