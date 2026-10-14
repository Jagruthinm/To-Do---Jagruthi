import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPatch, apiDelete } from './useApi'
import type { Notification } from '@/types'

const POLL_INTERVAL = 30_000 // 30 seconds

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiGet<Notification[]>('/api/notifications')
      setNotifications(data)
    } catch {
      // fail silently — non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchNotifications])

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: 1 } : n)
    )
    await apiPatch(`/api/notifications/${id}/read`, {})
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })))
    await apiPatch('/api/notifications/read-all', {})
  }, [])

  const remove = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await apiDelete(`/api/notifications/${id}`)
  }, [])

  const unreadCount = notifications.filter(n => n.read === 0).length

  return { notifications, loading, unreadCount, markRead, markAllRead, remove, refresh: fetchNotifications }
}
