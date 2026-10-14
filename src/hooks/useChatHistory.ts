import { useState, useCallback } from 'react'
import { apiGet, apiDelete } from './useApi'

export interface ChatSession {
  id: string
  title: string
  created_at: number
  updated_at: number
  summary?: string
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<ChatSession[]>('/api/chat/sessions')
      setSessions(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await apiDelete(`/api/chat/sessions/${id}`)
    setSessions(prev => prev.filter(s => s.id !== id))
  }, [])

  const refreshAfterSend = useCallback(async () => {
    try {
      const data = await apiGet<ChatSession[]>('/api/chat/sessions')
      setSessions(data)
    } catch { /* ignore */ }
  }, [])

  return { sessions, loading, fetchSessions, deleteSession, refreshAfterSend }
}
