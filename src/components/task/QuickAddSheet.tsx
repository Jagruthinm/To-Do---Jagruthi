import { useState, useRef, useEffect } from 'react'
import { IconCalendar, IconFlag, IconFolder, IconTag, IconX } from '@tabler/icons-react'
import { useTasks } from '@/hooks/useTasks'
import { apiGet, apiPost } from '@/hooks/useApi'
import type { Tag, Project } from '@/types'
import styles from './QuickAddSheet.module.css'

const PRIORITY_LABELS = ['', 'P1 — Urgent', 'P2 — High', 'P3 — Medium', 'P4 — None'] as const

interface Props {
  open: boolean
  onClose: () => void
  defaultProjectId?: string
}

export function QuickAddSheet({ open, onClose, defaultProjectId }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(0)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { createTask } = useTasks()

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 260)
      apiGet<Tag[]>('/api/tags').then(setAllTags).catch(() => {})
      apiGet<Project[]>('/api/projects').then(setAllProjects).catch(() => {})
    } else {
      setTagPickerOpen(false)
      setProjectPickerOpen(false)
    }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleAdd() {
    if (!title.trim()) return
    const task = await createTask({
      title: title.trim(),
      notes: notes.trim() || undefined,
      due_date: dueDate || undefined,
      priority: priority > 0 ? (priority as 1|2|3|4) : 4,
      project_id: selectedProjectId ?? defaultProjectId,
    })
    if (task) {
      for (const tagId of selectedTagIds) {
        await apiPost(`/api/tasks/${task.id}/tags/${tagId}`, {})
      }
    }
    setTitle(''); setNotes(''); setDueDate(''); setPriority(0); setSelectedTagIds([])
    setSelectedProjectId(null); setTagPickerOpen(false); setProjectPickerOpen(false)
    onClose()
  }

  async function handleCreateTag() {
    if (!newTagName.trim() || creatingTag) return
    setCreatingTag(true)
    try {
      const tag = await apiPost<Tag>('/api/tags', { name: newTagName.trim() })
      if (tag) {
        setAllTags(prev => [...prev, tag])
        setSelectedTagIds(prev => [...prev, tag.id])
        setNewTagName('')
      }
    } finally {
      setCreatingTag(false)
    }
  }

  function cyclePriority() {
    setPriority(p => (p + 1) % 5)
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId])
  }

  function dueDateLabel() {
    if (!dueDate) return 'Due date'
    const d = new Date(dueDate + 'T00:00:00')
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function projectLabel() {
    const pid = selectedProjectId ?? defaultProjectId
    if (!pid) return 'Project'
    return allProjects.find(p => p.id === pid)?.name ?? 'Project'
  }

  const effectiveProjectId = selectedProjectId ?? defaultProjectId ?? null

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} aria-hidden />}
      <div className={`${styles.sheet} ${open ? styles.open : ''}`} role="dialog" aria-label="Add new task" aria-modal>
        <div className={styles.handle} />
        <div className={styles.header}>
          <span className={styles.sheetTitle}>New task</span>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        <input
          ref={inputRef}
          className={styles.titleInput}
          placeholder="Task name..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <textarea
          className={styles.notesInput}
          placeholder="Notes..."
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        <div className={styles.chipRow}>
          <label className={`${styles.chip} ${dueDate ? styles.chipActive : ''}`}>
            <IconCalendar size={12} aria-hidden />
            <span>{dueDateLabel()}</span>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              onClick={e => { try { e.currentTarget.showPicker() } catch { /* unsupported browser falls back to native focus */ } }}
              className={styles.hiddenDate}
            />
          </label>

          <button
            className={`${styles.chip} ${priority > 0 ? styles.chipActive : ''}`}
            onClick={cyclePriority}
            style={priority > 0 ? {
              borderColor: `var(--p${priority})`,
              color: `var(--p${priority})`,
            } : undefined}
          >
            <IconFlag size={12} aria-hidden />
            <span>{priority > 0 ? PRIORITY_LABELS[priority] : 'Priority'}</span>
          </button>

          <div className={styles.projectWrapper}>
            <button
              className={`${styles.chip} ${effectiveProjectId ? styles.chipActive : ''}`}
              onClick={() => setProjectPickerOpen(p => !p)}
            >
              <IconFolder size={12} aria-hidden />
              <span>{projectLabel()}</span>
            </button>
            {projectPickerOpen && (
              <div className={styles.projectPicker}>
                {allProjects.length === 0 && (
                  <p className={styles.tagEmpty}>No projects yet</p>
                )}
                {allProjects.map(p => (
                  <button
                    key={p.id}
                    className={`${styles.tagOption} ${effectiveProjectId === p.id ? styles.tagSelected : ''}`}
                    onClick={() => {
                      setSelectedProjectId(prev => prev === p.id ? null : p.id)
                      setProjectPickerOpen(false)
                    }}
                  >
                    <span className={styles.tagDot} style={{ background: p.color }} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.tagWrapper}>
            <button
              className={`${styles.chip} ${selectedTagIds.length > 0 ? styles.chipActive : ''}`}
              onClick={() => setTagPickerOpen(p => !p)}
            >
              <IconTag size={12} aria-hidden />
              <span>
                {selectedTagIds.length > 0
                  ? `${selectedTagIds.length} tag${selectedTagIds.length > 1 ? 's' : ''}`
                  : 'Tag'}
              </span>
            </button>
            {tagPickerOpen && (
              <div className={styles.tagPicker}>
                {allTags.length === 0 && (
                  <p className={styles.tagEmpty}>No tags yet</p>
                )}
                {allTags.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.tagOption} ${selectedTagIds.includes(t.id) ? styles.tagSelected : ''}`}
                    onClick={() => toggleTag(t.id)}
                  >
                    <span className={styles.tagDot} style={{ background: t.color }} />
                    {t.name}
                  </button>
                ))}
                <div className={styles.createTagRow}>
                  <input
                    className={styles.createTagInput}
                    placeholder="New tag…"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => {
                      e.stopPropagation()
                      if (e.key === 'Enter') handleCreateTag()
                    }}
                  />
                  <button
                    className={styles.createTagBtn}
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim() || creatingTag}
                  >
                    {creatingTag ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          className={styles.addBtn}
          onClick={handleAdd}
          disabled={!title.trim()}
        >
          Add task
        </button>
      </div>
    </>
  )
}
