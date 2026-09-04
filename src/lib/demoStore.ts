import type { Customer, Invoice, Job, SettingsDraft, Tenant } from './types'

/**
 * Local fallback store. Used only when Supabase env vars are absent so the app
 * is clickable before the Kona AI Supabase project is wired up. Everything
 * written here persists in localStorage under one key, so a refresh keeps it.
 */
const KEY = 'companit.demo.v1'

interface Snapshot {
  tenant: Tenant
  settings: SettingsDraft
  customers: Customer[]
  invoices: Invoice[]
  jobs: Job[]
  email: string | null
}

const day = 86400000
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10)
const stamp = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString()

export function uid(): string {
  return crypto.randomUUID()
}

function seed(): Snapshot {
  const tenantId = 'demo-tenant'
  const c = (
    id: string,
    name: string,
    contact: string,
    phone: string,
    email: string,
    address: string,
    status: Customer['status'],
    language: Customer['language'],
    lastService: number,
  ): Customer => ({
    id, tenant_id: tenantId, name, contact_name: contact, phone, email, address,
    status, language, last_service_date: iso(lastService), notes: null,
    created_at: stamp(lastService - 30),
  })

  const customers: Customer[] = [
    c('c1', 'Marcado Property Group', 'Lisa Marcado', '212-555-0100', 'lisa@marcadoprop.com', '100 Church St, New York, NY 10007', 'active', 'en', -12),
    c('c2', 'Solntse Realty LLC', 'Игорь Ковалёв', '718-555-0142', 'igor@solntserealty.com', '2145 Ocean Ave, Brooklyn, NY 11229', 'active', 'ru', -6),
    c('c3', 'Bay Ridge Holdings', 'Дмитрий Соколов', '718-555-0177', 'd.sokolov@bayridgeh.com', '8402 4th Ave, Brooklyn, NY 11209', 'active', 'ru', -21),
    c('c4', 'Hudson Line Builders', 'Tom Reardon', '646-555-0198', 'tom@hudsonline.build', '55 Hudson Yards, New York, NY 10001', 'due_for_service', 'en', -104),
    c('c5', 'Kalinka Management', 'Ольга Петрова', '917-555-0163', 'olga@kalinkamgmt.com', '1810 Voorhies Ave, Brooklyn, NY 11235', 'due_for_service', 'ru', -128),
    c('c6', 'Greenpoint Lofts', 'Sara Whitfield', '347-555-0121', 'sara@gplofts.com', '67 West St, Brooklyn, NY 11222', 'win_back', 'en', -211),
    c('c7', 'Vostok Contracting', 'Андрей Мельник', '347-555-0190', 'andrey@vostokcontracting.com', '3021 Brighton 6th St, Brooklyn, NY 11235', 'win_back', 'ru', -264),
  ]

  const inv = (
    id: string, customer_id: string, number: string, description: string,
    amount: number, status: Invoice['status'], sent: number, due: number,
    paid: number | null, reminders = 0,
  ): Invoice => ({
    id, tenant_id: tenantId, customer_id, job_id: null, number, description, amount,
    status, sent_date: iso(sent), due_date: iso(due),
    paid_date: paid === null ? null : iso(paid),
    last_reminder_date: reminders > 0 ? iso(sent + 7) : null,
    reminder_count: reminders, auto_reminder: true, created_at: stamp(sent),
  })

  const invoices: Invoice[] = [
    inv('i1', 'c1', 'INV-1104', 'Lobby renovation, phase 2 finish work', 14800, 'overdue', -38, -24, null, 2),
    inv('i2', 'c3', 'INV-1105', 'Замена стояков, 3 линии', 9250, 'overdue', -31, -17, null, 1),
    inv('i3', 'c2', 'INV-1106', 'Ремонт кухни, квартира 4B', 6400, 'sent', -9, 5, null, 0),
    inv('i4', 'c1', 'INV-1107', 'Roof deck waterproofing', 5200, 'sent', -4, 10, null, 0),
    inv('i5', 'c4', 'INV-1108', 'Punch list walkthrough and repairs', 1850, 'draft', 0, 14, null, 0),
    inv('i6', 'c2', 'INV-1101', 'Отделка санузла, квартира 2A', 7300, 'paid', -47, -33, -30),
    inv('i7', 'c1', 'INV-1102', 'Hallway repaint, floors 2 through 6', 4100, 'paid', -40, -26, -22),
    inv('i8', 'c3', 'INV-1103', 'Аварийный ремонт после протечки', 2750, 'paid', -26, -12, -11),
    inv('i9', 'c5', 'INV-1099', 'Замена окон, 6 единиц', 11200, 'paid', -134, -120, -118),
  ]

  const job = (
    id: string, customer_id: string, title: string, description: string,
    status: Job['status'], amount: number, scheduled: number | null,
  ): Job => ({
    id, tenant_id: tenantId, customer_id, title, description, status, amount,
    scheduled_date: scheduled === null ? null : iso(scheduled),
    created_at: stamp(-14),
  })

  const jobs: Job[] = [
    job('j1', 'c2', 'Ремонт кухни, квартира 6C', 'Демонтаж, сантехника, плитка, установка шкафов', 'quote', 18400, null),
    job('j2', 'c4', 'Basement egress window install', 'Cut, frame, install, patch and paint', 'quote', 7600, null),
    job('j3', 'c1', 'Elevator vestibule tile', 'Remove existing tile, level, install porcelain', 'scheduled', 9800, 6),
    job('j4', 'c3', 'Замена бойлера', 'Демонтаж старого, установка нового, обвязка', 'in_progress', 12500, -2),
    job('j5', 'c1', 'Lobby renovation, phase 2', 'Finish carpentry, paint, fixtures', 'done', 14800, -38),
  ]

  return {
    tenant: {
      id: tenantId,
      name: 'Companit Expert',
      owner_name: 'Mark',
      default_language: 'en',
      created_at: stamp(-365),
    },
    settings: {
      zelle_contact: '718-555-0101',
      bank_name: 'Chase',
      bank_routing: '021000021',
      bank_account: '000123456789',
      mailing_name: 'Companit Expert LLC',
      mailing_address: '2301 Coney Island Ave\nBrooklyn, NY 11223',
      contact_phone: '718-555-0101',
      other_instructions: '',
    },
    customers,
    invoices,
    jobs,
    email: null,
  }
}

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Snapshot
  } catch {
    /* ignore */
  }
  const fresh = seed()
  write(fresh)
  return fresh
}

function write(s: Snapshot) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function mutate(fn: (s: Snapshot) => void): void {
  const s = read()
  fn(s)
  write(s)
}

export function snapshot(): Snapshot {
  return read()
}

export function resetDemo(): void {
  write(seed())
}
