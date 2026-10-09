import { LIVE, callFunction, db } from './supabase'
import * as demo from './demoStore'
import type {
  Campaign, CampaignStep, Customer, Enrollment, EnrollmentStatus, Invoice, Job, Lead, Lang,
  SettingsDraft, Tenant,
} from './types'

export { LIVE }

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
/** Calendar day in New York, matching the send-campaign function's clock. */
export const nyDay = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

// ---------------------------------------------------------------- tenant ----
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  if (!LIVE) return demo.snapshot().tenant
  const { data } = await db().from('tenants').select('*').eq('id', tenantId).maybeSingle()
  return (data as Tenant) ?? null
}

export async function saveTenant(
  tenantId: string,
  patch: { name?: string; owner_name?: string; default_language?: Lang },
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.tenant = { ...s.tenant, ...patch } })
    return
  }
  const { error } = await db().from('tenants').update(patch).eq('id', tenantId)
  if (error) throw new Error(error.message)
}

// -------------------------------------------------------------- customers ---
export async function listCustomers(tenantId: string): Promise<Customer[]> {
  if (!LIVE) {
    return [...demo.snapshot().customers].sort((a, b) =>
      (b.last_service_date ?? '').localeCompare(a.last_service_date ?? ''))
  }
  const { data, error } = await db()
    .from('customers').select('*').eq('tenant_id', tenantId)
    .order('last_service_date', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return data as Customer[]
}

export type CustomerInput = Pick<Customer,
  'name' | 'contact_name' | 'phone' | 'email' | 'address' | 'status' | 'language' | 'last_service_date' | 'notes'>

export async function saveCustomer(
  tenantId: string, input: CustomerInput, id?: string,
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      if (id) {
        s.customers = s.customers.map(c => (c.id === id ? { ...c, ...input } : c))
      } else {
        s.customers.unshift({
          ...input, id: demo.uid(), tenant_id: tenantId,
          created_at: new Date().toISOString(),
        })
      }
    })
    return
  }
  const payload = { ...input, tenant_id: tenantId }
  const { error } = id
    ? await db().from('customers').update(payload).eq('id', id)
    : await db().from('customers').insert(payload)
  if (error) throw new Error(error.message)
}

export async function deleteCustomer(id: string): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      s.customers = s.customers.filter(c => c.id !== id)
      s.invoices  = s.invoices.filter(i => i.customer_id !== id)
      s.jobs      = s.jobs.filter(j => j.customer_id !== id)
    })
    return
  }
  const { error } = await db().from('customers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Ages customers by time since last service: 90+ days needs a check-in,
 * 180+ days is a win-back candidate. Runs on both backends.
 */
export async function refreshCustomerStages(tenantId: string): Promise<void> {
  const cut = (d: number) =>
    new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

  if (!LIVE) {
    demo.mutate(s => {
      s.customers = s.customers.map(c => {
        if (!c.last_service_date) return c
        if (c.status === 'due_for_service' && c.last_service_date < cut(180)) return { ...c, status: 'win_back' }
        if (c.status === 'active' && c.last_service_date < cut(90)) return { ...c, status: 'due_for_service' }
        return c
      })
    })
    return
  }
  await Promise.all([
    db().from('customers').update({ status: 'win_back' })
      .eq('tenant_id', tenantId).eq('status', 'due_for_service').lt('last_service_date', cut(180)),
    db().from('customers').update({ status: 'due_for_service' })
      .eq('tenant_id', tenantId).eq('status', 'active').lt('last_service_date', cut(90)),
  ])
}

// --------------------------------------------------------------- invoices ---
const CUSTOMER_JOIN = '*, customer:customers(id,name,phone,email,language)'

function hydrate(invoices: Invoice[], customers: Customer[]): Invoice[] {
  return invoices.map(i => {
    const c = customers.find(x => x.id === i.customer_id)
    return {
      ...i,
      customer: c
        ? { id: c.id, name: c.name, phone: c.phone, email: c.email, language: c.language }
        : undefined,
    }
  })
}

export async function listInvoices(tenantId: string): Promise<Invoice[]> {
  if (!LIVE) {
    const s = demo.snapshot()
    return hydrate([...s.invoices].sort((a, b) => b.sent_date.localeCompare(a.sent_date)), s.customers)
  }
  const { data, error } = await db()
    .from('invoices').select(CUSTOMER_JOIN).eq('tenant_id', tenantId)
    .order('sent_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Invoice[]
}

export async function nextInvoiceNumber(tenantId: string): Promise<string> {
  if (!LIVE) {
    const nums = demo.snapshot().invoices
      .map(i => parseInt(i.number.replace('INV-', ''), 10))
      .filter(n => !isNaN(n))
    return `INV-${(nums.length ? Math.max(...nums) : 1099) + 1}`
  }
  const { data } = await db()
    .from('invoices').select('number').eq('tenant_id', tenantId)
    .order('created_at', { ascending: false }).limit(1)
  if (!data?.length) return 'INV-1100'
  const n = parseInt((data[0].number as string).replace('INV-', ''), 10)
  return isNaN(n) ? 'INV-1100' : `INV-${n + 1}`
}

export type InvoiceInput = Pick<Invoice, 'customer_id' | 'description' | 'amount' | 'due_date' | 'status'>

export async function saveInvoice(
  tenantId: string, input: InvoiceInput, id?: string,
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      if (id) {
        s.invoices = s.invoices.map(i => (i.id === id ? { ...i, ...input } : i))
      } else {
        const nums = s.invoices.map(i => parseInt(i.number.replace('INV-', ''), 10)).filter(n => !isNaN(n))
        s.invoices.unshift({
          ...input, id: demo.uid(), tenant_id: tenantId, job_id: null,
          number: `INV-${(nums.length ? Math.max(...nums) : 1099) + 1}`,
          sent_date: today(), paid_date: null, last_reminder_date: null,
          reminder_count: 0, auto_reminder: true, created_at: new Date().toISOString(),
        })
      }
    })
    return
  }
  const payload = { ...input, tenant_id: tenantId }
  if (id) {
    const { error } = await db().from('invoices').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const number = await nextInvoiceNumber(tenantId)
    const { error } = await db().from('invoices')
      .insert({ ...payload, number, sent_date: today() })
    if (error) throw new Error(error.message)
  }
}

