import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { IconChecks, IconBrandGoogle, IconBrandGithub } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import styles from './AuthPage.module.css'

export function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [passErr, setPassErr] = useState('')
  const [serverErr, setServerErr] = useState('')

  function validateEmail() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr('Please enter a valid email'); return false
    }
    setEmailErr(''); return true
  }

  function validatePassword() {
    if (password.length < 8) {
      setPassErr('Password must be at least 8 characters'); return false
    }
    setPassErr(''); return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateEmail() || !validatePassword()) return
    try {
      await login(email, password)
      navigate('/today')
    } catch (err: unknown) {
      setServerErr(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <h1 className={styles.appName}>FocusAI</h1>
          <p className={styles.tagline}>Your focused task manager</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={`${styles.field} ${emailErr ? styles.hasErr : ''}`}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={validateEmail} placeholder="you@example.com" autoComplete="email" />
            {emailErr && <span className={styles.err}>{emailErr}</span>}
          </div>

          <div className={`${styles.field} ${passErr ? styles.hasErr : ''}`}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} onBlur={validatePassword} placeholder="Min. 8 characters" autoComplete="current-password" />
            {passErr && <span className={styles.err}>{passErr}</span>}
          </div>

          {serverErr && <p className={styles.serverErr}>{serverErr}</p>}

          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className={styles.divider}>or continue with</div>
        <button className={styles.oauthBtn}><IconBrandGoogle size={16} aria-hidden /> Continue with Google</button>
        <button className={styles.oauthBtn}><IconBrandGithub size={16} aria-hidden /> Continue with GitHub</button>
        <p className={styles.switchLink}>Don't have an account? <Link to="/register">Sign up</Link></p>
      </div>
    </div>
  )
}
