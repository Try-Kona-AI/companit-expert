import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import { getTenant } from '../lib/api'
import { LangSwitch } from './ui'

const nav: { to: string; key: TKey; end?: boolean }[] = [
  { to: '/',          key: 'nav.dashboard', end: true },
  { to: '/invoices',  key: 'nav.invoices' },
  { to: '/customers', key: 'nav.customers' },
  { to: '/winback',   key: 'nav.winback' },
  { to: '/jobs',      key: 'nav.jobs' },
]

const bottomNav: { to: string; key: TKey }[] = [
  { to: '/guide',    key: 'nav.guide' },
  { to: '/settings', key: 'nav.settings' },
]

function Mark({ size = 32, id = 'ce' }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none">
      <rect x="1" y="1" width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path d="M10.5 10.5h10M10.5 17h12.5M10.5 23.5h7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="23.5" r="2" fill="#f5b91e" />
      <defs>
        <linearGradient id={id} x1="1" y1="1" x2="33" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0a86e6" />
          <stop offset="1" stopColor="#005aa6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function Layout() {
  const { email, signOut, tenantId, live } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [businessName, setBusinessName] = useState(t('brand.name'))
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!tenantId) return
    void getTenant(tenantId).then(tn => { if (tn?.name) setBusinessName(tn.name) })
  }, [tenantId])

  const linkClass = (isActive: boolean, dim = false) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-white/15 text-white' : `${dim ? 'text-slate-400' : 'text-slate-300'} hover:bg-white/5 hover:text-white`
    }`

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Mark />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">{businessName}</div>
          <div className="text-[11px] text-slate-400">{t('brand.tagline')}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkClass(isActive)}>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 px-3 pt-3 pb-4">
        {bottomNav.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => linkClass(isActive, true)}>
            {t(n.key)}
          </NavLink>
        ))}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 px-1 pt-3">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">{t('lang.label')}</span>
          <LangSwitch />
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="mb-1 truncate px-3 text-[11px] text-slate-500">
            {email}{!live && ' · demo'}
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-[#0c2340] px-4 md:hidden">
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={t('nav.openMenu')}
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z" clipRule="evenodd"/>
            </svg>
          )}
        </button>
        <Mark size={24} id="ce-mobile" />
        <span className="truncate text-sm font-semibold text-white">{businessName}</span>
        <div className="ml-auto"><LangSwitch /></div>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-[#0c2340]
          transition-transform duration-200 ease-in-out md:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebar}
      </aside>

      <main className="md:ml-60">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