export async function patchInvoice(id: string, patch: Partial<Invoice>): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.invoices = s.invoices.map(i => (i.id === id ? { ...i, ...patch } : i)) })
    return
  }
  const { error } = await db().from('invoices').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markInvoicePaid(inv: Invoice): Promise<void> {
  await Promise.all([
    patchInvoice(inv.id, { status: 'paid', paid_date: today() }),
    (async () => {
      if (!LIVE) {
        demo.mutate(s => {
          s.customers = s.customers.map(c =>
            c.id === inv.customer_id ? { ...c, status: 'active', last_service_date: today() } : c)
        })
        return
      }
      await db().from('customers')
        .update({ status: 'active', last_service_date: today() })
        .eq('id', inv.customer_id)
    })(),
  ])
}

export async function bumpReminder(inv: Invoice): Promise<void> {
  await patchInvoice(inv.id, {
    reminder_count: (inv.reminder_count ?? 0) + 1,
    last_reminder_date: today(),
  })
}

export async function deleteInvoice(id: string): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.invoices = s.invoices.filter(i => i.id !== id) })
    return
  }
  const { error } = await db().from('invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ------------------------------------------------------------------- jobs ---
export async function listJobs(tenantId: string): Promise<Job[]> {
  if (!LIVE) {
    const s = demo.snapshot()
    return [...s.jobs]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(j => {
        const c = s.customers.find(x => x.id === j.customer_id)
        return { ...j, customer: c ? { id: c.id, name: c.name } : undefined }
      })
  }
  const { data, error } = await db()
    .from('jobs').select('*, customer:customers(id,name)').eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Job[]
}

export type JobInput = Pick<Job, 'customer_id' | 'title' | 'description' | 'status' | 'amount' | 'scheduled_date'>

export async function saveJob(
  tenantId: string, input: JobInput, id?: string,
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      if (id) s.jobs = s.jobs.map(j => (j.id === id ? { ...j, ...input } : j))
      else s.jobs.unshift({ ...input, id: demo.uid(), tenant_id: tenantId, created_at: new Date().toISOString() })
    })
    return
  }
  const payload = { ...input, tenant_id: tenantId }
  const { error } = id
    ? await db().from('jobs').update(payload).eq('id', id)
    : await db().from('jobs').insert(payload)
  if (error) throw new Error(error.message)
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.jobs = s.jobs.map(j => (j.id === id ? { ...j, ...patch } : j)) })
    return
  }
  const { error } = await db().from('jobs').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteJob(id: string): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.jobs = s.jobs.filter(j => j.id !== id) })
    return
  }
  const { error } = await db().from('jobs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Completes a job and drafts the invoice for it in one step. */
export async function completeJobToInvoice(tenantId: string, job: Job): Promise<void> {
  const number = await nextInvoiceNumber(tenantId)
  const description = job.description ? `${job.title} — ${job.description}` : job.title

  if (!LIVE) {
    demo.mutate(s => {
      s.jobs = s.jobs.map(j => (j.id === job.id ? { ...j, status: 'done' } : j))
      s.invoices.unshift({
        id: demo.uid(), tenant_id: tenantId, customer_id: job.customer_id, job_id: job.id,
        number, description, amount: Number(job.amount), status: 'draft',
        sent_date: today(), due_date: plusDays(14), paid_date: null,
        last_reminder_date: null, reminder_count: 0, auto_reminder: true,
        created_at: new Date().toISOString(),
      })
    })
    return
  }

  const { error: jobErr } = await db().from('jobs').update({ status: 'done' }).eq('id', job.id)
  if (jobErr) throw new Error(jobErr.message)

  const { data, error } = await db().from('invoices').insert({
    tenant_id: tenantId, customer_id: job.customer_id, job_id: job.id, number,
    description, amount: Number(job.amount), status: 'draft',
    due_date: plusDays(14), sent_date: today(),
  }).select()
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Invoice insert returned no rows')
}

// ------------------------------------------------------------------ leads ---
export async function listLeads(tenantId: string): Promise<Lead[]> {
  if (!LIVE) {
    return [...demo.snapshot().leads].sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  const { data, error } = await db()
    .from('leads').select('*').eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Lead[]
}

export type LeadInput = Pick<Lead,
  'name' | 'phone' | 'email' | 'address' | 'service' | 'source' | 'status' | 'est_value' | 'notes'>
  & Partial<Pick<Lead, 'company' | 'title' | 'building' | 'external_ref'>>

export async function saveLead(
  tenantId: string, input: LeadInput, id?: string,
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      if (id) s.leads = s.leads.map(l => (l.id === id ? { ...l, ...input } : l))
      else s.leads.unshift({
        ...input, id: demo.uid(), tenant_id: tenantId,
        created_at: new Date().toISOString(),
      })
    })
    return
  }
  const payload = { ...input, tenant_id: tenantId }
  const { error } = id
    ? await db().from('leads').update(payload).eq('id', id)
    : await db().from('leads').insert(payload)
  if (error) throw new Error(error.message)
}

