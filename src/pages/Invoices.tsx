import { useEffect, useState } from 'react'
import {
  bumpReminder, deleteInvoice, listInvoices, markInvoicePaid, patchInvoice,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { sendEmail } from '../lib/email'
import type { Invoice } from '../lib/types'
import { money, shortDate, today } from '../lib/format'
import {
  Badge, Button, Card, Collapsible, DeleteButton, EmptyState, ErrorNote, Loading, PageHeader,
} from '../components/ui'
import InvoiceModal from '../components/InvoiceModal'

type EmailState = Record<string, 'sending' | 'sent' | 'error'>

export default function Invoices() {
  const { tenantId } = useAuth()
  const { t, locale } = useI18n()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState<string | null>(null)
  const [modal, setModal]       = useState<'new' | Invoice | null>(null)
  const [mail, setMail]         = useState<EmailState>({})
  const [showPaid, setShowPaid] = useState(false)

  async function load() {
    if (!tenantId) return
    try {
      setInvoices(await listInvoices(tenantId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])

  /** Emails the invoice in the customer's own language, then advances it. */
  async function sendInvoice(inv: Invoice) {
    setBusy(inv.id)
    setMail(s => ({ ...s, [inv.id]: 'sending' }))
    const res = await sendEmail({
      type: 'invoice_new', tenantId: tenantId!, invoiceId: inv.id, lang: inv.customer?.language,
    })
    setMail(s => ({ ...s, [inv.id]: res.ok ? 'sent' : 'error' }))
    // The invoice advances either way so the pipeline never stalls on email.
    await patchInvoice(inv.id, { status: 'sent', sent_date: today() })
    await load()
    setBusy(null)
  }

  async function markSent(inv: Invoice) {
    setBusy(inv.id)
    await patchInvoice(inv.id, { status: 'sent', sent_date: today() })
    await load()
    setBusy(null)
  }

  async function sendReminder(inv: Invoice) {
    setBusy(inv.id)
    setMail(s => ({ ...s, [inv.id]: 'sending' }))
    const res = await sendEmail({
      type: 'invoice_reminder', tenantId: tenantId!, invoiceId: inv.id, lang: inv.customer?.language,
    })
    setMail(s => ({ ...s, [inv.id]: res.ok ? 'sent' : 'error' }))
    // Live sends are counted by the edge function, so only count here when the
    // send was simulated (no backend configured yet).
    if (res.ok && res.simulated) await bumpReminder(inv)
    await load()
    setBusy(null)
  }

  async function paid(inv: Invoice) {
    setBusy(inv.id)
    await markInvoicePaid(inv)
    void sendEmail({
      type: 'invoice_receipt', tenantId: tenantId!, invoiceId: inv.id, lang: inv.customer?.language,
    })
    await load()
    setBusy(null)
  }

  async function receipt(inv: Invoice) {
    setBusy(inv.id + '_receipt')
    const res = await sendEmail({
      type: 'invoice_receipt', tenantId: tenantId!, invoiceId: inv.id, lang: inv.customer?.language,
    })
    setMail(s => ({ ...s, [inv.id]: res.ok ? 'sent' : 'error' }))
    setBusy(null)
  }

  async function remove(inv: Invoice) {
    if (!confirm(t('inv.confirmDelete', { number: inv.number }))) return
    setBusy(inv.id)
    await deleteInvoice(inv.id)
    await load()
    setBusy(null)
  }

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  const active = invoices.filter(i => i.status !== 'paid')
  const done   = invoices.filter(i => i.status === 'paid')

  const Row = ({ inv }: { inv: Invoice }) => (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-800">{inv.number}</div>
        <div className="text-xs text-slate-400">{inv.description}</div>
      </td>
      <td className="px-4 py-3 text-slate-600">{inv.customer?.name}</td>
      <td className="px-4 py-3 font-medium text-slate-800">{money(inv.amount)}</td>
      <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{shortDate(inv.sent_date, locale)}</td>
      <td className="px-4 py-3"><Badge status={inv.status} kind="invoice" /></td>
      <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
        {inv.status === 'paid'
          ? <span className="text-emerald-600">{t('inv.paidStamp', { date: shortDate(inv.paid_date, locale) })}</span>
          : inv.reminder_count > 0
            ? <span>{t('inv.remindersInfo', { n: inv.reminder_count, date: shortDate(inv.last_reminder_date, locale) })}</span>
            : <span className="text-slate-400">{t('inv.noRemindersYet')}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          {inv.status === 'draft' && (
            <>
              <Button size="sm" onClick={() => void sendInvoice(inv)} disabled={busy === inv.id || mail[inv.id] === 'sending'}>
                {mail[inv.id] === 'sending' ? t('inv.sending') : mail[inv.id] === 'sent' ? t('inv.sentTick') : t('inv.send')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void markSent(inv)} disabled={busy === inv.id}>
                {t('inv.markSent')}
              </Button>
            </>
          )}
          {(inv.status === 'sent' || inv.status === 'overdue') && (
            <>
              <Button size="sm" variant="secondary" onClick={() => void sendReminder(inv)} disabled={busy === inv.id || mail[inv.id] === 'sending'}>
                {mail[inv.id] === 'sending' ? t('inv.sending') : mail[inv.id] === 'sent' ? t('inv.sentTick') : t('inv.remind')}
              </Button>
              <Button size="sm" onClick={() => void paid(inv)} disabled={busy === inv.id}>{t('inv.markPaid')}</Button>
            </>
          )}
          {inv.status === 'paid' && (
            <Button size="sm" variant="secondary" onClick={() => void receipt(inv)} disabled={busy === inv.id + '_receipt'}>
              {t('inv.receipt')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setModal(inv)}>{t('common.edit')}</Button>
          <DeleteButton onClick={() => void remove(inv)} disabled={busy === inv.id} />
        </div>
      </td>
    </tr>
  )

  const Table = ({ rows }: { rows: Invoice[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">{t('inv.colInvoice')}</th>
            <th className="px-4 py-3 font-medium">{t('common.customer')}</th>
            <th className="px-4 py-3 font-medium">{t('common.amount')}</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">{t('inv.colSent')}</th>
            <th className="px-4 py-3 font-medium">{t('common.status')}</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">{t('inv.colReminders')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>{rows.map(inv => <Row key={inv.id} inv={inv} />)}</tbody>
      </table>
    </div>
  )

  return (
    <>
      <PageHeader
        title={t('inv.title')}
        subtitle={t('inv.subtitle')}
        action={<Button onClick={() => setModal('new')}>{t('inv.new')}</Button>}
      />

      <Card>
        {active.length === 0 && done.length === 0
          ? <EmptyState message={t('inv.emptyNone')} />
          : active.length === 0
            ? <EmptyState message={t('inv.emptyAllPaid')} />
            : <Table rows={active} />}
      </Card>

      {done.length > 0 && (
        <Collapsible
          label={t('inv.paidSection', { n: done.length })}
          open={showPaid}
          onToggle={() => setShowPaid(v => !v)}
        >
          <Card className="mt-4"><Table rows={done} /></Card>
        </Collapsible>
      )}

      {modal === 'new' && <InvoiceModal onClose={() => setModal(null)} onSaved={load} />}
      {modal && modal !== 'new' && <InvoiceModal invoice={modal} onClose={() => setModal(null)} onSaved={load} />}
    </>
  )
}
