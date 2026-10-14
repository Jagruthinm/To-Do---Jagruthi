import { useState, useEffect, useRef, useMemo, type MutableRefObject } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { apiGet, apiPatch } from '@/hooks/useApi'
import { localToday } from '@/utils/date'
import type { Task } from '@/types'
import styles from './PlanView.module.css'

function todayStr() {
  return localToday()
}

function dateLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── Module-level — stable reference across PlanView re-renders ──

interface TaskCardProps {
  task: Task
  dragId: MutableRefObject<string | null>
}

function TaskCard({ task, dragId }: TaskCardProps) {
  return (
    <div
      className={styles.card}
      draggable
      onDragStart={() => { dragId.current = task.id }}
    >
      <div className={styles.cardPriority} style={{ background: `var(--p${task.priority})` }} />
      <div className={styles.cardBody}>
        <span className={styles.cardTitle}>{task.title}</span>
        {task.project_name && <span className={styles.cardProject}>{task.project_name}</span>}
      </div>
    </div>
  )
}

// ── PlanView ──

export function PlanView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState<'plan' | 'pool' | null>(null)
  const dragId = useRef<string | null>(null)
  const today = useMemo(todayStr, [])

  useEffect(() => {
    apiGet<Task[]>('/api/tasks?status=pending')
      .then(setTasks)
      .finally(() => setLoading(false))
  }, [])

  const planned   = tasks.filter(t => t.planned_date === today)
  const unplanned = tasks.filter(t => t.planned_date !== today)

  async function setPlanned(taskId: string, date: string | null) {
    try {
      const updated = await apiPatch<Task>(`/api/tasks/${taskId}`, { planned_date: date })
      if (updated) setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } catch {
      console.error('Failed to update planned date')
    }
  }

  function onDrop(target: 'plan' | 'pool') {
    const id = dragId.current
    if (!id) return
    dragId.current = null
    setDragOver(null)
    setPlanned(id, target === 'plan' ? today : null)
  }

  return (
    <div className={styles.view}>
      <TopBar title="My Day" subtitle={dateLabel()} />

      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && (
        <div className={styles.columns}>
          {/* Left: task pool */}
          <div
            className={`${styles.col} ${dragOver === 'pool' ? styles.dropActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver('pool') }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => onDrop('pool')}
          >
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>All Tasks</span>
              <span className={styles.colBadge}>{unplanned.length}</span>
            </div>
            <div className={styles.cardList}>
              {unplanned.map(t => <TaskCard key={t.id} task={t} dragId={dragId} />)}
              {unplanned.length === 0 && (
                <p className={styles.emptyHint}>All tasks are in today's plan</p>
              )}
            </div>
          </div>

          <div className={styles.divider} />

          {/* Right: today's plan */}
          <div
            className={`${styles.col} ${dragOver === 'plan' ? styles.dropActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver('plan') }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => onDrop('plan')}
          >
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>Today's Plan</span>
              <span className={styles.colBadge}>{planned.length}</span>
            </div>
            <div className={styles.cardList}>
              {planned.map(t => <TaskCard key={t.id} task={t} dragId={dragId} />)}
              {planned.length === 0 && (
                <div className={styles.dropZone}>
                  <span className={styles.dropZoneIcon}>+</span>
                  <p>Drag tasks here to plan your day</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
