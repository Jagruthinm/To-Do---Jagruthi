import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ChatSession } from '@/hooks/useChatHistory'
import styles from './ChatSessionSidebar.module.css'

interface Props {
  sessions: ChatSession[]
  loading: boolean
  open: boolean
  onClose: () => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function ChatSessionSidebar({
  sessions,
  loading,
  open,
  onClose,
  onNewChat,
  onDeleteSession,
}: Props) {
  const navigate = useNavigate()
  const { sessionId } = useParams()

  // Close drawer on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function handleSelectSession(id: string) {
    navigate(`/chat/${id}`)
    onClose()
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}

      <aside
        className={`${styles.sidebar} ${open ? styles.open : ''}`}
        aria-label="Chat sessions"
      >
        <div className={styles.header}>
          <span className={styles.title}>Chats</span>
          <button className={styles.newBtn} onClick={onNewChat} aria-label="New chat">
            + New
          </button>
        </div>

        <div className={styles.list}>
          {loading && (
            <p className={styles.hint}>Loading…</p>
          )}
          {!loading && sessions.length === 0 && (
            <p className={styles.hint}>No conversations yet.</p>
          )}
          {sessions.map(session => (
            <div
              key={session.id}
              className={`${styles.item} ${session.id === sessionId ? styles.active : ''}`}
            >
              <button
                className={styles.itemBtn}
                onClick={() => handleSelectSession(session.id)}
                title={session.title}
              >
                <span className={styles.itemTitle}>{session.title || 'Untitled'}</span>
                <span className={styles.itemTime}>{relativeTime(session.updated_at)}</span>
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => onDeleteSession(session.id)}
                aria-label={`Delete chat: ${session.title}`}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
