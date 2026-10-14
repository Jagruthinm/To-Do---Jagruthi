import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { FAB } from './FAB'
import { SideNav } from './SideNav'
import { QuickAddSheet } from '@/components/task/QuickAddSheet'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { TasksProvider } from '@/contexts/TasksContext'
import { flush } from '@/hooks/useOfflineQueue'
import styles from './MainLayout.module.css'

export function MainLayout() {
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  return (
    <TasksProvider>
      <>
        <OfflineBanner />
        <div className={styles.layout}>
          <SideNav onNewTask={() => setSheetOpen(true)} />
          <main className={styles.main}>
            <Outlet />
          </main>
          <BottomNav />
          <FAB onClick={() => setSheetOpen(true)} />
          <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
        </div>
      </>
    </TasksProvider>
  )
}
