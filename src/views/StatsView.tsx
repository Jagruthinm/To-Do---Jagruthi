import { useState, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { apiGet } from '@/hooks/useApi'
import styles from './StatsView.module.css'

interface DayCount { date: string; count: number }
interface Summary {
  tasks_completed_today: number
  tasks_completed_week: number
  overdue_count: number
  top_habit_streak: number
}

export function StatsView() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [completions, setCompletions] = useState<DayCount[]>([])

  useEffect(() => {
    apiGet<Summary>('/api/stats/summary').then(setSummary).catch(() => {})
    apiGet<DayCount[]>('/api/stats/completions?days=14').then(setCompletions).catch(() => {})
  }, [])

  const max = Math.max(1, ...completions.map(d => d.count))

  return (
    <div className={styles.view}>
      <TopBar title="Stats" />
      <div className={styles.content}>
        {summary && (
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.num}>{summary.tasks_completed_today}</span>
              <span className={styles.label}>Completed today</span>
            </div>
            <div className={styles.card}>
              <span className={styles.num}>{summary.tasks_completed_week}</span>
              <span className={styles.label}>This week</span>
            </div>
            <div className={`${styles.card} ${summary.overdue_count > 0 ? styles.cardRed : ''}`}>
              <span className={styles.num}>{summary.overdue_count}</span>
              <span className={styles.label}>Overdue</span>
            </div>
            <div className={styles.card}>
              <span className={styles.num}>{summary.top_habit_streak}</span>
              <span className={styles.label}>Best streak</span>
            </div>
          </div>
        )}

        {completions.length > 0 && (
          <div className={styles.chart}>
            <h3 className={styles.chartTitle}>Completions — last 14 days</h3>
            <div className={styles.bars}>
              {completions.map(d => (
                <div key={d.date} className={styles.barItem}>
                  <div className={styles.bar} style={{ height: `${Math.round((d.count / max) * 80)}px` }} />
                  <span className={styles.barLabel}>
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className={styles.barCount}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {completions.length === 0 && summary !== null && (
          <p className={styles.empty}>Complete some tasks to see your progress chart!</p>
        )}
      </div>
    </div>
  )
}
