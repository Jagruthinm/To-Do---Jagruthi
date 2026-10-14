import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { MainLayout } from '@/components/layout/MainLayout'
import { LoginPage } from '@/views/LoginPage'
import { RegisterPage } from '@/views/RegisterPage'
import { TodayView } from '@/views/TodayView'
import { InboxView } from '@/views/InboxView'
import { CalendarView } from '@/views/CalendarView'
import { ProjectsView } from '@/views/ProjectsView'
import { ProjectDetailView } from '@/views/ProjectDetailView'
import { HabitsView } from '@/views/HabitsView'
import { StatsView } from '@/views/StatsView'
import { EisenhowerView } from '@/views/EisenhowerView'
import { PlanView } from '@/views/PlanView'
import { ChatView } from '@/views/ChatView'
import { AgenticReportsView } from '@/views/AgenticReportsView'
import { ReportRunView } from '@/views/ReportRunView'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <AuthGuard><MainLayout /></AuthGuard>,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: '/today', element: <TodayView /> },
      { path: '/inbox', element: <InboxView /> },
      { path: '/calendar', element: <CalendarView /> },
      { path: '/projects', element: <ProjectsView /> },
      { path: '/projects/:id', element: <ProjectDetailView /> },
      { path: '/habits', element: <HabitsView /> },
      { path: '/stats', element: <StatsView /> },
      { path: '/matrix', element: <EisenhowerView /> },
      { path: '/plan', element: <PlanView /> },
      { path: '/chat', element: <ChatView /> },
      { path: '/chat/:sessionId', element: <ChatView /> },
      { path: '/agentic-reports', element: <AgenticReportsView /> },
      { path: '/agentic-reports/run/:reportId', element: <ReportRunView /> },
    ],
  },
])
