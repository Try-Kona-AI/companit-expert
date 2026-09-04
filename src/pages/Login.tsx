import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { authErrorKey, useI18n } from '../lib/i18n'
import { LangSwitch } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const { signIn, signUp, live } = useAuth()
  const { t } = useI18n()
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    if (mode === 'signin') {
      const err = await signIn(email, password)
      if (err) setError(t(authErrorKey(err)))
      else nav('/')
    } else {
      const err = await signUp(email, password)
      if (err) setError(t(authErrorKey(err)))
      else if (live) setNotice('Check your email to confirm the account, then sign in.')
      else nav('/')
    }
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: '1px solid #dfe2e9',
    padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 500, color: '#3a424f', marginBottom: 5,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c2340' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <LangSwitch />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <svg width="36" height="36" viewBox="0 0 34 34" fill="none">
            <rect x="1" y="1" width="32" height="32" rx="9" fill="url(#lg)" />
            <path d="M10.5 10.5h10M10.5 17h12.5M10.5 23.5h7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="24" cy="23.5" r="2" fill="#f5b91e" />
            <defs>
              <linearGradient id="lg" x1="1" y1="1" x2="33" y2="33" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0a86e6" />
                <stop offset="1" stopColor="#005aa6" />
              </linearGradient>
            </defs>
          </svg>
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {t('brand.name')} <span style={{ color: '#f5b91e' }}>·</span>
          </span>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0c1118', marginBottom: 6, letterSpacing: '-0.02em' }}>
            {mode === 'signin' ? t('login.signIn') : t('login.createAccount')}
          </h1>
          <p style={{ fontSize: 14, color: '#697384', marginBottom: 24 }}>
            {mode === 'signin' ? t('login.welcomeBack') : t('login.getStarted')}
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>{t('login.email')}</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t('login.password')}</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
            </div>

            {error && (
              <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>{error}</div>
            )}
            {notice && (
              <div style={{ fontSize: 13, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}>{notice}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 11, borderRadius: 10, background: '#0072ce', color: '#fff',
              fontSize: 15, fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, marginTop: 4,
            }}>
              {loading ? '…' : mode === 'signin' ? t('login.signIn') : t('login.createAccount')}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#697384' }}>
            {mode === 'signin' ? t('login.noAccount') : t('login.haveAccount')}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}
              style={{ background: 'none', border: 'none', color: '#0072ce', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              {mode === 'signin' ? t('login.signUp') : t('login.signIn')}
            </button>
          </div>

          {!live && (
            <p style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              {t('login.demoNote')}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
          {t('brand.tagline')}
        </div>
      </div>
    </div>
  )
}
