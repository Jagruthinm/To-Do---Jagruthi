import { useState, useEffect, useCallback } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { TopBar } from '@/components/layout/TopBar'
import { apiGet, apiPatch } from '@/hooks/useApi'
import type { Task } from '@/types'
import styles from './CalendarView.module.css'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate()
}

function firstDayOfWeek(y: number, m: number) {
  return new Date(y, m, 1).getDay()
}

export function CalendarView() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string>(isoDate(now.getFullYear(), now.getMonth(), now.getDate()))
  const [dotMap, setDotMap] = useState<Record<string, number>>({})
  const [dayTasks, setDayTasks] = useState<Task[]>([])
  const [upcoming, setUpcoming] = useState<Task[]>([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    apiGet<Record<string, number>>(`/api/tasks/calendar?ym=${ym}`)
      .then(setDotMap)
      .catch(() => setDotMap({}))
  }, [year, month, refresh])

  useEffect(() => {
    apiGet<Task[]>(`/api/tasks?due_date=${selected}&status=pending`)
      .then(setDayTasks)
      .catch(() => setDayTasks([]))
  }, [selected, refresh])

  useEffect(() => {
    apiGet<Task[]>('/api/tasks/upcoming')
      .then(setUpcoming)
      .catch(() => setUpcoming([]))
  }, [refresh])

  const handleComplete = useCallback(async (task: Task) => {
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: 'completed' })
      setRefresh(r => r + 1)
    } catch {
      console.error('Failed to complete task')
    }
  }, [])

  function prev() {
    if (month === 0) { setYear(y => y-1); setMonth(11) }
    else setMonth(m => m-1)
  }

  function next() {
    if (month === 11) { setYear(y => y+1); setMonth(0) }
    else setMonth(m => m+1)
  }

  const totalDays = daysInMonth(year, month)
  const startDay = firstDayOfWeek(year, month)
  const todayStr = isoDate(now.getFullYear(), now.getMonth(), now.getDate())

  const cells: (number | null)[] = Array(startDay).fill(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  return (
    <div className={styles.view}>
      <TopBar title="Calendar" />

      <div className={styles.content}>
        <div className={styles.monthNav}>
          <button onClick={prev} aria-label="Previous month"><IconChevronLeft size={18} /></button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button onClick={next} aria-label="Next month"><IconChevronRight size={18} /></button>
        </div>

        <div className={styles.dayHeaders}>
          {DAYS.map(d => <span key={d} className={styles.dayName}>{d}</span>)}
        </div>

        <div className={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const ds = isoDate(year, month, day)
            const count = dotMap[ds] ?? 0
            const isToday = ds === todayStr
            const isSelected = ds === selected
            return (
              <button
                key={ds}
                className={`${styles.dayCell} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                onClick={() => setSelected(ds)}
                aria-label={`${MONTHS[month]} ${day}, ${year}`}
              >
                <span className={styles.dayNum}>{day}</span>
                {count > 0 && <span className={styles.dot} style={{ opacity: Math.min(count / 5, 1) }} />}
              </button>
            )
          })}
        </div>

        {dayTasks.length > 0 && (
          <div className={styles.daySection}>
            <h3 className={styles.dayTitle}>{new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            {dayTasks.map(t => (
              <div key={t.id} className={styles.taskChip}>
                <span className={styles.taskDot} style={{ background: `var(--p${t.priority})` }} />
                <span className={styles.taskName}>{t.title}</span>
                <button
                  className={styles.completeBtn}
                  onClick={() => handleComplete(t)}
                  aria-label={`Complete ${t.title}`}
                >✓</button>
              </div>
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className={styles.upcomingSection}>
            <h3 className={styles.upcomingTitle}>Upcoming — next 14 days</h3>
            {upcoming.map(t => (
              <div key={t.id} className={styles.upcomingItem}>
                <div className={styles.upcomingDate}>
                  {new Date(t.due_date! + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <span className={styles.taskName}>{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
