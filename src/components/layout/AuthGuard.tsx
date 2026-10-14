import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getToken } from '@/hooks/useAuth'
import { OnboardingModal } from '@/components/ui/OnboardingModal'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { fetchMe } = useAuth()
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (!getToken()) { setChecked(true); return }
    fetchMe().then(u => { setAuthed(!!u); setChecked(true) })
  }, [fetchMe])

  if (!checked) return null
  if (!authed) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      <OnboardingModal />
    </>
  )
}
