import { useState, useEffect, useCallback } from 'react'
import { IllustrationInbox } from '@/components/ui/illustrations'
import { TopBar } from '@/components/layout/TopBar'
import { TaskRow } from '@/components/task/TaskRow'
import { TaskDetail } from '@/components/task/TaskDetail'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast } from '@/components/ui/Toast'
import { useTasks } from '@/hooks/useTasks'
import { apiPatch } from '@/hooks/useApi'
import type { Task } from '@/types'
import styles from './InboxView.module.css'

export function InboxView() {
  const { tasks, loading, fetchTasks, completeTask, updateTask, setTaskInList, deleteTask, removeFromList, restoreToList } = useTasks()
  const [selected, setSelected] = useState<Task | null>(null)
  const [toast, setToast] = useState<{ task: Task; msg: string } | null>(null)

  useEffect(() => { fetchTasks({ view: 'inbox' }) }, [fetchTasks])

  const handleComplete = useCallback(async (task: Task) => {
    removeFromList(task.id)
    setToast({ task, msg: `"${task.title.slice(0, 30)}" completed` })
    await completeTask(task.id)
  }, [completeTask, removeFromList])

  const handleDelete = useCallback((task: Task) => { deleteTask(task.id) }, [deleteTask])
  const handleReschedule = useCallback((task: Task, date: string) => { updateTask(task.id, { due_date: date }) }, [updateTask])

  const handleUndo = useCallback(async () => {
    if (!toast) return
    const task = toast.task
    restoreToList(task)
    setToast(null)
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: 'pending' })
    } catch (err) {
      console.error('Undo failed:', err)
      removeFromList(task.id)
    }
  }, [toast, restoreToList, removeFromList])

  return (
    <div className={styles.view}>
      <TopBar title="Inbox" />

      <div className={styles.content}>
        {loading && <p className={styles.loading}>Loading…</p>}

        {!loading && tasks.length === 0 && (
          <EmptyState
            icon={<IllustrationInbox />}
            title="Inbox zero!"
            subtitle="No unorganized tasks. Nice."
          />
        )}

        <div className={styles.taskList}>
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} onComplete={handleComplete} onClick={setSelected} onDelete={handleDelete} onReschedule={handleReschedule} />
          ))}
        </div>
      </div>

      <TaskDetail
        task={selected}
        onClose={() => setSelected(null)}
        onUpdate={t => { setTaskInList(t); setSelected(t) }}
        onDelete={id => { deleteTask(id); setSelected(null) }}
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
