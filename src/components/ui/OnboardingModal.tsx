import { useState, useEffect, useRef } from 'react'
import { IconChecks, IconChevronRight, IconFlag, IconRepeat } from '@tabler/icons-react'
import { apiPost } from '@/hooks/useApi'
import styles from './OnboardingModal.module.css'

const STORAGE_KEY = 'taskflow_onboarded'

// Evaluated once at module load — stable across StrictMode remounts
const NEEDS_ONBOARDING = !localStorage.getItem(STORAGE_KEY)

const PRIORITIES = [
  { v: 1 as const, label: 'P1', color: 'var(--p1)' },
  { v: 2 as const, label: 'P2', color: 'var(--p2)' },
  { v: 3 as const, label: 'P3', color: 'var(--p3)' },
  { v: 4 as const, label: 'P4', color: 'var(--p4)' },
]

export function OnboardingModal() {
  const [visible, setVisible] = useState(NEEDS_ONBOARDING)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 2 — task
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDate, setTaskDate] = useState('')
  const [taskPriority, setTaskPriority] = useState<1 | 2 | 3 | 4 | null>(null)
  const [taskBusy, setTaskBusy] = useState(false)
  const [taskDone, setTaskDone] = useState(false)

  // Step 3 — habit
  const [habitName, setHabitName] = useState('')
  const [habitFreq, setHabitFreq] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [habitBusy, setHabitBusy] = useState(false)
  const [habitDone, setHabitDone] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap + auto-focus first element on each step
  useEffect(() => {
    if (!visible) return
    const modal = modalRef.current
    if (!modal) return

    const getFocusable = () =>
      [...modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])',
      )]

    const timer = setTimeout(() => getFocusable()[0]?.focus(), 60)

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const els = getFocusable()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible, step])

  if (!visible) return null

  function start() {
    localStorage.setItem(STORAGE_KEY, '1')
    setStep(2)
  }

  async function submitTask() {
    if (!taskTitle.trim() || taskBusy) return
    setTaskBusy(true)
    try {
      await apiPost('/api/tasks', {
        title: taskTitle.trim(),
        ...(taskDate && { due_date: taskDate }),
        ...(taskPriority !== null && { priority: taskPriority }),
      })
      setTaskDone(true)
      setTimeout(() => setStep(3), 800)
    } finally {
      setTaskBusy(false)
    }
  }

  async function submitHabit() {
    if (!habitName.trim() || habitBusy) return
    setHabitBusy(true)
    try {
      await apiPost('/api/habits', {
        name: habitName.trim(),
        frequency: habitFreq,
        color: '#1D9E75',
      })
      setHabitDone(true)
      setTimeout(() => setVisible(false), 800)
    } finally {
      setHabitBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to FocusAI"
      >
        {/* Step indicator */}
        <div className={styles.dots} aria-hidden="true">
          {([1, 2, 3] as const).map(n => (
            <div key={n} className={`${styles.dot} ${step === n ? styles.dotActive : ''}`} />
          ))}
        </div>

        {/* Step content — keyed so React remounts and CSS animation fires */}
        <div key={step} className={styles.stepContent}>

          {step === 1 && (
            <>
              <h2 className={styles.heading}>Welcome to FocusAI</h2>
              <p className={styles.tagline}>Your tasks. Your habits. Your day.</p>
              <ul className={styles.features}>
                <li>
                  <span className={styles.featureDot} style={{ background: 'var(--brand)' }} />
                  Tasks & projects — organised your way
                </li>
                <li>
                  <span className={styles.featureDot} style={{ background: 'var(--p3)' }} />
                  Daily habits — built one streak at a time
                </li>
                <li>
                  <span className={styles.featureDot} style={{ background: 'var(--p2)' }} />
                  Today view — focus on what matters now
                </li>
              </ul>
              <button className={styles.primaryBtn} onClick={start}>
                Get started <IconChevronRight size={16} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className={styles.stepIcon}>
                <IconFlag size={34} color="var(--brand)" />
              </div>
              <h2 className={styles.heading}>Add your first task</h2>
              <p className={styles.sub}>What's the first thing you want to get done?</p>

              {taskDone ? (
                <div className={styles.success}>
                  <IconChecks size={22} color="var(--text-green)" />
                  <span>Task added!</span>
                </div>
              ) : (
                <>
                  <input
                    className={styles.input}
                    placeholder="Task name…"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitTask()}
                  />
                  <input
                    className={styles.input}
                    type="date"
                    value={taskDate}
                    onChange={e => setTaskDate(e.target.value)}
                    aria-label="Due date"
                  />
                  <div className={styles.chipRow}>
                    {PRIORITIES.map(p => (
                      <button
                        key={p.v}
                        className={`${styles.priorityChip} ${taskPriority === p.v ? styles.chipActive : ''}`}
                        style={{ '--chip-color': p.color } as React.CSSProperties}
                        onClick={() => setTaskPriority(prev => prev === p.v ? null : p.v)}
                        aria-pressed={taskPriority === p.v}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.primaryBtn}
                      onClick={submitTask}
                      disabled={!taskTitle.trim() || taskBusy}
                    >
                      {taskBusy ? 'Adding…' : 'Add task'}
                    </button>
                    <button className={styles.skipBtn} onClick={() => setStep(3)}>
                      Skip <IconChevronRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className={styles.stepIcon}>
                <IconRepeat size={34} color="var(--brand)" />
              </div>
              <h2 className={styles.heading}>Track a habit</h2>
              <p className={styles.sub}>Small consistent actions create big results.</p>

              {habitDone ? (
                <div className={styles.success}>
                  <IconChecks size={22} color="var(--text-green)" />
                  <span>Habit created!</span>
                </div>
              ) : (
                <>
                  <input
                    className={styles.input}
                    placeholder="Habit name…"
                    value={habitName}
                    onChange={e => setHabitName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitHabit()}
                  />
                  <div className={styles.freqRow}>
                    {(['daily', 'weekdays', 'weekly'] as const).map(f => (
                      <button
                        key={f}
                        className={`${styles.freqBtn} ${habitFreq === f ? styles.freqActive : ''}`}
                        onClick={() => setHabitFreq(f)}
                        aria-pressed={habitFreq === f}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.primaryBtn}
                      onClick={submitHabit}
                      disabled={!habitName.trim() || habitBusy}
                    >
                      {habitBusy ? 'Adding…' : 'Add habit'}
                    </button>
                    <button className={styles.skipBtn} onClick={() => setVisible(false)}>
                      Skip <IconChevronRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
