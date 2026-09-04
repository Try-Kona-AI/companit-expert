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
