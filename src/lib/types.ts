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

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
export type LeadSource =
  | 'google_lsa' | 'google_search' | 'facebook' | 'nextdoor'
  | 'referral' | 'pm_outreach' | 'nyc_records' | 'website' | 'other'

export const LEAD_STAGES: LeadStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost']
export const LEAD_SOURCES: LeadSource[] = [
  'google_lsa', 'google_search', 'facebook', 'nextdoor',
  'referral', 'pm_outreach', 'nyc_records', 'website', 'other',
]

export interface Lead {
  id: string
  tenant_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  /** What the customer needs, in their words */
  service: string | null
  source: LeadSource
  status: LeadStatus
  est_value: number
  notes: string | null
  company?: string | null
  title?: string | null
  /** One real building they manage or own, for personalization */
  building?: string | null
  /** De-dup key from the prospect source (hpd:..., apollo:...) */
  external_ref?: string | null
  unsubscribed_at?: string | null
  created_at: string
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

// ------------------------------------------------------------- outreach -----
export type CampaignAudience = 'pm' | 'landlord' | 'any'
export type CampaignStatus = 'draft' | 'active' | 'paused'
export type EnrollmentStatus =
  | 'active' | 'replied' | 'unsubscribed' | 'completed' | 'bounced' | 'stopped'

export interface Campaign {
  id: string
  tenant_id: string
  name: string
  audience: CampaignAudience
  language: Lang
  status: CampaignStatus
  daily_cap: number
  created_at: string
}

export interface CampaignStep {
  id: string
  tenant_id: string
  campaign_id: string
  step_no: number
  /** Days after the previous step (step 1: after enrollment) */
  delay_days: number
  subject: string
  body: string
}

export interface Enrollment {
  id: string
  tenant_id: string
  campaign_id: string
  lead_id: string
  next_step: number
  next_send_on: string
  status: EnrollmentStatus
  last_sent_at: string | null
  created_at: string
  lead?: Lead
}

export interface OutreachMessage {
  id: string
  tenant_id: string
  campaign_id: string | null
  enrollment_id: string | null
  lead_id: string | null
  step_no: number
  to_email: string
  subject: string
  test_mode: boolean
  sent_at: string
}
