import { useState, useEffect, useCallback } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { TopBar } from '@/components/layout/TopBar'
import { TaskRow } from '@/components/task/TaskRow'
import { TaskDetail } from '@/components/task/TaskDetail'
import { EmptyState } from '@/components/ui/EmptyState'
import { IllustrationToday } from '@/components/ui/illustrations'
import { Toast } from '@/components/ui/Toast'
import { SearchOverlay } from '@/components/ui/SearchOverlay'
import { useTasks } from '@/hooks/useTasks'
import { apiPatch } from '@/hooks/useApi'
import { localToday } from '@/utils/date'
import type { Task } from '@/types'
import styles from './TodayView.module.css'

function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function TodayView() {
  const { tasks, loading, fetchTasks, completeTask, updateTask, setTaskInList, deleteTask, restoreToList, removeFromList } = useTasks()
  const [toast, setToast] = useState<{ task: Task; msg: string } | null>(null)
  const [selected, setSelected] = useState<Task | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => { fetchTasks({ view: 'today' }) }, [fetchTasks])

  const handleComplete = useCallback(async (task: Task) => {
    removeFromList(task.id)
    setToast({ task, msg: `"${task.title.slice(0, 30)}" completed` })
    try {
      await completeTask(task.id)
    } catch {
      restoreToList(task)
      setToast(null)
    }
  }, [completeTask, removeFromList, restoreToList])

  const handleDelete = useCallback((task: Task) => { deleteTask(task.id) }, [deleteTask])
  const handleReschedule = useCallback((task: Task, date: string) => { updateTask(task.id, { due_date: date }) }, [updateTask])

  const handleUndo = useCallback(async () => {
    if (!toast) return
    const task = toast.task
    restoreToList(task)
    setToast(null)
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: 'pending' })
    } catch {
      removeFromList(task.id)
    }
  }, [toast, restoreToList, removeFromList])

  const today = localToday()
  const planned = tasks.filter(t => t.planned_date === today && t.status !== 'completed')
  const plannedIds = new Set(planned.map(t => t.id))
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed' && !plannedIds.has(t.id))
  const todayTasks = tasks.filter(t => t.due_date === today && t.status !== 'completed' && !plannedIds.has(t.id))

  const searchBtn = (
    <button onClick={() => setSearching(true)} aria-label="Search tasks">
      <IconSearch size={19} color="var(--text-secondary)" />
    </button>
  )

  return (
    <div className={styles.view}>
      <TopBar title="Today" subtitle={todayStr()} right={searchBtn} />

      <div className={styles.content}>
        {loading && <p className={styles.loading}>Loading…</p>}

        {!loading && tasks.length === 0 && (
          <EmptyState icon={<IllustrationToday />} title="All caught up!" subtitle="No tasks due today. Tap + to add one." />
        )}

        {planned.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Planned</span>
              <span className={styles.badge}>{planned.length}</span>
            </div>
            {planned.map(t => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} onClick={setSelected} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </>
        )}

        {overdue.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Overdue</span>
              <span className={styles.badge}>{overdue.length}</span>
            </div>
            {overdue.map(t => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} onClick={setSelected} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </>
        )}

        {todayTasks.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Today</span>
              <span className={styles.badge}>{todayTasks.length}</span>
            </div>
            {todayTasks.map(t => (
              <TaskRow key={t.id} task={t} onComplete={handleComplete} onClick={setSelected} onDelete={handleDelete} onReschedule={handleReschedule} />
            ))}
          </>
        )}
      </div>

      <TaskDetail
        task={selected}
        onClose={() => setSelected(null)}
        onUpdate={t => { setTaskInList(t); setSelected(t) }}
        onDelete={id => { deleteTask(id); setSelected(null) }}
      />

      <SearchOverlay
        open={searching}
        onClose={() => setSearching(false)}
        onSelect={setSelected}
      />

      {toast && (
        <Toast
          message={toast.msg}
          action={{ label: 'Undo', onClick: handleUndo }}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
