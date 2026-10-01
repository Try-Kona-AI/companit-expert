import { useEffect, useState } from 'react'
import { getTenant, listCustomers, refreshCustomerStages, saveCustomer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { sendEmail } from '../lib/email'
import type { Customer } from '../lib/types'
import { shortDate, today } from '../lib/format'
import {
  Badge, Button, Card, EmptyState, ErrorNote, Loading, PageHeader,
} from '../components/ui'

type RowState = 'sending' | 'error' | 'copied'

export default function Winback() {
  const { tenantId } = useAuth()
  const { t, locale } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [owner, setOwner]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [state, setState]   = useState<Record<string, RowState>>({})

  useEffect(() => {
    if (!tenantId) return
    void (async () => {
      try {
        await refreshCustomerStages(tenantId)
        const [all, tenant] = await Promise.all([listCustomers(tenantId), getTenant(tenantId)])
        setOwner(tenant?.owner_name ?? tenant?.name ?? '')
        setCustomers(
          all
            .filter(c => c.status === 'win_back' || c.status === 'due_for_service')
            .sort((a, b) => (a.last_service_date ?? '').localeCompare(b.last_service_date ?? '')),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setLoading(false)
    })()
  }, [tenantId])

  /** Short, text-friendly message drafted in the interface language. */
  function draft(c: Customer): string {
    const first = (c.contact_name ?? c.name).split(' ')[0]
    return t(c.status === 'win_back' ? 'win.textWinBack' : 'win.textDue', { first, owner })
  }

  function smsHref(c: Customer): string {
    const digits = (c.phone ?? '').replace(/\D/g, '')
    const num = digits.length === 10 ? `+1${digits}` : `+${digits}`
    return `sms:${num}?&body=${encodeURIComponent(draft(c))}`
  }

  async function copyMsg(c: Customer) {
    try { await navigator.clipboard.writeText(draft(c)) } catch { /* ignore */ }
    setState(s => ({ ...s, [c.id]: 'copied' }))
    setTimeout(() => setState(s => {
      if (s[c.id] !== 'copied') return s
      const n = { ...s }; delete n[c.id]; return n
    }), 1500)
  }

  /** Move a customer out of the win-back list once they've been contacted. */
  async function markReached(c: Customer) {
    await saveCustomer(tenantId!, {
      name: c.name, contact_name: c.contact_name, phone: c.phone, email: c.email,
      address: c.address, status: 'active', language: c.language,
      last_service_date: c.last_service_date ?? today(), notes: c.notes,
    }, c.id)
    setCustomers(cs => cs.filter(x => x.id !== c.id))
  }

  async function emailReengage(c: Customer) {
    setState(s => ({ ...s, [c.id]: 'sending' }))
    const res = await sendEmail({ type: 'win_back', tenantId: tenantId!, customerId: c.id, lang: c.language })
    if (!res.ok) { setState(s => ({ ...s, [c.id]: 'error' })); return }
    await markReached(c)
  }

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  return (
    <>
      <PageHeader title={t('win.title')} subtitle={t('win.subtitle')} />
      {customers.length === 0 ? (
        <Card><EmptyState message={t('win.empty')} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {customers.map(c => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {c.language}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {t('win.lastService', { date: shortDate(c.last_service_date, locale) })}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {c.phone}{c.phone && c.email ? ' · ' : ''}{c.email}
                    {!c.phone && !c.email && <span className="text-amber-600">{t('win.noContact')}</span>}
                  </div>
                </div>
                <Badge status={c.status} kind="customer" />
              </div>

              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
                {draft(c)}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {state[c.id] === 'error' && <span className="mr-auto text-sm text-red-600">{t('win.failed')}</span>}
                {c.phone && (
                  <a
                    href={smsHref(c)}
                    className="inline-flex items-center justify-center rounded-lg bg-[#0c2340] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#15315a]"
                  >
                    {t('win.text')}
                  </a>
                )}
                <Button size="sm" variant="secondary" onClick={() => void copyMsg(c)}>
                  {state[c.id] === 'copied' ? t('win.copied') : t('win.copy')}
                </Button>
                {c.email && (
                  <Button size="sm" variant="secondary" onClick={() => void emailReengage(c)} disabled={state[c.id] === 'sending'}>
                    {state[c.id] === 'sending' ? t('win.sending') : t('win.send')}
                  </Button>
                )}
                <button
                  onClick={() => void markReached(c)}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  {t('win.markDone')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
