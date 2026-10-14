import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { DatabaseSync } from 'node:sqlite'

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createSession(db: DatabaseSync, userId: string): string {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

  db.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`)
    .run(userId, tokenHash, expiresAt)

  return token
}

export function lookupSession(db: DatabaseSync, token: string) {
  const tokenHash = hashToken(token)
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, u.id, u.email, u.name, u.avatar_url, u.theme
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > unixepoch()
  `).get(tokenHash) as { user_id: string; id: string; email: string; name: string; avatar_url?: string; theme: string } | undefined

  if (!session) return null

  const newExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  db.prepare(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?`).run(newExpiry, tokenHash)

  return session
}

export function deleteSession(db: DatabaseSync, token: string) {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token))
}
