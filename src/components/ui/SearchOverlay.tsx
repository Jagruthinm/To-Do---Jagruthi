import { useState, useEffect, useRef } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { apiGet } from '@/hooks/useApi'
import type { Task } from '@/types'
import styles from './SearchOverlay.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (task: Task) => void
}

export function SearchOverlay({ open, onClose, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
    else { setQ(''); setResults([]) }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && open) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function handleChange(val: string) {
    setQ(val)
    clearTimeout(timer.current)
    if (!val.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await apiGet<Task[]>(`/api/tasks/search?q=${encodeURIComponent(val)}`)
        setResults(data)
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  function formatDate(d?: string) {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} aria-hidden />}
      <div className={`${styles.overlay} ${open ? styles.open : ''}`} role="dialog" aria-label="Search tasks" aria-modal>
        <div className={styles.inputRow}>
          <IconSearch size={16} className={styles.searchIcon} aria-hidden />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search tasks…"
            value={q}
            onChange={e => handleChange(e.target.value)}
          />
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close search">
            <IconX size={16} />
          </button>
        </div>

        {loading && <p className={styles.status}>Searching…</p>}
        {!loading && q && results.length === 0 && (
          <p className={styles.status}>No tasks match "{q}"</p>
        )}
        {results.length > 0 && (
          <ul className={styles.list} role="listbox">
            {results.map(t => (
              <li key={t.id} role="option">
                <button
                  className={styles.result}
                  onClick={() => { onSelect(t); onClose() }}
                >
                  <span className={styles.dot} style={{ background: `var(--p${t.priority})` }} />
                  <span className={styles.title}>{t.title}</span>
                  <span className={styles.meta}>
                    {t.project_name && <span className={styles.project}>{t.project_name}</span>}
                    {t.due_date && <span className={styles.date}>{formatDate(t.due_date)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
