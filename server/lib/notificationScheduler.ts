import { openDb } from '../../db/migrate.js'

interface TaskRow {
  id: string
  user_id: string
  title: string
  due_date: string
  due_time: string | null
  status: string
}

function getDueTimestamp(due_date: string, due_time: string | null): number {
  const timeStr = due_time ?? '23:59'
  return Math.floor(new Date(`${due_date}T${timeStr}:00`).getTime() / 1000)
}

function notificationExists(db: ReturnType<typeof openDb>, taskId: string, type: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM notifications WHERE task_id = ? AND type = ?'
  ).get(taskId, type)
  return row != null
}

export function checkDueNotifications() {
  const db = openDb()
  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const in1h   = nowSec + 3600
    const in24h  = nowSec + 86400

    const pendingTasks = db.prepare(`
      SELECT id, user_id, title, due_date, due_time, status
      FROM tasks
      WHERE status = 'pending' AND due_date IS NOT NULL
    `).all() as TaskRow[]

    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, task_id, type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const task of pendingTasks) {
      const dueSec = getDueTimestamp(task.due_date, task.due_time)

      if (dueSec < nowSec) {
        // Task is overdue
        if (!notificationExists(db, task.id, 'overdue')) {
          insertNotif.run(
            task.user_id, task.id, 'overdue',
            'Task overdue',
            `"${task.title}" is past its due date`
          )
        }
      } else if (dueSec <= in1h) {
        // Due within 1 hour
        if (!notificationExists(db, task.id, 'due_1h')) {
          insertNotif.run(
            task.user_id, task.id, 'due_1h',
            'Due in less than 1 hour',
            `"${task.title}" is due very soon`
          )
        }
      } else if (dueSec <= in24h) {
        // Due within 24 hours
        if (!notificationExists(db, task.id, 'due_24h')) {
          insertNotif.run(
            task.user_id, task.id, 'due_24h',
            'Due in less than 24 hours',
            `"${task.title}" is due in less than 24 hours`
          )
        }
      }
    }
  } finally {
    db.close()
  }
}

export function cancelTaskNotifications(taskId: string) {
  const db = openDb()
  try {
    db.prepare('DELETE FROM notifications WHERE task_id = ?').run(taskId)
  } finally {
    db.close()
  }
}

export function rescheduleTaskNotifications(taskId: string) {
  const db = openDb()
  try {
    db.prepare('DELETE FROM notifications WHERE task_id = ?').run(taskId)
  } finally {
    db.close()
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null

export function startNotificationScheduler() {
  if (schedulerInterval) return
  // Run once on startup, then every 60 seconds
  checkDueNotifications()
  schedulerInterval = setInterval(checkDueNotifications, 60_000)
}

export function stopNotificationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}
