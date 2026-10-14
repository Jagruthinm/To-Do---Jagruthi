export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  theme: 'light' | 'dark' | 'system'
}

export interface Area {
  id: string
  name: string
  color: string
  icon: string
  position: number
  archived_at?: number
  projects?: Project[]
}

export interface Project {
  id: string
  area_id?: string
  name: string
  description?: string
  color: string
  view_mode: 'list' | 'kanban'
  position: number
  archived_at?: number
  task_count?: number
}

export type Priority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  project_id?: string
  parent_task_id?: string
  title: string
  notes?: string
  priority: Priority
  status: 'pending' | 'completed' | 'cancelled'
  due_date?: string   // YYYY-MM-DD
  due_time?: string   // HH:MM
  position: number
  kanban_column?: 'todo' | 'in_progress' | 'done'
  planned_date?: string  // YYYY-MM-DD: set by My Day planner
  recurrence_rule?: string
  completed_at?: number
  created_at: number
  updated_at: number
  // joined
  tag_names?: string
  project_name?: string
  project_color?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Habit {
  id: string
  name: string
  description?: string
  frequency: 'daily' | 'weekdays' | 'weekly'
  target_days?: number[]
  color: string
  position: number
  current_streak?: number
  longest_streak?: number
}

export interface HabitLog {
  log_date: string
  completed: number
}

export interface Notification {
  id: string
  user_id: string
  task_id: string | null
  type: 'due_24h' | 'due_1h' | 'overdue' | 'task_created'
  title: string
  message: string
  read: number  // 0 | 1 (SQLite boolean)
  created_at: number
  task_title?: string
}
