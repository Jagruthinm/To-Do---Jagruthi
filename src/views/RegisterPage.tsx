import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { IconChecks, IconBrandGoogle, IconBrandGithub } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import styles from './AuthPage.module.css'

export function RegisterPage() {
  const { register, loading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverErr, setServerErr] = useState('')

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Please enter a valid email'
    if (password.length < 8) e.password = 'Password must be at least 8 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateField(field: 'email' | 'password') {
    setErrors(prev => {
      const e = { ...prev }
      if (field === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Please enter a valid email'
        else delete e.email
      } else {
        if (password.length < 8) e.password = 'Password must be at least 8 characters'
        else delete e.password
      }
      return e
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await register(name, email, password)
      navigate('/today')
    } catch (err: unknown) {
      setServerErr(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <h1 className={styles.appName}>FocusAI</h1>
          <p className={styles.tagline}>Create your account</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={`${styles.field} ${errors.name ? styles.hasErr : ''}`}>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            {errors.name && <span className={styles.err}>{errors.name}</span>}
          </div>

          <div className={`${styles.field} ${errors.email ? styles.hasErr : ''}`}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => validateField('email')} placeholder="you@example.com" autoComplete="email" />
            {errors.email && <span className={styles.err}>{errors.email}</span>}
          </div>

          <div className={`${styles.field} ${errors.password ? styles.hasErr : ''}`}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} onBlur={() => validateField('password')} placeholder="Min. 8 characters" autoComplete="new-password" />
            {errors.password && <span className={styles.err}>{errors.password}</span>}
          </div>

          {serverErr && <p className={styles.serverErr}>{serverErr}</p>}

          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className={styles.divider}>or continue with</div>
        <button className={styles.oauthBtn}><IconBrandGoogle size={16} aria-hidden /> Continue with Google</button>
        <button className={styles.oauthBtn}><IconBrandGithub size={16} aria-hidden /> Continue with GitHub</button>
        <p className={styles.switchLink}>Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}
