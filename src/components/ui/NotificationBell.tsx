import { useState, useRef, useEffect } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { useNotifications } from '@/hooks/useNotifications'
import type { Notification } from '@/types'
import styles from './NotificationBell.module.css'

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

function timeAgo(createdAt: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - createdAt
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

function typeIcon(type: Notification['type']): string {
  if (type === 'overdue') return '🔴'
  if (type === 'due_1h') return '🟠'
  if (type === 'task_created') return '✅'
  return '🔵'
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markRead, markAllRead, remove } = useNotifications()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <div className={styles.wrapper} ref={panelRef}>
      <button
        className={styles.bell}
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <BellIcon />
        <span className={styles.bellLabel}>Notifications</span>
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications" onKeyDown={handlePanelKeyDown}>
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No notifications</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`${styles.item} ${n.read === 0 ? styles.unread : ''}`}
                  onClick={() => { if (n.read === 0) markRead(n.id) }}
                >
                  <span className={styles.typeIcon} aria-hidden>{typeIcon(n.type)}</span>
                  <div className={styles.content}>
                    <div className={styles.title}>{n.title}</div>
                    <div className={styles.message}>{n.message}</div>
                    <div className={styles.time}>{timeAgo(n.created_at)}</div>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    aria-label="Delete notification"
                    onClick={e => { e.stopPropagation(); remove(n.id) }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
