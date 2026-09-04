import { LIVE, db, supabaseUrl } from './supabase'
import type { Lang } from './types'

export type EmailType = 'invoice_new' | 'invoice_reminder' | 'invoice_receipt' | 'quote' | 'win_back'

export interface SendEmailParams {
  type: EmailType
  tenantId: string
  invoiceId?: string
  customerId?: string
  jobId?: string
  /** Language for the outgoing email. Defaults to the customer's own setting. */
  lang?: Lang
  /** Overrides the stored address. Used by the Settings test send. */
  recipientEmail?: string
}

export interface SendResult {
  ok: boolean
  error?: string
  to?: string
  simulated?: boolean
}

/**
 * Calls the send-email Edge Function (Resend). Uses a direct fetch with the
 * session JWT because functions.invoke does not accept sb_publishable_ keys.
 * Without a backend the send is simulated so the flow stays demoable.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  if (!LIVE) {
    await new Promise(r => setTimeout(r, 500))
    return { ok: true, simulated: true }
  }

  const { data: { session } } = await db().auth.getSession()
  const jwt = session?.access_token
  if (!jwt) return { ok: false, error: 'Not authenticated' }

  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(params),
  })

  let body: SendResult
  try { body = await res.json() as SendResult } catch { return { ok: false, error: `HTTP ${res.status}` } }
  if (!body.ok) return { ok: false, error: body.error ?? 'Unknown error' }
  return { ok: true, to: body.to }
}
