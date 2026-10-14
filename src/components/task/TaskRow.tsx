import { useState, useRef, useEffect } from 'react'
import { IconClock } from '@tabler/icons-react'

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3.5" r="1.2" /><circle cx="9" cy="3.5" r="1.2" />
      <circle cx="5" cy="7"   r="1.2" /><circle cx="9" cy="7"   r="1.2" />
      <circle cx="5" cy="10.5" r="1.2" /><circle cx="9" cy="10.5" r="1.2" />
    </svg>
  )
}
import { Badge } from '@/components/ui/Badge'
import type { Task } from '@/types'
import styles from './TaskRow.module.css'

const P_COLORS: Record<number, string> = {
  1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)',
}

function projectBadgeVariant(name?: string) {
  if (!name) return 'gray'
  const map: Record<string, 'blue' | 'green' | 'amber' | 'gray'> = {
    Work: 'blue', Health: 'green', Dev: 'blue',
  }
  return map[name] ?? 'gray'
}

function overdayLabel(dueDate: string): string | null {
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000)
  return diffDays > 0 ? `${diffDays}d late` : null
}

interface Props {
  task: Task
  onComplete: (task: Task) => void
  onClick: (task: Task) => void
  onDelete?: (task: Task) => void
  onReschedule?: (task: Task, date: string) => void
  // P3-03: drag-and-drop
  showDragHandle?: boolean
  isDragOver?: boolean
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
  // P3-03: touch drag from grip handle
  onTouchDragStart?: (taskId: string) => void
  onTouchDragMove?: (x: number, y: number) => void
  onTouchDragEnd?: (x: number, y: number) => void
}

const TRAY_WIDTH = 144  // 2 × 72px buttons

