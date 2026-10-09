import { useEffect, useMemo, useState } from 'react'
import { enrollLeads, listLeads, patchLead } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import type { Campaign, Enrollment, Lead, LeadSource } from '../lib/types'
import { Button, Loading, Modal } from './ui'

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/**
 * Pick leads to add to a campaign. Leads from NYC records arrive without an
 * email, so each one gets an inline email box: find it, paste it, and it is
 * saved to the lead and becomes selectable.
 */
export default function EnrollModal({ campaign, enrolled, onClose, onSaved }: {
  campaign: Campaign
  enrolled: Enrollment[]
  onClose: () => void
  onSaved: () => void
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [leads, setLeads]   = useState<Lead[] | null>(null)
  const [source, setSource] = useState<'all' | LeadSource>('all')
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    listLeads(tenantId).then(setLeads).catch(e => setError(String(e)))
  }, [tenantId])

  const inCampaign = useMemo(() => new Set(enrolled.map(e => e.lead_id)), [enrolled])
  const sources = useMemo(() => [...new Set((leads ?? []).map(l => l.source))], [leads])
  const rows = (leads ?? []).filter(l =>
    (source === 'all' || l.source === source) && l.status !== 'won' && l.status !== 'lost')

  const selectable = (l: Lead) => Boolean(l.email) && !l.unsubscribed_at && !inCampaign.has(l.id)
  const chosen = rows.filter(l => picked[l.id] && selectable(l))

  async function saveEmail(l: Lead) {
    const v = (emails[l.id] ?? '').trim()
    if (!isEmail(v)) return
    try {
      await patchLead(l.id, { email: v })
      setLeads(ls => (ls ?? []).map(x => (x.id === l.id ? { ...x, email: v } : x)))
      setPicked(p => ({ ...p, [l.id]: true }))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function submit() {
    if (!tenantId || chosen.length === 0) return
    setSaving(true); setError(null)
    try {
      await enrollLeads(tenantId, campaign.id, chosen)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  return (
    <Modal title={t('enroll.title', { name: campaign.name })} onClose={onClose} wide>
      {!leads ? <Loading /> : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <select value={source} onChange={e => setSource(e.target.value as 'all' | LeadSource)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="all">{t('enroll.allSources')}</option>
              {sources.map(s => <option key={s} value={s}>{t(`leadsrc.${s}` as TKey)}</option>)}
            </select>
            <button className="text-xs font-medium text-blue-600 hover:underline"
              onClick={() => setPicked(Object.fromEntries(rows.filter(selectable).map(l => [l.id, true])))}>
              {t('enroll.selectReady')}
            </button>
          </div>

          <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {rows.length === 0 && <div className="p-6 text-center text-sm text-slate-400">{t('enroll.empty')}</div>}
            {rows.map(l => {
              const ok = selectable(l)
              return (
                <div key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                  <input type="checkbox" disabled={!ok} checked={ok && !!picked[l.id]}
                    onChange={e => setPicked(p => ({ ...p, [l.id]: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300 disabled:opacity-30" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {l.name}{l.company && l.company !== l.name ? <span className="font-normal text-slate-500"> · {l.company}</span> : null}
                    </div>
                    {l.email ? (
                      <div className="truncate text-xs text-slate-500">{l.email}</div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={emails[l.id] ?? ''} placeholder={t('enroll.addEmail')}
                          onChange={e => setEmails(m => ({ ...m, [l.id]: e.target.value }))}
                          onBlur={() => void saveEmail(l)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveEmail(l) } }}
                          className="w-64 max-w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
                        {l.address && <span className="truncate text-[11px] text-slate-400">{l.address}</span>}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {l.unsubscribed_at ? t('enroll.unsubscribed') : inCampaign.has(l.id) ? t('enroll.already') : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{t('enroll.note')}</span>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
              <Button onClick={() => void submit()} disabled={saving || chosen.length === 0}>
                {saving ? t('common.saving') : t('enroll.add', { n: chosen.length })}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
