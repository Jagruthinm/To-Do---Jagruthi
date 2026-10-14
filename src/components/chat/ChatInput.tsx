import { useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react'
import styles from './ChatInput.module.css'

interface Props {
  onSend: (text: string) => void
  isStreaming: boolean
  placeholder?: string
}

export function ChatInput({ onSend, isStreaming, placeholder = 'Message AI Assistant…' }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Resize textarea to fit content, capped at 4 rows
  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 22
    const maxHeight = lineHeight * 4 + 20 // 4 rows + padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    resize()
    // Controlled by ref — no state needed
    void e
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const el = textareaRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text || isStreaming) return
    el.value = ''
    el.style.height = 'auto'
    onSend(text)
  }

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
          aria-label="Chat message input"
        />
        <button
          className={styles.sendBtn}
          onClick={submit}
          disabled={isStreaming}
          aria-label="Send message"
        >
          {isStreaming ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <p className={styles.hint}>Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
