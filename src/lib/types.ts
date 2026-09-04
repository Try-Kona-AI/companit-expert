export type Lang = 'en' | 'ru'
export type CustomerStatus = 'active' | 'due_for_service' | 'win_back'
export type InvoiceStatus = 'draft' | 'sent' | 'overdue' | 'paid'
export type JobStatus = 'quote' | 'scheduled' | 'in_progress' | 'done'

export interface Tenant {
  id: string
  name: string
  owner_name: string | null
  default_language: Lang
  created_at: string
}

export interface Customer {
  id: string
  tenant_id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: CustomerStatus
  /** Language this customer receives emails in */
  language: Lang
  last_service_date: string | null
  notes: string | null
  created_at: string
}

export interface Invoice {
  id: string
  tenant_id: string
  customer_id: string
  job_id: string | null
  number: string
  description: string | null
  amount: number
  status: InvoiceStatus
  sent_date: string
  due_date: string | null
  paid_date: string | null
  last_reminder_date: string | null
  reminder_count: number
  auto_reminder: boolean
  created_at: string
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'email' | 'language'>
}

export interface Job {
  id: string
  tenant_id: string
  customer_id: string
  title: string
  description: string | null
  status: JobStatus
  amount: number
  scheduled_date: string | null
  created_at: string
  customer?: Pick<Customer, 'id' | 'name'>
}

export interface TenantSettings {
  id: string
  tenant_id: string
  zelle_contact: string | null
  bank_name: string | null
  bank_routing: string | null
  bank_account: string | null
  mailing_name: string | null
  mailing_address: string | null
  contact_phone: string | null
  other_instructions: string | null
  updated_at: string
}

export type SettingsDraft = Omit<TenantSettings, 'id' | 'tenant_id' | 'updated_at'>