export function TaskRow({
  task, onComplete, onClick, onDelete, onReschedule,
  showDragHandle, isDragOver, isDragging,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onTouchDragStart, onTouchDragMove, onTouchDragEnd,
}: Props) {
  const [completing, setCompleting] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [trayOpen, setTrayOpen] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // Sync refs for synchronous access inside touch handlers (state is async)
  const swipeXRef = useRef(0)
  const trayOpenRef = useRef(false)
  useEffect(() => { swipeXRef.current = swipeX }, [swipeX])
  useEffect(() => { trayOpenRef.current = trayOpen }, [trayOpen])

  // Row-level swipe tracking
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const isSwiping = useRef(false)
  const hasSwiped = useRef(false)

  // Grip handle touch-drag tracking (P3-03)
  const gripDragTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gripDragActive = useRef(false)
  const gripDragStartPos = useRef<{ x: number; y: number } | null>(null)

  // Close tray when touching outside this row
  useEffect(() => {
    if (!trayOpen) return
    function onOutsideTouch(e: TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSwipeX(0)
        setTrayOpen(false)
      }
    }
    document.addEventListener('touchstart', onOutsideTouch, { passive: true })
    return () => document.removeEventListener('touchstart', onOutsideTouch)
  }, [trayOpen])

  function handleCheck(e: React.MouseEvent) {
    e.stopPropagation()
    if (completing) return
    setCompleting(true)
    setTimeout(() => onComplete(task), 280)
  }

  // ── Row-level swipe handlers (P3-01 swipe-right, P3-02 swipe-left) ──

  function onRowTouchStart(e: React.TouchEvent) {
    if (completing) return
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    isSwiping.current = false
    hasSwiped.current = false
  }

  function onRowTouchMove(e: React.TouchEvent) {
    if (!touchStartPos.current || completing) return
    const dx = e.touches[0].clientX - touchStartPos.current.x
    const dy = e.touches[0].clientY - touchStartPos.current.y

    if (!isSwiping.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      // Vertical movement dominant → let scroll through, ignore swipe
      if (Math.abs(dy) > Math.abs(dx)) return
      isSwiping.current = true
    }

    hasSwiped.current = true
    const base = trayOpenRef.current ? -TRAY_WIDTH : 0
    const rawX = base + dx
    const rowW = rowRef.current?.offsetWidth ?? 300

    let clampedX: number
    if (dx > 0 && !trayOpenRef.current) {
      // Swipe right (complete gesture): clamp at 65% row width
      clampedX = Math.min(rowW * 0.65, rawX)
    } else if (dx > 0) {
      // Swipe right when tray open → close tray
      clampedX = Math.min(0, rawX)
    } else {
      // Swipe left → reveal tray
      clampedX = Math.max(-TRAY_WIDTH, rawX)
    }
    setSwipeX(clampedX)
  }

  function onRowTouchEnd() {
    if (!touchStartPos.current) return

    if (!isSwiping.current) {
      touchStartPos.current = null
      // Tap with no swipe: if tray is open, close it
      if (trayOpenRef.current) {
        setSwipeX(0)
        setTrayOpen(false)
      }
      return
    }

    touchStartPos.current = null
    isSwiping.current = false

    const rowW = rowRef.current?.offsetWidth ?? 300
    const x = swipeXRef.current

    if (x >= rowW * 0.6) {
      // P3-01: swipe right past 60% → complete task
      setCompleting(true)
      setSwipeX(0)
      setTimeout(() => onComplete(task), 280)
    } else if (x <= -(TRAY_WIDTH / 2)) {
      // P3-02: swipe left far enough → lock tray open
      setSwipeX(-TRAY_WIDTH)
      setTrayOpen(true)
    } else {
      // Below threshold → snap back
      setSwipeX(0)
      setTrayOpen(false)
    }
  }

  // ── Grip handle touch-drag handlers (P3-03 mobile) ──

  function onGripTouchStart(e: React.TouchEvent) {
    e.stopPropagation()
    gripDragStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    gripDragActive.current = false
    gripDragTimer.current = setTimeout(() => {
      gripDragActive.current = true
      onTouchDragStart?.(task.id)
    }, 150)
  }

  function onGripTouchMove(e: React.TouchEvent) {
    e.stopPropagation()
    const touch = e.touches[0]
    if (!gripDragActive.current) {
      if (gripDragStartPos.current) {
        const moved = Math.hypot(
          touch.clientX - gripDragStartPos.current.x,
          touch.clientY - gripDragStartPos.current.y,
        )
        // Moved before 150ms — cancel drag, not a hold
        if (moved > 4) {
          clearTimeout(gripDragTimer.current!)
          gripDragTimer.current = null
        }
      }
      return
    }
    onTouchDragMove?.(touch.clientX, touch.clientY)
  }

  function onGripTouchEnd(e: React.TouchEvent) {
    e.stopPropagation()
    clearTimeout(gripDragTimer.current!)
    gripDragTimer.current = null
    if (!gripDragActive.current) return
    gripDragActive.current = false
    const t = e.changedTouches[0]
    onTouchDragEnd?.(t.clientX, t.clientY)
  }

  // ── Tray action handlers (P3-02) ──

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setSwipeX(0)
    setTrayOpen(false)
    onDelete?.(task)
  }

  function handleRescheduleClick(e: React.MouseEvent) {
    e.stopPropagation()
    dateInputRef.current?.click()
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const date = e.target.value
    if (date) {
      setSwipeX(0)
      setTrayOpen(false)
      onReschedule?.(task, date)
    }
  }

  const lateLabel = task.due_date ? overdayLabel(task.due_date) : null

  return (
    <div
      ref={wrapperRef}
      data-task-id={task.id}
      className={`${styles.rowOuter} ${isDragOver ? styles.dragOver : ''} ${isDragging ? styles.dragging : ''}`}
      draggable={!!showDragHandle}
      onDragStart={showDragHandle ? onDragStart : undefined}
      onDragOver={showDragHandle ? onDragOver : undefined}
      onDrop={showDragHandle ? onDrop : undefined}
      onDragEnd={showDragHandle ? onDragEnd : undefined}
      onTouchStart={onRowTouchStart}
      onTouchMove={onRowTouchMove}
      onTouchEnd={onRowTouchEnd}
    >
      {/* P3-02: action tray revealed by swiping left */}
      <div className={styles.tray}>
        <button className={styles.deleteAction} onClick={handleDelete} aria-label="Delete task">
          Delete
        </button>
        <button className={styles.rescheduleAction} onClick={handleRescheduleClick} aria-label="Reschedule task">
          Reschedule
          <input
            ref={dateInputRef}
            type="date"
            className={styles.hiddenDateInput}
            onChange={handleDateChange}
            tabIndex={-1}
          />
        </button>
      </div>

      {/* Main row — slides left/right on swipe */}
      <div
        ref={rowRef}
        className={`${styles.row} ${completing ? styles.completing : ''}`}
        style={completing ? {} : {
          transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
          transition: !isSwiping.current ? 'transform 150ms ease-out' : 'none',
        }}
        onClick={() => {
          if (hasSwiped.current) return
          if (trayOpen) { setSwipeX(0); setTrayOpen(false); return }
          onClick(task)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onClick(task)}
      >
        {/* P3-03: drag handle (only in ProjectDetailView list mode) */}
        {showDragHandle && (
          <div
            className={styles.dragHandle}
            onTouchStart={onGripTouchStart}
            onTouchMove={onGripTouchMove}
            onTouchEnd={onGripTouchEnd}
            onClick={e => e.stopPropagation()}
          >
            <GripIcon />
          </div>
        )}
        <button
          className={`${styles.check} ${task.status === 'completed' ? styles.done : ''}`}
          onClick={handleCheck}
          aria-label={task.status === 'completed' ? 'Mark incomplete' : 'Complete task'}
        />
        <span className={styles.pdot} style={{ background: P_COLORS[task.priority] }} />
        <span className={`${styles.title} ${task.status === 'completed' ? styles.titleDone : ''}`}>
          {task.title}
        </span>
        <div className={styles.meta}>
          {lateLabel && <Badge variant="red">{lateLabel}</Badge>}
          {task.project_name && (
            <Badge variant={projectBadgeVariant(task.project_name)}>{task.project_name}</Badge>
          )}
          {task.due_time && (
            <span className={styles.timeChip}>
              <IconClock size={9} aria-hidden />
              {task.due_time}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
