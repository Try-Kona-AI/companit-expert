import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * LIVE when both env vars are present (Vercel / .env.local), otherwise the app
 * falls back to the local demo store so it stays clickable with no backend.
 * Same pattern as the other Kona AI client apps.
 */
export const LIVE = Boolean(url && key)

export const supabase: SupabaseClient | null = LIVE
  ? createClient(url as string, key as string)
  : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const supabaseUrl = url ?? ''

/**
 * Call an Edge Function with the signed-in user's session JWT. Direct fetch
 * because functions.invoke does not accept sb_publishable_ keys.
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: { session } } = await db().auth.getSession()
  const jwt = session?.access_token
  if (!jwt) throw new Error('Not authenticated')
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  })
  let parsed: unknown
  try { parsed = await res.json() } catch { throw new Error(`HTTP ${res.status}`) }
  return parsed as T
}
