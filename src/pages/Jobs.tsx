import { useEffect, useState } from 'react'
import { completeJobToInvoice, deleteJob, listJobs, patchJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { sendEmail } from '../lib/email'
import type { Job } from '../lib/types'
import { money, shortDate } from '../lib/format'
import {
  Badge, Button, Card, Collapsible, DeleteButton, EmptyState, ErrorNote, Loading, PageHeader,
} from '../components/ui'
import JobModal from '../components/JobModal'

export default function Jobs() {
  const { tenantId } = useAuth()
  const { t, locale } = useI18n()
  const [jobs, setJobs]         = useState<Job[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [modal, setModal]       = useState<'new' | Job | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [quote, setQuote]       = useState<Record<string, 'sending' | 'sent' | 'error'>>({})
  const [invoiced, setInvoiced] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)

  async function load() {
    if (!tenantId) return
    try {
      setJobs(await listJobs(tenantId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])

  async function sendQuote(j: Job) {
    setQuote(s => ({ ...s, [j.id]: 'sending' }))
    const res = await sendEmail({ type: 'quote', tenantId: tenantId!, jobId: j.id })
    setQuote(s => ({ ...s, [j.id]: res.ok ? 'sent' : 'error' }))
    await patchJob(j.id, { status: 'scheduled' })
    await load()
  }

  async function schedule(j: Job) {
    setAdvancing(j.id)
    await patchJob(j.id, { status: 'scheduled' })
    await load()
    setAdvancing(null)
  }

  async function complete(j: Job) {
    setAdvancing(j.id)
    try {
      await completeJobToInvoice(tenantId!, j)
      setInvoiced(s => new Set(s).add(j.id))
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
    setAdvancing(null)
  }

  async function remove(j: Job) {
    if (!confirm(t('job.confirmDelete', { title: j.title }))) return
    setDeleting(j.id)
    await deleteJob(j.id)
    await load()
    setDeleting(null)
  }

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  const active     = jobs.filter(j => j.status !== 'done')
  const completed  = jobs.filter(j => j.status === 'done')
  const openQuotes = jobs.filter(j => j.status === 'quote')
  const quoteValue = openQuotes.reduce((s, j) => s + Number(j.amount), 0)

  const JobCard = ({ j }: { j: Job }) => (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-800">{j.title}</div>
          <div className="text-xs text-slate-400">{j.customer?.name}</div>
        </div>
        <Badge status={j.status} kind="job" />
      </div>
      {j.description && <p className="mt-2 text-sm text-slate-600">{j.description}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-lg font-semibold text-slate-800">{money(j.amount)}</span>
        <div className="flex flex-wrap items-center gap-2">
          {j.scheduled_date && (
            <span className="text-xs text-slate-500">{t('job.scheduledOn', { date: shortDate(j.scheduled_date, locale) })}</span>
          )}
          {j.status === 'quote' && (
            quote[j.id] === 'sent'
              ? <span className="text-xs font-medium text-emerald-600">{t('job.quoteSent')}</span>
              : <>
                  <Button size="sm" variant="secondary" onClick={() => void sendQuote(j)} disabled={quote[j.id] === 'sending'}>
                    {quote[j.id] === 'sending' ? t('inv.sending') : t('job.sendQuote')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void schedule(j)} disabled={advancing === j.id}>
                    {t('job.markScheduled')}
                  </Button>
                </>
          )}
          {(j.status === 'scheduled' || j.status === 'in_progress') && (
            <Button size="sm" onClick={() => void complete(j)} disabled={advancing === j.id}>
              {advancing === j.id ? t('job.creating') : t('job.complete')}
            </Button>
          )}
          {j.status === 'done' && (
            invoiced.has(j.id)
              ? <span className="text-xs font-medium text-emerald-600">{t('job.invoiceDrafted')}</span>
              : <span className="text-xs text-slate-400">{t('job.invoiced')}</span>
          )}
          <Button size="sm" variant="secondary" onClick={() => setModal(j)}>{t('common.edit')}</Button>
          <DeleteButton onClick={() => void remove(j)} disabled={deleting === j.id} />
        </div>
      </div>
    </Card>
  )

  return (
    <>
      <PageHeader
        title={t('job.title')}
        subtitle={t('job.subtitle')}
        action={<Button onClick={() => setModal('new')}>{t('job.new')}</Button>}
      />

      {openQuotes.length > 0 && (
        <div className="mb-6 rounded-xl bg-white p-5 text-sm shadow-sm ring-1 ring-inset ring-slate-200 text-slate-500">
          {t('job.openQuotes', { amount: money(quoteValue), n: openQuotes.length })}
        </div>
      )}

      {active.length === 0 && completed.length === 0 ? (
        <Card><EmptyState message={t('job.empty')} /></Card>
      ) : active.length === 0 ? (
        <Card><EmptyState message={t('job.emptyActive')} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {active.map(j => <JobCard key={j.id} j={j} />)}
        </div>
      )}

      {completed.length > 0 && (
        <Collapsible
          label={t('job.completedSection', { n: completed.length })}
          open={showDone}
          onToggle={() => setShowDone(v => !v)}
        >
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {completed.map(j => <JobCard key={j.id} j={j} />)}
          </div>
        </Collapsible>
      )}

      {modal === 'new' && <JobModal onClose={() => setModal(null)} onSaved={load} />}
      {modal && modal !== 'new' && <JobModal job={modal} onClose={() => setModal(null)} onSaved={load} />}
    </>
  )
}