export async function patchLead(id: string, patch: Partial<Lead>): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.leads = s.leads.map(l => (l.id === id ? { ...l, ...patch } : l)) })
    return
  }
  const { error } = await db().from('leads').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteLead(id: string): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.leads = s.leads.filter(l => l.id !== id) })
    return
  }
  const { error } = await db().from('leads').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// --------------------------------------------------------------- settings ---
const EMPTY_SETTINGS: SettingsDraft = {
  zelle_contact: '', bank_name: '', bank_routing: '', bank_account: '',
  mailing_name: '', mailing_address: '', contact_phone: '', other_instructions: '',
}

export async function getSettings(tenantId: string): Promise<SettingsDraft> {
  if (!LIVE) return { ...EMPTY_SETTINGS, ...demo.snapshot().settings }
  const { data, error } = await db()
    .from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { ...EMPTY_SETTINGS }
  return {
    zelle_contact: data.zelle_contact ?? '',
    bank_name: data.bank_name ?? '',
    bank_routing: data.bank_routing ?? '',
    bank_account: data.bank_account ?? '',
    mailing_name: data.mailing_name ?? '',
    mailing_address: data.mailing_address ?? '',
    contact_phone: data.contact_phone ?? '',
    other_instructions: data.other_instructions ?? '',
  }
}

export async function saveSettings(tenantId: string, draft: SettingsDraft): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.settings = { ...draft } })
    return
  }
  const payload = {
    tenant_id: tenantId,
    zelle_contact: draft.zelle_contact || null,
    bank_name: draft.bank_name || null,
    bank_routing: draft.bank_routing || null,
    bank_account: draft.bank_account || null,
    mailing_name: draft.mailing_name || null,
    mailing_address: draft.mailing_address || null,
    contact_phone: draft.contact_phone || null,
    other_instructions: draft.other_instructions || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db()
    .from('tenant_settings').upsert(payload, { onConflict: 'tenant_id' })
  if (error) throw new Error(error.message)
}

