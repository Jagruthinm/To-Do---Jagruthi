import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { IconChecks, IconLayoutList, IconLayoutColumns } from '@tabler/icons-react'
import { TopBar } from '@/components/layout/TopBar'
import { TaskRow } from '@/components/task/TaskRow'
import { TaskDetail } from '@/components/task/TaskDetail'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTasks } from '@/hooks/useTasks'
import { apiGet, apiPatch } from '@/hooks/useApi'
import { KanbanView } from './KanbanView'
import type { Project, Task } from '@/types'
import styles from './ProjectDetailView.module.css'

export function ProjectDetailView() {
  const { id } = useParams<{ id: string }>()
  const { tasks, loading, fetchTasks, completeTask, updateTask, deleteTask, setTaskInList, reorderLocally } = useTasks()
  const [project, setProject] = useState<Project | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [selected, setSelected] = useState<Task | null>(null)

  // P3-03: drag-and-drop state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const tasksRef = useRef<Task[]>([])
  useEffect(() => { tasksRef.current = tasks }, [tasks])

  useEffect(() => {
    if (!id) return
    fetchTasks({ project_id: id })
    apiGet<Project>(`/api/projects/${id}`).then(p => {
      setProject(p)
      setViewMode(p.view_mode)
    }).catch(() => {})
  }, [id, fetchTasks])

  async function toggleView() {
    const next = viewMode === 'list' ? 'kanban' : 'list'
    setViewMode(next)
    if (id) await apiPatch(`/api/projects/${id}`, { view_mode: next })
  }

  function handleTaskUpdate(t: Task) {
    setTaskInList(t)
    setSelected(t)
  }

  function handleTaskDelete(tid: string) {
    deleteTask(tid)
    setSelected(null)
  }

  // ── Handlers for swipe-tray actions (P3-02) ──

  function handleDelete(task: Task) {
    deleteTask(task.id)
    if (selected?.id === task.id) setSelected(null)
  }

  function handleReschedule(task: Task, date: string) {
    updateTask(task.id, { due_date: date })
  }

  // ── Drag-and-drop reorder (P3-03 HTML5 DnD) ──

  function performReorder(fromId: string, toId: string) {
    const current = tasksRef.current
    const fromIdx = current.findIndex(t => t.id === fromId)
    const toIdx = current.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    // Compute new positions before the optimistic update
    const reordered = [...current]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const items = reordered.map((t, i) => ({ id: t.id, position: i }))

    reorderLocally(fromId, toId)
    apiPatch('/api/tasks/reorder', { items }).catch(() => {
      if (id) fetchTasks({ project_id: id })
    })
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, taskId: string) {
    setDragId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, taskId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (taskId !== dragId) setDragOverId(taskId)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) return
    performReorder(dragId, targetId)
    setDragId(null)
    setDragOverId(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOverId(null)
  }

  // ── Touch drag from grip handle (P3-03 mobile) ──

  const touchDragId = useRef<string | null>(null)

  const handleTouchDragStart = useCallback((taskId: string) => {
    touchDragId.current = taskId
    setDragId(taskId)
  }, [])

  const handleTouchDragMove = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    const taskEl = el?.closest('[data-task-id]') as HTMLElement | null
    const overId = taskEl?.dataset.taskId ?? null
    if (overId && overId !== touchDragId.current) setDragOverId(overId)
  }, [])

  const handleTouchDragEnd = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    const taskEl = el?.closest('[data-task-id]') as HTMLElement | null
    const targetId = taskEl?.dataset.taskId ?? null
    if (touchDragId.current && targetId && touchDragId.current !== targetId) {
      performReorder(touchDragId.current, targetId)
    }
    touchDragId.current = null
    setDragId(null)
    setDragOverId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rightEl = (
    <button onClick={toggleView} aria-label="Toggle view">
      {viewMode === 'list'
        ? <IconLayoutColumns size={20} color="var(--text-secondary)" />
        : <IconLayoutList size={20} color="var(--text-secondary)" />}
    </button>
  )

  return (
    <div className={styles.view}>
      <TopBar title={project?.name ?? 'Project'} showBack right={rightEl} />

      {viewMode === 'kanban' && id ? (
        <div className={styles.kanbanWrap}>
          <KanbanView projectId={id} />
        </div>
      ) : (
        <div className={styles.content}>
          {loading && <p className={styles.loading}>Loading…</p>}

          {!loading && tasks.length === 0 && (
            <EmptyState icon={<IconChecks />} title="No tasks yet" subtitle="Tap + to add the first task." />
          )}

          <div className={styles.list}>
            {tasks.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                onComplete={task => completeTask(task.id)}
                onClick={setSelected}
                onDelete={handleDelete}
                onReschedule={handleReschedule}
                showDragHandle
                isDragging={dragId === t.id}
                isDragOver={dragOverId === t.id && dragId !== t.id}
                onDragStart={e => handleDragStart(e, t.id)}
                onDragOver={e => handleDragOver(e, t.id)}
                onDrop={e => handleDrop(e, t.id)}
                onDragEnd={handleDragEnd}
                onTouchDragStart={handleTouchDragStart}
                onTouchDragMove={handleTouchDragMove}
                onTouchDragEnd={handleTouchDragEnd}
              />
            ))}
          </div>
        </div>
      )}

      <TaskDetail
        task={selected}
        onClose={() => setSelected(null)}
        onUpdate={handleTaskUpdate}
        onDelete={handleTaskDelete}
      />
    </div>
  )
}
