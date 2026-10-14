import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations, openDb } from '../db/migrate.js'
import { checkDueNotifications, cancelTaskNotifications, rescheduleTaskNotifications } from '../server/lib/notificationScheduler.js'

// Use an isolated temp DB so notifications tests never touch the live taskflow.db
const testDbPath = path.join(os.tmpdir(), `taskflow-notif-test-${process.pid}.db`)
process.env.DB_PATH = testDbPath

// ── helpers ──────────────────────────────────────────────────────────────────

function createUser(db: DatabaseSync, email = 'notif@test.com') {
  db.prepare(`
    INSERT INTO users (email, name, password_hash) VALUES (?, 'Test', 'x')
  `).run(email)
  return (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
}

function createTask(
  db: DatabaseSync,
  userId: string,
  opts: { due_date?: string; due_time?: string; status?: string } = {}
) {
  db.prepare(`
    INSERT INTO tasks (user_id, title, due_date, due_time, status, priority)
    VALUES (?, 'Test task', ?, ?, ?, 4)
  `).run(userId, opts.due_date ?? null, opts.due_time ?? null, opts.status ?? 'pending')
  return (db.prepare('SELECT id FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) as { id: string }).id
}

function notifCount(db: DatabaseSync, taskId: string, type?: string): number {
  if (type) {
    return (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE task_id = ? AND type = ?').get(taskId, type) as { c: number }).c
  }
  return (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE task_id = ?').get(taskId) as { c: number }).c
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Notification system', () => {
  beforeAll(() => { runMigrations() })

  afterEach(() => {
    const db = openDb()
    db.exec('DELETE FROM notifications; DELETE FROM tasks; DELETE FROM users')
    db.close()
  })

  afterAll(() => {
    try { fs.unlinkSync(testDbPath) } catch { /* ok */ }
    try { fs.unlinkSync(testDbPath + '-wal') } catch { /* ok */ }
    try { fs.unlinkSync(testDbPath + '-shm') } catch { /* ok */ }
  })

  it('creates a due_24h notification for a task due within 24 hours', () => {
    const db = openDb()
    const userId = createUser(db)
    const tomorrow = new Date(); tomorrow.setHours(tomorrow.getHours() + 4)
    const dueDate = tomorrow.toISOString().slice(0, 10)
    const taskId = createTask(db, userId, { due_date: dueDate, due_time: `${String(tomorrow.getHours()).padStart(2,'0')}:${String(tomorrow.getMinutes()).padStart(2,'0')}` })
    db.close()

    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId, 'due_24h')).toBe(1)
    db2.close()
  })

  it('creates a due_1h notification for a task due within 1 hour', () => {
    const db = openDb()
    const userId = createUser(db)
    const soon = new Date(); soon.setMinutes(soon.getMinutes() + 30)
    const taskId = createTask(db, userId, {
      due_date: soon.toISOString().slice(0, 10),
      due_time: `${String(soon.getHours()).padStart(2,'0')}:${String(soon.getMinutes()).padStart(2,'0')}`,
    })
    db.close()

    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId, 'due_1h')).toBe(1)
    db2.close()
  })

  it('creates an overdue notification for a task past its due date', () => {
    const db = openDb()
    const userId = createUser(db)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const taskId = createTask(db, userId, { due_date: yesterday.toISOString().slice(0, 10) })
    db.close()

    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId, 'overdue')).toBe(1)
    db2.close()
  })

  it('does not create duplicate notifications for the same task and type', () => {
    const db = openDb()
    const userId = createUser(db)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const taskId = createTask(db, userId, { due_date: yesterday.toISOString().slice(0, 10) })
    db.close()

    checkDueNotifications()
    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId, 'overdue')).toBe(1)
    db2.close()
  })

  it('does not create notifications for tasks with no due date', () => {
    const db = openDb()
    const userId = createUser(db)
    const taskId = createTask(db, userId, {})
    db.close()

    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId)).toBe(0)
    db2.close()
  })

  it('does not create notifications for completed tasks', () => {
    const db = openDb()
    const userId = createUser(db)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const taskId = createTask(db, userId, {
      due_date: yesterday.toISOString().slice(0, 10),
      status: 'completed',
    })
    db.close()

    checkDueNotifications()

    const db2 = openDb()
    expect(notifCount(db2, taskId)).toBe(0)
    db2.close()
  })

  it('cancelTaskNotifications removes unread notifications for the task', () => {
    const db = openDb()
    const userId = createUser(db)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const taskId = createTask(db, userId, { due_date: yesterday.toISOString().slice(0, 10) })
    db.close()

    checkDueNotifications()
    cancelTaskNotifications(taskId)

    const db2 = openDb()
    expect(notifCount(db2, taskId)).toBe(0)
    db2.close()
  })

  it('rescheduleTaskNotifications removes all notifications for the task', () => {
    const db = openDb()
    const userId = createUser(db)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const taskId = createTask(db, userId, { due_date: yesterday.toISOString().slice(0, 10) })
    db.close()

    checkDueNotifications()

    // Mark as read to verify reschedule removes even read ones
    const db2 = openDb()
    db2.prepare('UPDATE notifications SET read = 1 WHERE task_id = ?').run(taskId)
    db2.close()

    rescheduleTaskNotifications(taskId)

    const db3 = openDb()
    expect(notifCount(db3, taskId)).toBe(0)
    db3.close()
  })
})
