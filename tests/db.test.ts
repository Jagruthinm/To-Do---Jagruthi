/**
 * Database layer tests
 * Covers: schema correctness, constraints, CRUD helpers, FK cascades.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../db/migrate.js'
import { hashPassword, createSession, lookupSession, deleteSession } from '../server/auth.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function createUser(db: ReturnType<typeof openDb>, email = 'a@test.com', name = 'Alice') {
  db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, 'hash')
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { id: string; email: string; name: string }
}

// ── Schema ────────────────────────────────────────────────────────────────────

describe('Schema', () => {
  it('all tables exist after migration', () => {
    const db = openDb()
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]).map(r => r.name)
    db.close()
    expect(tables).toEqual(expect.arrayContaining([
      '_migrations', 'areas', 'habit_logs', 'habits',
      'projects', 'sessions', 'tags', 'task_tags', 'tasks', 'users',
    ]))
  })

  it('migration is idempotent (running twice does not error)', async () => {
    const { runMigrations } = await import('../db/migrate.js')
    expect(() => runMigrations()).not.toThrow()
  })

  it('expected indexes exist', () => {
    const db = openDb()
    const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as { name: string }[]).map(r => r.name)
    db.close()
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_tasks_user_status', 'idx_tasks_due_date', 'idx_sessions_token',
    ]))
  })
})

// ── Users ─────────────────────────────────────────────────────────────────────

describe('Users', () => {
  let db: ReturnType<typeof openDb>
  beforeEach(() => { db = openDb() })

  it('creates user with auto hex id', () => {
    db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run('u1@test.com', 'U1', 'h')
    const u = db.prepare('SELECT * FROM users WHERE email=?').get('u1@test.com') as { id: string }
    expect(u.id).toMatch(/^[0-9a-f]{16}$/)
    db.close()
  })

  it('rejects duplicate email (case-insensitive)', () => {
    db.prepare('INSERT INTO users (email, name) VALUES (?,?)').run('dup@test.com', 'D')
    expect(() => db.prepare('INSERT INTO users (email, name) VALUES (?,?)').run('DUP@TEST.COM', 'D2')).toThrow()
    db.close()
  })

  it('defaults theme to "system"', () => {
    db.prepare('INSERT INTO users (email, name) VALUES (?,?)').run('theme@test.com', 'T')
    const u = db.prepare('SELECT theme FROM users WHERE email=?').get('theme@test.com') as { theme: string }
    expect(u.theme).toBe('system')
    db.close()
  })
})

// ── Sessions ──────────────────────────────────────────────────────────────────

describe('Sessions', () => {
  it('createSession returns a token that lookupSession resolves', async () => {
    const db = openDb()
    const user = createUser(db, 'sess@test.com')
    const token = createSession(db, user.id)
    expect(token).toHaveLength(64)
    const session = lookupSession(db, token)
    expect(session).not.toBeNull()
    expect(session?.email).toBe('sess@test.com')
    db.close()
  })

  it('lookupSession returns null for unknown token', () => {
    const db = openDb()
    expect(lookupSession(db, 'notarealtoken')).toBeNull()
    db.close()
  })

  it('deleteSession invalidates the token', async () => {
    const db = openDb()
    const user = createUser(db, 'del@test.com')
    const token = createSession(db, user.id)
    deleteSession(db, token)
    expect(lookupSession(db, token)).toBeNull()
    db.close()
  })

  it('lookupSession slides expiry forward', async () => {
    const db = openDb()
    const user = createUser(db, 'slide@test.com')
    const token = createSession(db, user.id)
    const { hashToken } = await import('../server/auth.js')
    const tokenHash = hashToken(token)
    const before = (db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(tokenHash) as { expires_at: number }).expires_at
    lookupSession(db, token)
    const after = (db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(tokenHash) as { expires_at: number }).expires_at
    expect(after).toBeGreaterThanOrEqual(before)
    db.close()
  })
})

// ── Auth helpers ──────────────────────────────────────────────────────────────

describe('Auth helpers', () => {
  it('hashPassword + comparePassword round-trip', async () => {
    const { comparePassword } = await import('../server/auth.js')
    const hash = await hashPassword('secret123')
    expect(await comparePassword('secret123', hash)).toBe(true)
    expect(await comparePassword('wrong', hash)).toBe(false)
  })
})

// ── Areas ─────────────────────────────────────────────────────────────────────

describe('Areas', () => {
  it('creates area and cascades delete to projects', () => {
    const db = openDb()
    const user = createUser(db, 'area@test.com')
    db.prepare('INSERT INTO areas (user_id, name, color, icon) VALUES (?,?,?,?)').run(user.id, 'Work', '#fff', 'circle')
    const area = db.prepare('SELECT * FROM areas WHERE user_id=?').get(user.id) as { id: string }
    db.prepare('INSERT INTO projects (user_id, area_id, name) VALUES (?,?,?)').run(user.id, area.id, 'Proj')
    // Delete area → project area_id set to NULL (ON DELETE SET NULL)
    db.prepare('DELETE FROM areas WHERE id=?').run(area.id)
    const proj = db.prepare('SELECT area_id FROM projects WHERE user_id=?').get(user.id) as { area_id: null }
    expect(proj.area_id).toBeNull()
    db.close()
  })
})

// ── Projects ──────────────────────────────────────────────────────────────────

describe('Projects', () => {
  it('enforces view_mode CHECK constraint', () => {
    const db = openDb()
    const user = createUser(db, 'proj@test.com')
    expect(() =>
      db.prepare('INSERT INTO projects (user_id, name, view_mode) VALUES (?,?,?)').run(user.id, 'P', 'grid')
    ).toThrow()
    db.close()
  })

  it('accepts valid view_mode values', () => {
    const db = openDb()
    const user = createUser(db, 'proj2@test.com')
    expect(() => {
      db.prepare('INSERT INTO projects (user_id, name, view_mode) VALUES (?,?,?)').run(user.id, 'L', 'list')
      db.prepare('INSERT INTO projects (user_id, name, view_mode) VALUES (?,?,?)').run(user.id, 'K', 'kanban')
    }).not.toThrow()
    db.close()
  })
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('Tasks', () => {
  it('creates task with all fields and correct defaults', () => {
    const db = openDb()
    const user = createUser(db, 'task@test.com')
    db.prepare('INSERT INTO tasks (user_id, title) VALUES (?,?)').run(user.id, 'Buy milk')
    const t = db.prepare('SELECT * FROM tasks WHERE user_id=?').get(user.id) as {
      id: string; status: string; priority: number; kanban_column: string
    }
    expect(t.id).toMatch(/^[0-9a-f]{16}$/)
    expect(t.status).toBe('pending')
    expect(t.priority).toBe(4)
    expect(t.kanban_column).toBe('todo')
    db.close()
  })

  it('enforces priority CHECK (1-4)', () => {
    const db = openDb()
    const user = createUser(db, 'pri@test.com')
    expect(() => db.prepare('INSERT INTO tasks (user_id, title, priority) VALUES (?,?,?)').run(user.id, 'T', 5)).toThrow()
    expect(() => db.prepare('INSERT INTO tasks (user_id, title, priority) VALUES (?,?,?)').run(user.id, 'T', 0)).toThrow()
    db.close()
  })

  it('enforces status CHECK', () => {
    const db = openDb()
    const user = createUser(db, 'stat@test.com')
    expect(() => db.prepare('INSERT INTO tasks (user_id, title, status) VALUES (?,?,?)').run(user.id, 'T', 'done')).toThrow()
    db.close()
  })

  it('enforces kanban_column CHECK', () => {
    const db = openDb()
    const user = createUser(db, 'kan@test.com')
    expect(() => db.prepare('INSERT INTO tasks (user_id, title, kanban_column) VALUES (?,?,?)').run(user.id, 'T', 'backlog')).toThrow()
    db.close()
  })

  it('deleting user cascades to tasks', () => {
    const db = openDb()
    const user = createUser(db, 'casc@test.com')
    db.prepare('INSERT INTO tasks (user_id, title) VALUES (?,?)').run(user.id, 'T')
    db.prepare('DELETE FROM users WHERE id=?').run(user.id)
    const count = (db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id=?').get(user.id) as { n: number }).n
    expect(count).toBe(0)
    db.close()
  })
})

// ── Tags ──────────────────────────────────────────────────────────────────────

describe('Tags', () => {
  it('enforces unique tag name per user', () => {
    const db = openDb()
    const user = createUser(db, 'tag@test.com')
    db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(user.id, 'urgent')
    expect(() => db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(user.id, 'urgent')).toThrow()
    db.close()
  })

  it('same tag name allowed for different users', () => {
    const db = openDb()
    const u1 = createUser(db, 'tagu1@test.com')
    const u2 = createUser(db, 'tagu2@test.com')
    expect(() => {
      db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(u1.id, 'work')
      db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(u2.id, 'work')
    }).not.toThrow()
    db.close()
  })

  it('task_tags junction cascades on tag delete', () => {
    const db = openDb()
    const user = createUser(db, 'tagj@test.com')
    db.prepare('INSERT INTO tasks (user_id, title) VALUES (?,?)').run(user.id, 'T')
    const task = db.prepare('SELECT id FROM tasks WHERE user_id=?').get(user.id) as { id: string }
    db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(user.id, 'mytag')
    const tag = db.prepare('SELECT id FROM tags WHERE user_id=?').get(user.id) as { id: string }
    db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?,?)').run(task.id, tag.id)
    db.prepare('DELETE FROM tags WHERE id=?').run(tag.id)
    const jn = (db.prepare('SELECT COUNT(*) AS n FROM task_tags WHERE task_id=?').get(task.id) as { n: number }).n
    expect(jn).toBe(0)
    db.close()
  })
})

// ── Habits ────────────────────────────────────────────────────────────────────

describe('Habits', () => {
  it('creates habit with correct defaults', () => {
    const db = openDb()
    const user = createUser(db, 'hab@test.com')
    db.prepare('INSERT INTO habits (user_id, name) VALUES (?,?)').run(user.id, 'Exercise')
    const h = db.prepare('SELECT * FROM habits WHERE user_id=?').get(user.id) as { frequency: string; color: string }
    expect(h.frequency).toBe('daily')
    expect(h.color).toBe('#1D9E75')
    db.close()
  })

  it('enforces frequency CHECK', () => {
    const db = openDb()
    const user = createUser(db, 'habf@test.com')
    expect(() => db.prepare('INSERT INTO habits (user_id, name, frequency) VALUES (?,?,?)').run(user.id, 'H', 'hourly')).toThrow()
    db.close()
  })

  it('habit_logs upsert with INSERT OR REPLACE', () => {
    const db = openDb()
    const user = createUser(db, 'hlog@test.com')
    db.prepare('INSERT INTO habits (user_id, name) VALUES (?,?)').run(user.id, 'Read')
    const habit = db.prepare('SELECT id FROM habits WHERE user_id=?').get(user.id) as { id: string }
    db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, log_date, completed) VALUES (?,?,?)').run(habit.id, '2026-06-01', 1)
    db.prepare('INSERT OR REPLACE INTO habit_logs (habit_id, log_date, completed) VALUES (?,?,?)').run(habit.id, '2026-06-01', 0)
    const log = db.prepare('SELECT completed FROM habit_logs WHERE habit_id=? AND log_date=?').get(habit.id, '2026-06-01') as { completed: number }
    expect(log.completed).toBe(0)
    db.close()
  })
})
