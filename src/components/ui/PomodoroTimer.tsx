import { useState, useEffect, useRef } from 'react'
import { IconClock, IconPlayerPlay, IconPlayerPause, IconRotate } from '@tabler/icons-react'
import styles from './PomodoroTimer.module.css'

const WORK_SECS = 25 * 60
const CIRCUMFERENCE = 2 * Math.PI * 24

interface Props {
  taskTitle: string
}

export function PomodoroTimer({ taskTitle }: Props) {
  const [secs, setSecs] = useState(WORK_SECS)
  const [running, setRunning] = useState(false)
  const taskTitleRef = useRef(taskTitle)

  // Reset when the open task changes
  useEffect(() => {
    if (taskTitleRef.current !== taskTitle) {
      taskTitleRef.current = taskTitle
      setRunning(false)
      setSecs(WORK_SECS)
    }
  }, [taskTitle])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setSecs(prev => {
        if (prev <= 1) {
          clearInterval(id)
          setRunning(false)
          notify(taskTitleRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  function toggle() {
    if (secs === 0) return
    if (!running && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setRunning(r => !r)
  }

  function reset() {
    setRunning(false)
    setSecs(WORK_SECS)
  }

  const done = secs === 0
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  // Offset fills ring as time is consumed (full at 0s remaining)
  const offset = CIRCUMFERENCE * (secs / WORK_SECS)
  const label = running ? 'Pause' : secs === WORK_SECS ? 'Start' : 'Resume'

  return (
    <div className={styles.root}>
      <div className={styles.sectionLabel}>
        <IconClock size={13} aria-hidden />
        Pomodoro
      </div>
      <div className={styles.body}>
        <div className={styles.ringWrap}>
          <svg viewBox="0 0 56 56" className={styles.svg} aria-hidden="true">
            <circle cx="28" cy="28" r="24" className={styles.track} />
            <circle
              cx="28" cy="28" r="24"
              className={styles.arc}
              style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: offset }}
            />
          </svg>
          <span
            className={`${styles.time} ${done ? styles.timeDone : ''}`}
            aria-live="polite"
            aria-label={`${mm} minutes ${ss} seconds remaining`}
          >
            {mm}:{ss}
          </span>
        </div>

        <div className={styles.controls}>
          <button
            className={`${styles.ctrlBtn} ${styles.primary}`}
            onClick={toggle}
            disabled={done}
            aria-label={label}
            title={label}
          >
            {running
              ? <IconPlayerPause size={18} />
              : <IconPlayerPlay size={18} />
            }
          </button>
          <button
            className={styles.ctrlBtn}
            onClick={reset}
            aria-label="Reset timer"
            title="Reset"
          >
            <IconRotate size={16} />
          </button>
        </div>
      </div>

      {done && (
        <p className={styles.completedMsg} role="status">
          Pomodoro complete — take a break!
        </p>
      )}
    </div>
  )
}

function notify(title: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification('Pomodoro complete!', {
    body: `25 min of focus on "${title}" — time for a break.`,
    icon: '/favicon.ico',
    tag: 'pomodoro',
  })
}
