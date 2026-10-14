import { useState, useEffect, useRef } from 'react'
import { IconX, IconCalendar, IconFlag, IconFolder, IconTrash } from '@tabler/icons-react'
import { apiGet, apiPatch, apiDelete } from '@/hooks/useApi'
import type { Task, Project } from '@/types'
import { PomodoroTimer } from '@/components/ui/PomodoroTimer'
import styles from './TaskDetail.module.css'

const P_LABELS: Record<number, string> = { 1: 'P1 Urgent', 2: 'P2 High', 3: 'P3 Medium', 4: 'P4 None' }
const P_COLORS: Record<number, string> = { 1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)' }

interface Props {
  task: Task | null
  onClose: () => void
  onUpdate: (t: Task) => void
  onDelete: (id: string) => void
}

export function TaskDetail({ task, onClose, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [projects, setProjects] = useState<Project[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(task?.title ?? '')
    setNotes(task?.notes ?? '')
    if (task) {
      titleRef.current?.focus()
      apiGet<Project[]>('/api/projects').then(setProjects).catch(() => {})
    }
  }, [task?.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!task) return null

  async function saveTitle() {
    if (!task || title.trim() === task.title) return
    const updated = await apiPatch<Task>(`/api/tasks/${task.id}`, { title: title.trim() })
    if (updated) onUpdate(updated)
  }

  async function saveNotes() {
    if (!task || notes === (task.notes ?? '')) return
    const updated = await apiPatch<Task>(`/api/tasks/${task.id}`, { notes: notes.trim() || null })
    if (updated) onUpdate(updated)
  }

  async function setPriority(p: number) {
    const updated = await apiPatch<Task>(`/api/tasks/${task!.id}`, { priority: p })
    if (updated) onUpdate(updated)
  }

  async function setDueDate(d: string) {
    const updated = await apiPatch<Task>(`/api/tasks/${task!.id}`, { due_date: d || null })
    if (updated) onUpdate(updated)
  }

  async function moveToProject(projectId: string) {
    const updated = await apiPatch<Task>(`/api/tasks/${task!.id}`, { project_id: projectId || null })
    if (updated) onUpdate(updated)
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm(`Delete "${task.title}"?`)) return
    await apiDelete(`/api/tasks/${task.id}`)
    onDelete(task.id)
    onClose()
  }

  return (
    <>
      <div className={`${styles.backdrop} ${task ? styles.open : ''}`} onClick={onClose} aria-hidden />
      <div className={`${styles.panel} ${task ? styles.open : ''}`} role="dialog" aria-label="Task detail" aria-modal>
        <div className={styles.handle} />
        <div className={styles.header}>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
            <IconX size={18} />
          </button>
          <button onClick={handleDelete} className={styles.deleteBtn} aria-label="Delete task">
            <IconTrash size={16} />
          </button>
        </div>

        <input
          ref={titleRef}
          className={styles.titleInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => e.key === 'Enter' && titleRef.current?.blur()}
        />

        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <IconCalendar size={13} color="var(--text-muted)" aria-hidden />
            <label className={styles.metaLabel} htmlFor="detail-date">Due date</label>
            <input
              id="detail-date"
              type="date"
              className={styles.metaInput}
              value={task.due_date ?? ''}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          <div className={styles.metaItem}>
            <IconFlag size={13} style={{ color: P_COLORS[task.priority] }} aria-hidden />
            <label className={styles.metaLabel}>Priority</label>
            <select
              className={styles.metaSelect}
              value={task.priority}
              onChange={e => setPriority(Number(e.target.value))}
            >
              {[1,2,3,4].map(p => <option key={p} value={p}>{P_LABELS[p]}</option>)}
            </select>
          </div>

          {projects.length > 0 && (
            <div className={styles.metaItem}>
              <IconFolder size={13} color="var(--text-muted)" aria-hidden />
              <label className={styles.metaLabel}>Project</label>
              <select
                className={styles.metaSelect}
                value={task.project_id ?? ''}
                onChange={e => moveToProject(e.target.value)}
              >
                <option value="">Inbox</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <PomodoroTimer taskTitle={task.title} />

        <textarea
          className={styles.notes}
          placeholder="Add notes…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={5}
        />
      </div>
    </>
  )
}
