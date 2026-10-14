import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll } from 'vitest'

// Each test-file process gets its own isolated SQLite file.
const testDbPath = path.join(os.tmpdir(), `taskflow-test-${process.pid}.db`)
process.env.DB_PATH = testDbPath

beforeAll(async () => {
  // Run migrations on the fresh test DB.
  const { runMigrations } = await import('../../db/migrate.js')
  runMigrations()
})

afterAll(() => {
  try { fs.unlinkSync(testDbPath) } catch { /* already gone */ }
  // WAL sidecar files
  try { fs.unlinkSync(testDbPath + '-wal') } catch { /* ok */ }
  try { fs.unlinkSync(testDbPath + '-shm') } catch { /* ok */ }
})
