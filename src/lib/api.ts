import { LIVE, db } from './supabase'
import * as demo from './demoStore'
import type {
  Customer, Invoice, Job, Lang, SettingsDraft, Tenant,
} from './types'

export { LIVE }

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

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
