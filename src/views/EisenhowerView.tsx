import { useState, useEffect, useRef } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { apiGet, apiPatch } from '@/hooks/useApi'
import type { Task, Priority } from '@/types'
import styles from './EisenhowerView.module.css'

const QUADRANTS = [
  { priority: 1 as Priority, title: 'Do Now',    desc: 'Urgent + Important',         color: 'var(--p1)' },
  { priority: 2 as Priority, title: 'Schedule',  desc: 'Important + Not Urgent',     color: 'var(--p2)' },
  { priority: 3 as Priority, title: 'Delegate',  desc: 'Urgent + Not Important',     color: 'var(--p3)' },
  { priority: 4 as Priority, title: 'Eliminate', desc: 'Not Urgent + Not Important', color: 'var(--p4)' },
]

export function EisenhowerView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState<Priority | null>(null)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    apiGet<Task[]>('/api/tasks?status=pending')
      .then(setTasks)
      .finally(() => setLoading(false))
  }, [])

  function onDragStart(taskId: string) {
    dragId.current = taskId
  }

  function onDrop(priority: Priority) {
    const id = dragId.current
    if (!id) return
    dragId.current = null
    setDragOver(null)
    const originalPriority = tasks.find(t => t.id === id)?.priority
    setTasks(prev => prev.map(t => t.id === id ? { ...t, priority } : t))
    apiPatch(`/api/tasks/${id}`, { priority }).catch(() => {
      if (originalPriority !== undefined) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, priority: originalPriority } : t))
      }
    })
  }

  return (
    <div className={styles.view}>
      <TopBar title="Matrix" subtitle="Eisenhower priority grid" />

      <div className={styles.axisRow}>
        <div className={styles.axisCorner} />
        <div className={styles.axisHead}>← Urgent</div>
        <div className={styles.axisHead}>Not Urgent →</div>
      </div>

      <div className={styles.bodyRow}>
        <div className={styles.axisCol}>
          <div className={styles.axisYLabel}>Important</div>
          <div className={styles.axisYLabel}>Not Important</div>
        </div>

        <div className={styles.grid}>
          {loading && <p className={styles.loading}>Loading…</p>}
          {!loading && QUADRANTS.map(q => {
            const qTasks = tasks.filter(t => t.priority === q.priority)
            return (
              <div
                key={q.priority}
                className={`${styles.quadrant} ${dragOver === q.priority ? styles.dragOver : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(q.priority) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => onDrop(q.priority)}
              >
                <div className={styles.qHeader}>
                  <span className={styles.qDot} style={{ background: q.color }} />
                  <span className={styles.qTitle}>{q.title}</span>
                  <span className={styles.qDesc}>{q.desc}</span>
                </div>

                <div className={styles.taskList}>
                  {qTasks.map(t => (
                    <div
                      key={t.id}
                      className={styles.taskPill}
                      draggable
                      onDragStart={() => onDragStart(t.id)}
                    >
                      <div className={styles.pillDot} style={{ background: q.color }} />
                      <span className={styles.pillTitle}>{t.title}</span>
                    </div>
                  ))}
                  {qTasks.length === 0 && (
                    <p className={styles.emptyHint}>Drop tasks here</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
