import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LIVE, deleteCampaign, getSettings, getTenant, listCampaigns, listEnrollments, listSteps,
  markOutreachSent, nyDay, patchCampaign, sentTodayCount, setEnrollmentStatus,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import { outreachFooter, renderOutreach, type MergeContext } from '../lib/outreach'
import type { Campaign, CampaignAudience, CampaignStep, Enrollment, EnrollmentStatus } from '../lib/types'
import { Badge, Button, Card, DeleteButton, ErrorNote, Loading, PageHeader } from '../components/ui'
import CampaignModal from '../components/CampaignModal'
import EnrollModal from '../components/EnrollModal'

const COUNTED: EnrollmentStatus[] = ['active', 'replied', 'completed', 'unsubscribed']

export default function Campaigns() {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [steps, setSteps]         = useState<Record<string, CampaignStep[]>>({})
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [ctx, setCtx]             = useState<MergeContext>({ ownerName: '', business: '', phone: '', lang: 'en' })
  const [hasAddress, setHasAddress] = useState(true)
  const [address, setAddress]     = useState('')
  const [sentToday, setSentToday] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [editing, setEditing]     = useState<{ campaign?: Campaign; preset?: CampaignAudience } | null>(null)
  const [enrolling, setEnrolling] = useState<Campaign | null>(null)
  const [open, setOpen]           = useState<string | null>(null)
  const [peek, setPeek]           = useState<string | null>(null)
  const [rowState, setRowState]   = useState<Record<string, 'copied' | 'saving'>>({})

  async function load() {
    if (!tenantId) return
    try {
      const [cs, es, tenant, settings, sent] = await Promise.all([
        listCampaigns(tenantId), listEnrollments(tenantId), getTenant(tenantId),
        getSettings(tenantId), sentTodayCount(tenantId),
      ])
      const stepLists = await Promise.all(cs.map(c => listSteps(c.id)))
      setCampaigns(cs)
      setSteps(Object.fromEntries(cs.map((c, i) => [c.id, stepLists[i]])))
      setEnrollments(es)
      setCtx({
        ownerName: tenant?.owner_name ?? '',
        business: settings.mailing_name || tenant?.name || 'Companit Expert',
        phone: settings.contact_phone ?? '',
        lang: 'en',
      })
      setHasAddress(Boolean(settings.mailing_address?.trim()))
      setAddress(settings.mailing_address ?? '')
      setSentToday(sent)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries(campaigns.map(c => [c.id, c])), [campaigns])

  // Today's batch: active prospects in active campaigns whose next email is due.
  const due = useMemo(() => {
    const today = nyDay()
    return enrollments.filter(e => {
      const c = byId[e.campaign_id]
      return c?.status === 'active' && e.status === 'active' && e.next_send_on <= today &&
        Boolean(e.lead?.email) && !e.lead?.unsubscribed_at &&
        (steps[e.campaign_id] ?? []).some(s => s.step_no === e.next_step)
    })
  }, [enrollments, byId, steps])

  function draftFor(e: Enrollment) {
    const c = byId[e.campaign_id]
    const step = (steps[e.campaign_id] ?? []).find(s => s.step_no === e.next_step)
    if (!c || !step || !e.lead) return null
    const pctx = { ...ctx, lang: c.language }
    return {
      subject: renderOutreach(step.subject, e.lead, pctx),
      body: renderOutreach(step.body, e.lead, pctx) + outreachFooter(ctx.business, address, c.language),
    }
  }

  function gmailHref(to: string, d: { subject: string; body: string }) {
    const q = new URLSearchParams({ view: 'cm', fs: '1', to, su: d.subject, body: d.body })
    return `https://mail.google.com/mail/?${q.toString()}`
  }

  function mailtoHref(to: string, d: { subject: string; body: string }) {
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`
  }

  async function copyDraft(e: Enrollment, d: { subject: string; body: string }) {
    try { await navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`) } catch { /* ignore */ }
    setRowState(s => ({ ...s, [e.id]: 'copied' }))
    setTimeout(() => setRowState(s => {
      if (s[e.id] !== 'copied') return s
      const n = { ...s }; delete n[e.id]; return n
    }), 1500)
  }

  async function markSent(e: Enrollment, d: { subject: string }) {
    if (!tenantId || !e.lead?.email) return
    setRowState(s => ({ ...s, [e.id]: 'saving' })); setError(null)
    try {
      await markOutreachSent(tenantId, e, e.lead.email, d.subject)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setRowState(s => { const n = { ...s }; delete n[e.id]; return n })
  }

  async function toggleStatus(c: Campaign) {
    const next = c.status === 'active' ? 'paused' : 'active'
    if ((steps[c.id] ?? []).length === 0) return
    await patchCampaign(c.id, { status: next })
    void load()
  }

  async function remove(c: Campaign) {
    if (!window.confirm(t('camp.confirmDelete', { name: c.name }))) return
    await deleteCampaign(c.id)
    void load()
  }

  async function mark(e: Enrollment, status: EnrollmentStatus) {
    await setEnrollmentStatus(e.id, status)
    void load()
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHeader
        title={t('camp.title')}
        subtitle={t('camp.subtitle')}
        action={<Button onClick={() => setEditing({})}>{t('camp.new')}</Button>}
      />
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {/* ---------------------------------------------------- today's batch */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-slate-900">{t('camp.todayTitle')}</div>
            <div className="text-xs text-slate-500">
              {t('camp.todaySub', { due: due.length, sent: sentToday })}
            </div>
          </div>
        </div>

        {!hasAddress && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
            {t('camp.needAddress')} <Link to="/settings" className="font-medium underline">{t('nav.settings')}</Link>
          </div>
        )}
        {!LIVE && (
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-500">{t('camp.demoNote')}</div>
        )}
        {due.length > 0 && (
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-500">{t('camp.manualNote')}</div>
        )}

        {due.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">{t('camp.todayEmpty')}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {due.map(e => {
              const c = byId[e.campaign_id]
              const total = (steps[e.campaign_id] ?? []).length
              const draft = draftFor(e)
              const d = peek === e.id ? draft : null
              const to = e.lead?.email ?? ''
              return (
                <div key={e.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {e.lead?.name}{e.lead?.company && e.lead.company !== e.lead.name ? <span className="font-normal text-slate-500"> · {e.lead.company}</span> : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {e.lead?.email} · {c?.name} · {t('camp.stepOf', { n: e.next_step, total })}
                      </div>
                    </div>
                    <button onClick={() => setPeek(p => (p === e.id ? null : e.id))}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
                      {peek === e.id ? t('camp.hide') : t('camp.preview')}
                    </button>
                  </div>
                  {draft && hasAddress && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a href={gmailHref(to, draft)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg bg-[#0c2340] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#15315a]">
                        {t('camp.openGmail')}
                      </a>
                      <a href={mailtoHref(to, draft)}
                        className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50">
                        {t('camp.openMail')}
                      </a>
                      <Button size="sm" variant="secondary" onClick={() => void copyDraft(e, draft)}>
                        {rowState[e.id] === 'copied' ? t('camp.copiedEmail') : t('camp.copyEmail')}
                      </Button>
                      <Button size="sm" onClick={() => void markSent(e, draft)} disabled={rowState[e.id] === 'saving'}>
                        {t('camp.markSent')}
                      </Button>
                    </div>
                  )}
                  {d && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-800">{d.subject}</div>
                      <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{d.body}</pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- campaigns */}
      {campaigns.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-base font-semibold text-slate-800">{t('camp.emptyTitle')}</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t('camp.emptyBody')}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={() => setEditing({ preset: 'pm' })}>{t('camp.quickPm')}</Button>
            <Button variant="secondary" onClick={() => setEditing({ preset: 'landlord' })}>{t('camp.quickLandlord')}</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {campaigns.map(c => {
            const mine = enrollments.filter(e => e.campaign_id === c.id)
            const count = (s: EnrollmentStatus) => mine.filter(e => e.status === s).length
            const nSteps = (steps[c.id] ?? []).length
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">{c.name}</span>
                      <Badge status={c.status} kind="outreach" />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t(`camp.aud.${c.audience}` as TKey)} · {c.language === 'ru' ? 'Русский' : 'English'} · {t('camp.stepsN', { n: nSteps })} · {t('camp.capN', { n: c.daily_cap })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>{t('camp.enrolledN', { n: mine.length })}</span>
                      {COUNTED.map(s => <span key={s}>{t(`status.${s}` as TKey)}: {count(s)}</span>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEnrolling(c)}>{t('camp.addLeads')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ campaign: c })}>{t('common.edit')}</Button>
                    <Button size="sm" onClick={() => void toggleStatus(c)} disabled={nSteps === 0}>
                      {c.status === 'active' ? t('camp.pause') : t('camp.activate')}
                    </Button>
                    <DeleteButton onClick={() => void remove(c)} />
                  </div>
                </div>

                {mine.length > 0 && (
                  <>
                    <button onClick={() => setOpen(o => (o === c.id ? null : c.id))}
                      className="w-full border-t border-slate-100 px-5 py-2 text-left text-xs font-medium text-blue-600 hover:bg-slate-50">
                      {open === c.id ? t('camp.hidePeople') : t('camp.showPeople', { n: mine.length })}
                    </button>
                    {open === c.id && (
                      <div className="divide-y divide-slate-100 border-t border-slate-100">
                        {mine.map(e => (
                          <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-slate-800">{e.lead?.name}</div>
                              <div className="truncate text-xs text-slate-500">
                                {e.lead?.email} · {e.status === 'active'
                                  ? t('camp.nextOn', { n: e.next_step, date: e.next_send_on })
                                  : e.last_sent_at ? t('camp.lastSent', { date: e.last_sent_at.slice(0, 10) }) : ''}
                              </div>
                            </div>
                            <Badge status={e.status} kind="outreach" />
                            {e.status === 'active' && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => void mark(e, 'replied')}>{t('camp.markReplied')}</Button>
                                <Button size="sm" variant="secondary" onClick={() => void mark(e, 'stopped')}>{t('camp.stop')}</Button>
                              </>
                            )}
                            {(e.status === 'stopped' || e.status === 'replied') && (
                              <Button size="sm" variant="secondary" onClick={() => void mark(e, 'active')}>{t('camp.resume')}</Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <CampaignModal
          campaign={editing.campaign}
          steps={editing.campaign ? steps[editing.campaign.id] : undefined}
          preset={editing.preset}
          ctx={ctx}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {enrolling && (
        <EnrollModal
          campaign={enrolling}
          enrolled={enrollments.filter(e => e.campaign_id === enrolling.id)}
          onClose={() => setEnrolling(null)}
          onSaved={load}
        />
      )}
    </>
  )
}
