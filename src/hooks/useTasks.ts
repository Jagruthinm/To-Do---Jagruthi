import { useState, useCallback } from 'react'
import { useTasksContext } from '@/contexts/TasksContext'
import { apiGet, apiPatch, apiDelete } from './useApi'
import type { Task } from '@/types'

export function useTasks() {
  const { tasks, setTasks, createTask } = useTasksContext()
  const [loading, setLoading] = useState(false)

  const fetchTasks = useCallback(async (params: Record<string, string> = {}) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(params).toString()
      const data = await apiGet<Task[]>(`/api/tasks${qs ? `?${qs}` : ''}`)
      if (data) setTasks(data)
      return data
    } finally {
      setLoading(false)
    }
  }, [setTasks])

  const updateTask = useCallback(async (id: string, payload: Partial<Task>) => {
    const updated = await apiPatch<Task>(`/api/tasks/${id}`, payload)
    if (updated) setTasks(prev => prev.map(t => t.id === id ? updated : t))
    return updated
  }, [setTasks])

  const completeTask = useCallback(async (id: string) => {
    return updateTask(id, { status: 'completed' })
  }, [updateTask])

  const deleteTask = useCallback(async (id: string) => {
    await apiDelete(`/api/tasks/${id}`)
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [setTasks])

  const removeFromList = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [setTasks])

  const restoreToList = useCallback((task: Task) => {
    setTasks(prev => [task, ...prev])
  }, [setTasks])

  const setTaskInList = useCallback((task: Task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? task : t))
  }, [setTasks])

  const reorderLocally = useCallback((fromId: string, toId: string) => {
    setTasks(prev => {
      const fromIdx = prev.findIndex(t => t.id === fromId)
      const toIdx = prev.findIndex(t => t.id === toId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [setTasks])

  return { tasks, loading, fetchTasks, createTask, updateTask, completeTask, deleteTask, removeFromList, restoreToList, setTaskInList, reorderLocally }
}
