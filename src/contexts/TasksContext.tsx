import React, { createContext, useContext, useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/hooks/useApi'
import type { Task } from '@/types'

interface TasksContextValue {
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  fetchTasks: () => Promise<void>
  createTask: (payload: Partial<Task>) => Promise<Task | null>
}

const TasksContext = createContext<TasksContextValue | null>(null)

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([])

  const fetchTasks = useCallback(async () => {
    const data = await apiGet<Task[]>('/api/tasks')
    if (data) setTasks(data)
  }, [])

  const createTask = useCallback(async (payload: Partial<Task>) => {
    const task = await apiPost<Task>('/api/tasks', payload)
    if (task) setTasks(prev => [...prev, task])
    return task
  }, [])

  return (
    <TasksContext.Provider value={{ tasks, setTasks, fetchTasks, createTask }}>
      {children}
    </TasksContext.Provider>
  )
}

export function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasksContext must be used inside TasksProvider')
  return ctx
}
