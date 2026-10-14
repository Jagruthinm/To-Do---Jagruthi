import type { Request, Response, NextFunction } from 'express'
import { lookupSession } from '../auth.js'
import { openDb } from '../../db/migrate.js'

export interface AuthRequest extends Request {
  userId: string
  user: { id: string; email: string; name: string; avatar_url?: string; theme: string }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const token = header.slice(7)
  const db = openDb()
  try {
    const session = lookupSession(db, token)
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    const authReq = req as AuthRequest
    authReq.userId = session.id
    authReq.user = { id: session.id, email: session.email, name: session.name, avatar_url: session.avatar_url, theme: session.theme }
    next()
  } finally {
    db.close()
  }
}
