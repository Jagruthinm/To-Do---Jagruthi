import { useState, useEffect, useRef } from 'react'
import { IconFlame, IconPlus, IconX } from '@tabler/icons-react'
import { IllustrationHabits } from '@/components/ui/illustrations'
import { TopBar } from '@/components/layout/TopBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/hooks/useApi'
import { localDateString } from '@/utils/date'
import type { Habit } from '@/types'
import styles from './HabitsView.module.css'

function last21Days(): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = 20; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i)
    days.push(localDateString(d))
  }
  return days
}

const DAYS_21 = last21Days()
const PRESET_COLORS = ['#1D9E75', '#4B96FF', '#FF6B6B', '#FFB347', '#9B59B6', '#1ABC9C']
const FREQ_LABELS: Record<string, string> = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly' }
const FREQ_ORDER = ['daily', 'weekdays', 'weekly'] as const

export function HabitsView() {
  const [habits, setHabits] = useState<(Habit & { logs: string[]; streak: number })[]>([])
  const [loading, setLoading] = useState(false)
  const todayStr = DAYS_21[DAYS_21.length - 1]

  const [archivingId, setArchivingId] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressCoords = useRef<{ x: number; y: number } | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newFreq, setNewFreq] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiGet<(Habit & { logs: string[]; streak: number })[]>('/api/habits')
      .then(setHabits)
      .finally(() => setLoading(false))
  }, [])

  async function toggleToday(habit: Habit & { logs: string[]; streak: number }) {
    const done = habit.logs.includes(todayStr)
    // Optimistic UI update
    setHabits(prev => prev.map(h => h.id === habit.id
      ? { ...h, logs: done ? h.logs.filter(d => d !== todayStr) : [...h.logs, todayStr] }
      : h
    ))
    try {
      if (done) {
        await apiDelete(`/api/habits/${habit.id}/log/${todayStr}`)
      } else {
        await apiPost(`/api/habits/${habit.id}/log`, { date: todayStr })
      }
      // Re-fetch to get the authoritative streak from the server
      const updated = await apiGet<(Habit & { logs: string[]; streak: number })[]>('/api/habits')
      setHabits(updated)
    } catch (err) {
      console.error('Failed to toggle habit log:', err)
      // Revert optimistic update
      setHabits(prev => prev.map(h => h.id === habit.id ? habit : h))
    }
  }

  async function createHabit() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const habit = await apiPost<Habit & { logs: string[]; streak: number }>('/api/habits', {
        name: newName.trim(),
        frequency: newFreq,
        color: newColor,
      })
      if (habit) setHabits(prev => [...prev, { ...habit, logs: [], streak: 0 }])
      setNewName('')
      setNewFreq('daily')
      setNewColor(PRESET_COLORS[0])
      setSheetOpen(false)
    } finally {
      setCreating(false)
    }
  }

  async function archiveHabit(habitId: string) {
    const saved = habits.find(h => h.id === habitId)
    setHabits(prev => prev.filter(h => h.id !== habitId))
    setArchivingId(null)
    try {
      await apiPatch(`/api/habits/${habitId}`, { archived_at: Math.floor(Date.now() / 1000) })
    } catch {
      if (saved) setHabits(prev => [...prev, saved])
    }
  }

  function onCardPointerDown(e: React.PointerEvent, habitId: string) {
    longPressCoords.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      setArchivingId(habitId)
      longPressTimer.current = null
    }, 500)
  }

  function onCardPointerMove(e: React.PointerEvent) {
    if (!longPressTimer.current || !longPressCoords.current) return
    const moved = Math.hypot(e.clientX - longPressCoords.current.x, e.clientY - longPressCoords.current.y)
    if (moved > 8) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      longPressCoords.current = null
    }
  }

  function onCardPointerUp() {
    clearTimeout(longPressTimer.current!)
    longPressTimer.current = null
    longPressCoords.current = null
  }

  return (
    <div className={styles.view}>
      <TopBar
        title="Habits"
        right={
          <button className={styles.addHabitBtn} onClick={() => setSheetOpen(true)} aria-label="New habit">
            <IconPlus size={20} />
          </button>
        }
      />

      <div className={styles.content}>
        {loading && <p className={styles.loading}>Loading…</p>}

        {!loading && habits.length === 0 && (
          <EmptyState
            icon={<IllustrationHabits />}
            title="No habits yet"
            subtitle="Tap + to start tracking a habit."
          />
        )}

        {!loading && habits.length > 0 && FREQ_ORDER.map(freq => {
          const group = habits.filter(h => h.frequency === freq)
          if (group.length === 0) return null
          return (
            <div key={freq}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{FREQ_LABELS[freq]}</span>
                <span className={styles.badge}>{group.length}</span>
              </div>
              {group.map(habit => {
                const doneToday = habit.logs.includes(todayStr)
                const streakColor = habit.streak >= 7
                  ? 'var(--brand-dark)'
                  : habit.streak >= 1
                    ? 'var(--text-amber)'
                    : 'var(--text-secondary)'
                const isArchiving = archivingId === habit.id
                return (
                  <div
                    key={habit.id}
                    className={styles.card}
                    onPointerDown={e => onCardPointerDown(e, habit.id)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerUp}
                  >
                    <div className={styles.cardHeader}>
                      <div>
                        <span className={styles.habitName}>{habit.name}</span>
                        {habit.description && <p className={styles.desc}>{habit.description}</p>}
                      </div>
                      <div className={styles.streak} style={{ color: streakColor }}>
                        <IconFlame size={14} color={streakColor} aria-hidden />
                        <span>{habit.streak}</span>
                      </div>
                    </div>

                    <div className={styles.dotGrid}>
                      {DAYS_21.map(d => {
                        const done = habit.logs.includes(d)
                        const isToday = d === todayStr
                        return (
                          <div
                            key={d}
                            className={`${styles.dot} ${done ? styles.dotDone : ''} ${isToday ? styles.dotToday : ''}`}
                            style={{
                              ...(done ? { background: habit.color } : {}),
                              ...(isToday ? { outlineColor: habit.color } : {}),
                            }}
                            title={d}
                          />
                        )
                      })}
                    </div>

                    {isArchiving ? (
                      <div className={styles.archiveConfirm}>
                        <span className={styles.archiveLabel}>Archive this habit?</span>
                        <div className={styles.archiveBtns}>
                          <button className={styles.archiveCancel} onClick={() => setArchivingId(null)}>Cancel</button>
                          <button className={styles.archiveConfirmBtn} onClick={() => archiveHabit(habit.id)}>Archive</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={`${styles.logBtn} ${doneToday ? styles.logBtnDone : ''}`}
                        style={doneToday
                          ? { background: habit.color, borderColor: habit.color }
                          : { borderColor: habit.color, color: habit.color }
                        }
                        onClick={() => toggleToday(habit)}
                      >
                        {doneToday ? 'Done today — tap to undo' : 'Mark done'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {sheetOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setSheetOpen(false)} aria-hidden />
          <div className={styles.sheet} role="dialog" aria-label="New habit" aria-modal>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>New habit</span>
              <button onClick={() => setSheetOpen(false)} aria-label="Close" className={styles.sheetClose}>
                <IconX size={18} />
              </button>
            </div>

            <input
              className={styles.sheetInput}
              placeholder="Habit name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSheetOpen(false)}
              autoFocus
            />

            <p className={styles.sheetLabel}>Frequency</p>
            <div className={styles.freqRow}>
              {(['daily', 'weekdays', 'weekly'] as const).map(f => (
                <button
                  key={f}
                  className={`${styles.freqBtn} ${newFreq === f ? styles.freqActive : ''}`}
                  onClick={() => setNewFreq(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            <p className={styles.sheetLabel}>Color</p>
            <div className={styles.colorRow}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.colorSwatch} ${newColor === c ? styles.colorActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>

            <button
              className={styles.sheetSubmit}
              onClick={createHabit}
              disabled={!newName.trim() || creating}
            >
              {creating ? 'Adding…' : 'Add habit'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
