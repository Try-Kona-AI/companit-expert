import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { LIVE, db } from './supabase'

const DEMO_SESSION_KEY = 'companit.demo.session'
const DEMO_TENANT_ID = 'demo-tenant'

interface AuthCtx {
  email: string | null
  user: User | null
  session: Session | null
  tenantId: string | null
  loading: boolean
  live: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

/** Owner's tenant, or the workspace they were invited into. */
async function fetchTenantId(userId: string): Promise<string | null> {
  const owned = await db()
    .from('tenants').select('id').eq('owner_user_id', userId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (owned.data?.id) return owned.data.id as string

  const member = await db()
    .from('tenant_members').select('tenant_id').eq('user_id', userId).limit(1).maybeSingle()
  if (member.data?.tenant_id) return member.data.tenant_id as string

  // First sign-in: provision (or join) the workspace.
  const { data, error } = await db().rpc('join_workspace')
  if (error) {
    console.error('join_workspace failed:', error.message)
    return null
  }
  return (data as string) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [session, setSession]   = useState<Session | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [email, setEmail]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!LIVE) {
      let saved: string | null = null
      try { saved = localStorage.getItem(DEMO_SESSION_KEY) } catch { /* ignore */ }
      if (saved) { setEmail(saved); setTenantId(DEMO_TENANT_ID) }
      setLoading(false)
      return
    }

    void db().auth.getSession().then(async ({ data }) => {
      const s = data.session
      setSession(s)
      setUser(s?.user ?? null)
      setEmail(s?.user?.email ?? null)
      if (s?.user) setTenantId(await fetchTenantId(s.user.id))
      setLoading(false)
    })

    const { data: { subscription } } = db().auth.onAuthStateChange(async (_ev, s) => {
      setSession(s)
      const u = s?.user ?? null
      setUser(u)
      setEmail(u?.email ?? null)
      setTenantId(u ? await fetchTenantId(u.id) : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(mail: string, password: string): Promise<string | null> {
    if (!LIVE) {
      try { localStorage.setItem(DEMO_SESSION_KEY, mail) } catch { /* ignore */ }
      setEmail(mail)
      setTenantId(DEMO_TENANT_ID)
      return null
    }
    const { error } = await db().auth.signInWithPassword({ email: mail, password })
    return error?.message ?? null
  }

  async function signUp(mail: string, password: string): Promise<string | null> {
    if (!LIVE) return signIn(mail, password)
    const { error } = await db().auth.signUp({ email: mail, password })
    return error?.message ?? null
  }

  async function signOut() {
    if (!LIVE) {
      try { localStorage.removeItem(DEMO_SESSION_KEY) } catch { /* ignore */ }
      setEmail(null)
      setTenantId(null)
      return
    }
    await db().auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ email, user, session, tenantId, loading, live: LIVE, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
