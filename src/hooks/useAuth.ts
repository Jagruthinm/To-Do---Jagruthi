import { useState, useCallback } from 'react'
import type { User } from '@/types'

const TOKEN_KEY = 'taskflow_token'

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const register = useCallback(async (name: string, email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      }).catch(() => { throw new Error('Cannot reach server. Please try again.') })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      localStorage.setItem(TOKEN_KEY, data.token)
      setUser(data.user)
      return data.user as User
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).catch(() => { throw new Error('Cannot reach server. Please try again.') })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem(TOKEN_KEY, data.token)
      setUser(data.user)
      return data.user as User
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    const token = getToken()
    if (token) {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const fetchMe = useCallback(async (): Promise<User | null> => {
    const token = getToken()
    if (!token) return null
    try {
      const res = await fetch('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { localStorage.removeItem(TOKEN_KEY); return null }
      const data = await res.json()
      setUser(data)
      return data as User
    } catch {
      return null
    }
  }, [])

  return { user, loading, error, register, login, logout, fetchMe, getToken }
}

export { getToken }
