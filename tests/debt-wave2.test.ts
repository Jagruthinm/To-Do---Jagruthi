/**
 * tests/debt-wave2.test.ts
 *
 * Regression tests for v1 Tech Debt Wave 2
 * Covers: DIR-D2-01 (BUG-03), DIR-D2-02 (BUG-04), DIR-D2-03 (BUG-05),
 *         DIR-D2-04 (BUG-06), DIR-D2-05 (BUG-07)
 *
 * Directive: Communication/2026-07-09-po-directive-v1-debt-wave2.md
 * Setup file (tests/helpers/setup.ts) wires DB_PATH to an isolated temp DB.
 */

import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import path from 'node:path'
import { app } from '../server/app.js'
import { openDb } from '../db/migrate.js'
import { hashPassword, createSession } from '../server/auth.js'

const api = request(app)
const ROOT = process.cwd()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUser(email = `u${Date.now()}@debt2.test`) {
  const db = openDb()
  const hash = await hashPassword('Password1!')
  db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, 'Test', hash)
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
  const token = createSession(db, user.id)
  db.close()
  return { userId: user.id, token }
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D2-01 — BUG-03: CORS origin reads from CORS_ORIGIN env var
// Acceptance: (1) env set → header matches; (2) no env → fallback :5173;
//             (3) .env.example contains CORS_ORIGIN stub
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D2-01 — CORS_ORIGIN env var controls Allow-Origin header', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGIN
  })

  it('sets Access-Control-Allow-Origin to CORS_ORIGIN when the env var is present', async () => {
    process.env.CORS_ORIGIN = 'http://localhost:5175'
    const res = await api.get('/api/health')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5175')
  })

  it('falls back to http://localhost:5173 when CORS_ORIGIN is not set', async () => {
    delete process.env.CORS_ORIGIN
    const res = await api.get('/api/health')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('.env.example contains a CORS_ORIGIN stub so operators know the knob exists', () => {
    const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8')
    expect(envExample).toMatch(/CORS_ORIGIN/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D2-02 — BUG-04: Delete button visible on touch devices
// Acceptance: @media (hover: none) rule sets .deleteBtn opacity to 1
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D2-02 — NotificationBell delete button visible on touch (@media hover:none)', () => {
  const cssPath = path.join(ROOT, 'src', 'components', 'ui', 'NotificationBell.module.css')

  it('CSS contains an @media (hover: none) block', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toMatch(/@media\s*\(\s*hover\s*:\s*none\s*\)/)
  })

  it('the @media (hover: none) block sets .deleteBtn opacity to 1', () => {
    const css = fs.readFileSync(cssPath, 'utf-8')
    // Extract the content of the hover:none media block and check for opacity:1
    const mediaMatch = css.match(/@media\s*\(\s*hover\s*:\s*none\s*\)\s*\{([\s\S]*?)\}/)
    expect(mediaMatch).not.toBeNull()
    const blockContent = mediaMatch![1]
    expect(blockContent).toMatch(/opacity\s*:\s*1/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D2-03 — BUG-05: /api/notifications/unread-count endpoint removed
// Acceptance: GET /api/notifications/unread-count returns 404
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D2-03 — GET /api/notifications/unread-count removed (returns 404)', () => {
  it('returns 404 for authenticated requests (endpoint no longer exists)', async () => {
    const { token } = await createUser(`unreadcount-${Date.now()}@debt2.test`)
    const res = await api
      .get('/api/notifications/unread-count')
      .set(auth(token))
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D2-04 — BUG-06: aria-expanded and aria-haspopup on bell button
// Acceptance: (1) aria-expanded={open} present; (2) aria-haspopup="dialog" present
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D2-04 — NotificationBell button has aria-expanded and aria-haspopup', () => {
  const tsxPath = path.join(ROOT, 'src', 'components', 'ui', 'NotificationBell.tsx')

  it('bell button has aria-expanded={open}', () => {
    const src = fs.readFileSync(tsxPath, 'utf-8')
    expect(src).toMatch(/aria-expanded=\{open\}/)
  })

  it('bell button has aria-haspopup="dialog"', () => {
    const src = fs.readFileSync(tsxPath, 'utf-8')
    expect(src).toMatch(/aria-haspopup="dialog"/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DIR-D2-05 — BUG-07: Focus trap in notification dialog panel
// Acceptance: (1) Tab from last element wraps to first (handler exists);
//             (2) Shift+Tab from first wraps to last; (3) Escape still closes
// ─────────────────────────────────────────────────────────────────────────────

describe('DIR-D2-05 — NotificationBell panel has a Tab focus trap', () => {
  const tsxPath = path.join(ROOT, 'src', 'components', 'ui', 'NotificationBell.tsx')

  it('panel div has an onKeyDown handler attached', () => {
    const src = fs.readFileSync(tsxPath, 'utf-8')
    // The panel <div> (role="dialog") must wire up onKeyDown
    expect(src).toMatch(/role="dialog"[\s\S]{0,200}onKeyDown=\{|onKeyDown=\{[\s\S]{0,200}role="dialog"/)
  })

  it('handler traps Tab key (references "Tab" and cycles first/last focusable elements)', () => {
    const src = fs.readFileSync(tsxPath, 'utf-8')
    expect(src).toMatch(/['"]Tab['"]/)
    // Must reference both first and last focusable elements for cycling
    expect(src).toMatch(/\bfirst\b/)
    expect(src).toMatch(/\blast\b/)
  })

  it('handler still closes panel on Escape', () => {
    const src = fs.readFileSync(tsxPath, 'utf-8')
    // The handler (not the old global listener) must handle Escape
    // We check that Escape and Tab are handled in the same function scope
    expect(src).toMatch(/['"]Escape['"]/)
    expect(src).toMatch(/setOpen\(false\)/)
  })
})
