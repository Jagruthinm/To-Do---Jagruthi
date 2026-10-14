import { useState, useEffect } from 'react'
import { apiGet, apiPatch } from '@/hooks/useApi'
import type { Task } from '@/types'
import { TaskDetail } from '@/components/task/TaskDetail'
import styles from './KanbanView.module.css'

const COLUMNS: { key: 'todo' | 'in_progress' | 'done'; label: string }[] = [
  { key: 'todo',        label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done',        label: 'Done' },
]

interface Props {
  projectId: string
}

export function KanbanView({ projectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<Task | null>(null)

  useEffect(() => {
    apiGet<Task[]>(`/api/tasks?project_id=${projectId}`).then(setTasks).catch(() => {})
  }, [projectId])

  async function moveTask(taskId: string, col: 'todo' | 'in_progress' | 'done') {
    try {
      const updated = await apiPatch<Task>(`/api/tasks/${taskId}`, { kanban_column: col })
      if (updated) setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
    } catch {
      console.error('Failed to move task')
    }
  }

  function updateTask(t: Task) {
    setTasks(prev => prev.map(x => x.id === t.id ? t : x))
    setSelected(t)
  }

  function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelected(null)
  }

  return (
    <div className={styles.board}>
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => (t.kanban_column ?? 'todo') === col.key)
        return (
          <div key={col.key} className={`${styles.column} ${styles[col.key]}`}>
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>{col.label}</span>
              <span className={styles.colCount}>{colTasks.length}</span>
            </div>
            <div className={styles.cards}>
              {colTasks.map(task => (
                <div
                  key={task.id}
                  className={`${styles.card} ${task.status === 'completed' ? styles.cardDone : ''}`}
                >
                  <button className={styles.cardBody} onClick={() => setSelected(task)}>
                    <div className={styles.cardPriority} style={{ background: `var(--p${task.priority})` }} />
                    <span className={styles.cardTitle}>{task.title}</span>
                    {task.due_date && (
                      <span className={styles.cardDate}>
                        {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </button>
                  <div className={styles.moveButtons}>
                    {col.key === 'todo' && (
                      <button className={styles.moveBtn} onClick={() => moveTask(task.id, 'in_progress')}>
                        → In progress
                      </button>
                    )}
                    {col.key === 'in_progress' && (
                      <>
                        <button className={styles.moveBtn} onClick={() => moveTask(task.id, 'todo')}>
                          ← To do
                        </button>
                        <button className={`${styles.moveBtn} ${styles.moveBtnDone}`} onClick={() => moveTask(task.id, 'done')}>
                          → Done
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <p className={styles.empty}>No tasks</p>
              )}
            </div>
          </div>
        )
      })}

      <TaskDetail
        task={selected}
        onClose={() => setSelected(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
      />
    </div>
  )
}
