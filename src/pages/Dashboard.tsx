import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCustomers, listInvoices, listLeads, getTenant } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import type { Customer, Invoice, Lead } from '../lib/types'
import { LEAD_STAGES } from '../lib/types'
import { daysAgo, money, shortDate } from '../lib/format'
import { Badge, Card, ErrorNote, Loading, PageHeader } from '../components/ui'

function Kpi({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'red' | 'emerald'
}) {
  const ring  = tone === 'red' ? 'ring-red-200 bg-red-50' : tone === 'emerald' ? 'ring-emerald-200 bg-emerald-50' : 'ring-slate-200 bg-white'
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className={`rounded-xl p-5 shadow-sm ring-1 ring-inset ${ring}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { tenantId, loading: authLoading } = useAuth()
  const { t, locale } = useI18n()
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [leads, setLeads]         = useState<Lead[]>([])
  const [owner, setOwner]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!tenantId) { setLoading(false); return }
    void (async () => {
      try {
        const [inv, cust, tenant, lds] = await Promise.all([
          listInvoices(tenantId), listCustomers(tenantId), getTenant(tenantId), listLeads(tenantId),
        ])
        setInvoices(inv)
        setCustomers(cust)
        setLeads(lds)
        setOwner(tenant?.owner_name ?? tenant?.name ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setLoading(false)
    })()
  }, [tenantId, authLoading])

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const overdue     = invoices.filter(i => i.status === 'overdue')
  const paid        = invoices.filter(i => i.status === 'paid')
  const recentPaid  = paid.filter(i => (daysAgo(i.paid_date) ?? 999) <= 30)

  const owed       = outstanding.reduce((s, i) => s + Number(i.amount), 0)
  const overdueAmt = overdue.reduce((s, i) => s + Number(i.amount), 0)
  const collected  = recentPaid.reduce((s, i) => s + Number(i.amount), 0)
  const avgDays    = paid.length
    ? Math.round(paid.reduce((s, i) => s + ((daysAgo(i.sent_date) ?? 0) - (daysAgo(i.paid_date) ?? 0)), 0) / paid.length)
    : 0

  const winBack       = customers.filter(c => c.status === 'win_back')
  const dueForService = customers.filter(c => c.status === 'due_for_service')

  const outstandingSorted = [...outstanding].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'overdue' ? -1 : 1
    return (a.due_date ?? '').localeCompare(b.due_date ?? '')
  })

  const justCollected = [...recentPaid]
    .sort((a, b) => (b.paid_date ?? '').localeCompare(a.paid_date ?? ''))
    .slice(0, 4)

  const thisMonth     = new Date().toISOString().slice(0, 7)
  const newLeads      = leads.filter(l => l.created_at.slice(0, 7) === thisMonth).length
  const pipeline      = LEAD_STAGES.map(stage => ({ stage, count: leads.filter(l => l.status === stage).length }))
  const openLeadValue = leads.filter(l => l.status !== 'won' && l.status !== 'lost').reduce((s, l) => s + Number(l.est_value || 0), 0)
  const leadSourceMap = new Map<string, number>()
  leads.filter(l => l.created_at.slice(0, 7) === thisMonth).forEach(l => leadSourceMap.set(l.source, (leadSourceMap.get(l.source) ?? 0) + 1))
  const leadSources   = [...leadSourceMap.entries()].sort((a, b) => b[1] - a[1])
  const leadSourceMax = leadSources.length ? leadSources[0][1] : 1

  return (
    <>
      <PageHeader title={t('dash.greeting', { name: owner })} subtitle={t('dash.subtitle')} />

      {leads.length > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{t('dash.pipeline')}</h2>
              <p className="text-xs text-slate-500">
                {t('lead.pipelineValue', { amount: money(openLeadValue) })} · {t('dash.newLeads')}: {newLeads} {t('dash.newLeadsSub')}
              </p>
            </div>
            <Link to="/leads" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">{t('dash.pipelineOpen')}</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {pipeline.map(col => (
              <Link key={col.stage} to="/leads" className="rounded-lg border border-slate-200 p-3 transition-colors hover:border-blue-300">
                <div className="text-2xl font-semibold text-slate-900">{col.count}</div>
                <div className="mt-1"><Badge status={col.stage} kind="lead" /></div>
              </Link>
            ))}
          </div>
          {leadSources.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 text-xs font-medium text-slate-500">{t('dash.leadSources')}</div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {leadSources.slice(0, 3).map(([src, n]) => (
                  <div key={src}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="truncate text-slate-600">{t(`leadsrc.${src}` as TKey)}</span>
                      <span className="font-semibold text-slate-800">{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(n / leadSourceMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
            <span className="font-medium text-blue-700">{t('dash.leadAutoLabel')}:</span> {t('dash.leadAuto')}
          </div>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('dash.owed')} value={money(owed)} sub={t('dash.owedSub', { n: outstanding.length })} />
        <Kpi label={t('dash.overdue')} value={money(overdueAmt)} sub={t('dash.overdueSub', { n: overdue.length })} tone="red" />
        <Kpi label={t('dash.collected')} value={money(collected)} sub={t('dash.collectedSub', { n: recentPaid.length })} tone="emerald" />
        <Kpi label={t('dash.avgDays')} value={t('dash.avgDaysValue', { n: avgDays })} sub={t('dash.avgDaysSub')} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{t('dash.outstandingTitle')}</h2>
              <p className="text-xs text-slate-500">{t('dash.outstandingSub')}</p>
            </div>
            <Link to="/invoices" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">{t('dash.viewAll')}</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {outstandingSorted.length === 0
              ? <div className="px-5 py-8 text-center text-sm text-slate-400">{t('dash.allPaid')}</div>
              : outstandingSorted.map(inv => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{inv.customer?.name}</div>
                    <div className="text-xs text-slate-400">{inv.number} · {inv.description}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-800">{money(inv.amount)}</div>
                      <div className="text-xs text-slate-400">
                        {inv.status === 'overdue'
                          ? t('dash.overdueBy', { n: daysAgo(inv.due_date) ?? 0 })
                          : t('dash.dueOn', { date: shortDate(inv.due_date, locale) })}
                      </div>
                    </div>
                    <Badge status={inv.status} kind="invoice" />
                  </div>
                </div>
              ))}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-800">{t('dash.justCollected')}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {justCollected.length === 0
                ? <div className="px-5 py-6 text-center text-sm text-slate-400">{t('dash.noPayments')}</div>
                : justCollected.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-sm text-slate-700">{inv.customer?.name}</div>
                      <div className="text-xs text-slate-400">{t('dash.paidOn', { date: shortDate(inv.paid_date, locale) })}</div>
                    </div>
                    <div className="text-sm font-medium text-emerald-600">{money(inv.amount)}</div>
                  </div>
                ))}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-[#0c2340] to-[#15315a]">
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold text-white">{t('dash.onTable')}</h2>
              <p className="mt-1 text-xs text-slate-300">{t('dash.onTableSub')}</p>
              <div className="mt-4 flex items-end gap-6">
                <div>
                  <div className="text-3xl font-semibold text-white">{winBack.length}</div>
                  <div className="text-xs text-slate-400">{t('dash.winBackLeads')}</div>
                </div>
                <div>
                  <div className="text-3xl font-semibold text-white">{dueForService.length}</div>
                  <div className="text-xs text-slate-400">{t('dash.dueForService')}</div>
                </div>
              </div>
              <Link to="/winback" className="mt-4 inline-block rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[#0c2340] hover:bg-slate-100">
                {t('dash.reengage')}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