// --------------------------------------------------------------- outreach ---
/**
 * Add a prospect from a list source (NYC records, Apollo). De-duplicated on
 * external_ref so the same firm or owner is never added twice.
 */
export async function addProspectLead(
  tenantId: string, input: LeadInput,
): Promise<'added' | 'duplicate'> {
  if (!LIVE) {
    let result: 'added' | 'duplicate' = 'added'
    demo.mutate(s => {
      if (input.external_ref && s.leads.some(l => l.external_ref === input.external_ref)) {
        result = 'duplicate'; return
      }
      s.leads.unshift({
        company: null, title: null, building: null, external_ref: null,
        ...input, id: demo.uid(), tenant_id: tenantId, created_at: new Date().toISOString(),
      })
    })
    return result
  }
  const { error } = await db().from('leads').insert({ ...input, tenant_id: tenantId })
  if (error?.code === '23505') return 'duplicate'
  if (error) throw new Error(error.message)
  return 'added'
}

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
  if (!LIVE) return [...demo.snapshot().campaigns].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await db()
    .from('campaigns').select('*').eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Campaign[]
}

export async function listSteps(campaignId: string): Promise<CampaignStep[]> {
  if (!LIVE) {
    return demo.snapshot().campaignSteps
      .filter(s => s.campaign_id === campaignId).sort((a, b) => a.step_no - b.step_no)
  }
  const { data, error } = await db()
    .from('campaign_steps').select('*').eq('campaign_id', campaignId).order('step_no')
  if (error) throw new Error(error.message)
  return data as CampaignStep[]
}

export type CampaignInput = Pick<Campaign, 'name' | 'audience' | 'language' | 'daily_cap'>
export type StepInput = Pick<CampaignStep, 'delay_days' | 'subject' | 'body'>

export async function createCampaign(
  tenantId: string, input: CampaignInput, steps: StepInput[],
): Promise<string> {
  if (!LIVE) {
    const id = demo.uid()
    demo.mutate(s => {
      s.campaigns.unshift({ ...input, id, tenant_id: tenantId, status: 'draft', created_at: new Date().toISOString() })
    })
    await saveSteps(tenantId, id, steps)
    return id
  }
  const { data, error } = await db()
    .from('campaigns').insert({ ...input, tenant_id: tenantId }).select('id').single()
  if (error) throw new Error(error.message)
  await saveSteps(tenantId, data.id as string, steps)
  return data.id as string
}

export async function patchCampaign(
  id: string, patch: Partial<Pick<Campaign, 'name' | 'status' | 'daily_cap' | 'language' | 'audience'>>,
): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.campaigns = s.campaigns.map(c => (c.id === id ? { ...c, ...patch } : c)) })
    return
  }
  const { error } = await db().from('campaigns').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Replace a campaign's sequence. Step numbers follow array order. */
export async function saveSteps(tenantId: string, campaignId: string, steps: StepInput[]): Promise<void> {
  const rows = steps.map((st, i) => ({
    tenant_id: tenantId, campaign_id: campaignId, step_no: i + 1,
    delay_days: Math.max(0, Math.round(Number(st.delay_days) || 0)),
    subject: st.subject, body: st.body,
  }))
  if (!LIVE) {
    demo.mutate(s => {
      s.campaignSteps = s.campaignSteps.filter(x => x.campaign_id !== campaignId)
        .concat(rows.map(r => ({ ...r, id: demo.uid() })))
    })
    return
  }
  const { error: delErr } = await db().from('campaign_steps').delete().eq('campaign_id', campaignId)
  if (delErr) throw new Error(delErr.message)
  if (rows.length) {
    const { error } = await db().from('campaign_steps').insert(rows)
    if (error) throw new Error(error.message)
  }
}

