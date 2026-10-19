import { useEffect, useMemo, useState } from 'react'
import { deleteLead, listLeads, patchLead } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import type { Lead } from '../lib/types'
import { LEAD_STAGES } from '../lib/types'
import { money, today } from '../lib/format'
import { firstNameOf } from '../lib/outreach'
import { Badge, Button, DeleteButton, EmptyState, ErrorNote, Loading, PageHeader } from '../components/ui'
import LeadModal from '../components/LeadModal'

const SITE_URL = 'https://companitexpert.com'

export default function Leads() {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [modal, setModal]     = useState<{ open: boolean; lead?: Lead }>({ open: false })

  async function load() {
    if (!tenantId) return
    try { setLeads(await listLeads(tenantId)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }
  useEffect(() => { void load() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const cols = useMemo(
    () => LEAD_STAGES.map(stage => ({ stage, items: leads.filter(l => l.status === stage) })),
    [leads],
  )
  const openValue = leads
    .filter(l => l.status !== 'won' && l.status !== 'lost')
    .reduce((s, l) => s + Number(l.est_value || 0), 0)

  /** Short first-touch text for a lead, with the website link. */
  function textFor(lead: Lead): string {
    const first = firstNameOf(lead)
    return t('lead.textPm', { hi: first ? `Hi ${first},` : 'Hi,', site: SITE_URL })
  }

  function smsHref(lead: Lead): string {
    const digits = (lead.phone ?? '').replace(/\D/g, '')
    const num = digits.length === 10 ? `+1${digits}` : `+${digits}`
    return `sms:${num}?&body=${encodeURIComponent(textFor(lead))}`
  }

  /** Move a texted lead to Contacted and note the date, so nobody gets it twice. */
  async function markTexted(lead: Lead) {
    const line = `Texted ${today()}.`
    await patchLead(lead.id, {
      status: 'contacted',
      notes: lead.notes ? `${line} ${lead.notes}` : line,
    })
    void load()
  }

  async function remove(lead: Lead) {
    if (!window.confirm(t('lead.confirmDelete'))) return
    await deleteLead(lead.id)
    void load()
  }

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  return (
    <>
      <PageHeader
        title={t('lead.title')}
        subtitle={t('lead.subtitle')}
        action={<Button onClick={() => setModal({ open: true })}>{t('lead.new')}</Button>}
      />

      {leads.length === 0 ? (
        <EmptyState message={t('lead.empty')} />
      ) : (
        <>
          <div className="mb-4 text-sm text-slate-500">{t('lead.pipelineValue', { amount: money(openValue) })}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cols.map(col => (
              <div key={col.stage} className="rounded-xl bg-slate-50 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge status={col.stage} kind="lead" />
                  <span className="text-xs font-medium text-slate-400">{col.items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.items.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => setModal({ open: true, lead })}
                      className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition-colors hover:border-blue-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">{lead.service || lead.name}</div>
                          <div className="truncate text-xs text-slate-500">
                            {lead.name}{lead.company && lead.company !== lead.name ? ` · ${lead.company}` : ''}
                          </div>
                        </div>
                        {lead.est_value > 0 && (
                          <span className="shrink-0 text-xs font-semibold text-blue-700">{money(lead.est_value)}</span>
                        )}
                      </div>
                      {lead.status === 'new' && lead.phone && (
                        <div onClick={e => e.stopPropagation()} className="mt-2 flex items-center gap-1.5">
                          <a href={smsHref(lead)}
                            className="rounded-md bg-[#0c2340] px-2 py-1 text-xs font-medium text-white hover:bg-[#15315a]">
                            {t('lead.text')}
                          </a>
                          <button onClick={() => void markTexted(lead)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                            {t('lead.markTexted')}
                          </button>
                          <span className="truncate text-[11px] text-slate-400">{lead.phone}</span>
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="truncate text-[11px] text-slate-400">
                          {lead.address || t(`leadsrc.${lead.source}` as TKey)}
                        </span>
                        <span onClick={e => e.stopPropagation()} className="opacity-0 transition-opacity group-hover:opacity-100">
                          <DeleteButton onClick={() => void remove(lead)} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modal.open && (
        <LeadModal lead={modal.lead} onClose={() => setModal({ open: false })} onSaved={load} />
      )}
    </>
  )
}
