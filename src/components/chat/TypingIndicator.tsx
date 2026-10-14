import styles from './TypingIndicator.module.css'

export function TypingIndicator() {
  return (
    <div className={styles.indicator} role="status" aria-label="AI is thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  )
}