export async function deleteCampaign(id: string): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => {
      s.campaigns = s.campaigns.filter(c => c.id !== id)
      s.campaignSteps = s.campaignSteps.filter(x => x.campaign_id !== id)
      s.enrollments = s.enrollments.filter(e => e.campaign_id !== id)
    })
    return
  }
  const { error } = await db().from('campaigns').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listEnrollments(tenantId: string, campaignId?: string): Promise<Enrollment[]> {
  if (!LIVE) {
    const s = demo.snapshot()
    return s.enrollments
      .filter(e => !campaignId || e.campaign_id === campaignId)
      .map(e => ({ ...e, lead: s.leads.find(l => l.id === e.lead_id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  let q = db().from('campaign_enrollments').select('*, lead:leads(*)').eq('tenant_id', tenantId)
  if (campaignId) q = q.eq('campaign_id', campaignId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Enrollment[]
}

/**
 * Enroll leads into a campaign. Skips leads with no email, unsubscribed
 * leads, suppressed addresses, and anyone already enrolled.
 */
export async function enrollLeads(
  tenantId: string, campaignId: string, leads: Lead[],
): Promise<number> {
  const steps = await listSteps(campaignId)
  const first = steps[0]
  if (!first) throw new Error('Add at least one email step first')
  const startOn = nyDay(first.delay_days)
  const eligible = leads.filter(l => l.email && !l.unsubscribed_at)

  if (!LIVE) {
    let n = 0
    demo.mutate(s => {
      for (const l of eligible) {
        if (s.suppressions.includes(l.email!.toLowerCase())) continue
        if (s.enrollments.some(e => e.campaign_id === campaignId && e.lead_id === l.id)) continue
        s.enrollments.push({
          id: demo.uid(), tenant_id: tenantId, campaign_id: campaignId, lead_id: l.id,
          next_step: 1, next_send_on: startOn, status: 'active', last_sent_at: null,
          created_at: new Date().toISOString(),
        })
        n++
      }
    })
    return n
  }
  const { data: sup } = await db().from('email_suppressions').select('email').eq('tenant_id', tenantId)
  const blocked = new Set((sup ?? []).map(r => String(r.email).toLowerCase()))
  const rows = eligible
    .filter(l => !blocked.has(l.email!.toLowerCase()))
    .map(l => ({ tenant_id: tenantId, campaign_id: campaignId, lead_id: l.id, next_send_on: startOn }))
  if (!rows.length) return 0
  const { data, error } = await db()
    .from('campaign_enrollments')
    .upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function setEnrollmentStatus(id: string, status: EnrollmentStatus): Promise<void> {
  if (!LIVE) {
    demo.mutate(s => { s.enrollments = s.enrollments.map(e => (e.id === id ? { ...e, status } : e)) })
    return
  }
  const { error } = await db().from('campaign_enrollments').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Messages already sent today (local day), for the daily cap. */
export async function sentTodayCount(tenantId: string): Promise<number> {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  if (!LIVE) return demo.snapshot().outreach.filter(m => m.sent_at >= midnight.toISOString()).length
  const { count, error } = await db()
    .from('outreach_messages').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).gte('sent_at', midnight.toISOString())
  if (error) throw new Error(error.message)
  return count ?? 0
}

export interface SendResult { sent: number; skipped: number; testMode: boolean; errors: string[] }

/**
 * Send the approved emails. Live: the send-campaign edge function renders,
 * sends, logs and advances each enrollment server-side. Demo: simulated, so
 * the whole flow is clickable with no email provider.
 */
export async function sendOutreach(tenantId: string, enrollmentIds: string[]): Promise<SendResult> {
  if (!LIVE) {
    let sent = 0
    demo.mutate(s => {
      for (const id of enrollmentIds) {
        const e = s.enrollments.find(x => x.id === id)
        const lead = e && s.leads.find(l => l.id === e.lead_id)
        const step = e && s.campaignSteps.find(x => x.campaign_id === e.campaign_id && x.step_no === e.next_step)
        if (!e || !lead?.email || !step || e.status !== 'active') continue
        s.outreach.push({
          id: demo.uid(), tenant_id: tenantId, campaign_id: e.campaign_id, enrollment_id: e.id, lead_id: lead.id,
          step_no: step.step_no, to_email: lead.email, subject: step.subject,
          test_mode: false, sent_at: new Date().toISOString(),
        })
        const next = s.campaignSteps.find(x => x.campaign_id === e.campaign_id && x.step_no === e.next_step + 1)
        e.last_sent_at = new Date().toISOString()
        if (next) { e.next_step = next.step_no; e.next_send_on = nyDay(next.delay_days) }
        else e.status = 'completed'
        if (lead.status === 'new') lead.status = 'contacted'
        sent++
      }
    })
    return { sent, skipped: enrollmentIds.length - sent, testMode: false, errors: [] }
  }
  const d = await callFunction<SendResult & { error?: string }>('send-campaign', { tenantId, enrollmentIds })
  if (d?.error) throw new Error(d.error)
  return d
}

