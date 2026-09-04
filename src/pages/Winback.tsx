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

export default function Winback() {
  const { tenantId } = useAuth()
  const { t, locale } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [owner, setOwner]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [state, setState]   = useState<Record<string, 'sending' | 'sent' | 'error'>>({})

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

  /** Drafted in the interface language so the owner can read what goes out. */
  function draft(c: Customer): string {
    const first = (c.contact_name ?? c.name).split(' ')[0]
    return t(c.status === 'win_back' ? 'win.msgWinBack' : 'win.msgDue', { first, owner })
  }

  async function reengage(c: Customer) {
    setState(s => ({ ...s, [c.id]: 'sending' }))
    const res = await sendEmail({
      type: 'win_back', tenantId: tenantId!, customerId: c.id, lang: c.language,
    })
    if (!res.ok) {
      setState(s => ({ ...s, [c.id]: 'error' }))
      return
    }
    await saveCustomer(tenantId!, {
      name: c.name, contact_name: c.contact_name, phone: c.phone, email: c.email,
      address: c.address, status: 'active', language: c.language,
      last_service_date: c.last_service_date ?? today(), notes: c.notes,
    }, c.id)
    setState(s => ({ ...s, [c.id]: 'sent' }))
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
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {c.language}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {t('win.lastService', { date: shortDate(c.last_service_date, locale) })}
                  </div>
                  {!c.email && <div className="mt-1 text-xs text-amber-600">{t('win.noEmail')}</div>}
                </div>
                <Badge status={c.status} kind="customer" />
              </div>

              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
                {draft(c)}
              </div>

              <div className="mt-3 flex items-center justify-end gap-3">
                {state[c.id] === 'sent' ? (
                  <span className="text-sm font-medium text-emerald-600">{t('win.sent')}</span>
                ) : state[c.id] === 'error' ? (
                  <span className="text-sm text-red-600">{t('win.failed')}</span>
                ) : (
                  <Button size="sm" onClick={() => void reengage(c)} disabled={state[c.id] === 'sending' || !c.email}>
                    {state[c.id] === 'sending' ? t('win.sending') : t('win.send')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
