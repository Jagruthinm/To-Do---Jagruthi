import { useState, useEffect } from 'react'
import styles from './OfflineBanner.module.css'

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    function goOffline() { setOffline(true) }
    function goOnline()  { setOffline(false) }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      ⚠ You're offline — changes will sync when connected
    </div>
  )
}
