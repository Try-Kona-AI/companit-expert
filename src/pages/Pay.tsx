import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LIVE, db, supabaseUrl } from '../lib/supabase'
import { snapshot } from '../lib/demoStore'
import { useI18n } from '../lib/i18n'
import { money } from '../lib/format'
import { LangSwitch } from '../components/ui'

interface InvoiceView {
  id: string
  number: string
  description: string | null
  amount: number
  status: string
  tenant_id: string
  customerName: string | null
}

export default function Pay() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { t } = useI18n()
  const [invoice, setInvoice] = useState<InvoiceView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [paying, setPaying]   = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    if (!invoiceId) return
    void (async () => {
      if (!LIVE) {
        const s = snapshot()
        const inv = s.invoices.find(i => i.id === invoiceId)
        if (!inv) setError(t('pay.notFoundBody'))
        else setInvoice({
          id: inv.id, number: inv.number, description: inv.description,
          amount: inv.amount, status: inv.status, tenant_id: inv.tenant_id,
          customerName: s.customers.find(c => c.id === inv.customer_id)?.name ?? null,
        })
        setLoading(false)
        return
      }

      // Anonymous readers get exactly one invoice through a definer function,
      // never table access to the customer book.
      const { data, error: err } = await db()
        .rpc('get_public_invoice', { p_id: invoiceId })
        .maybeSingle()

      if (err || !data) {
        setError(err?.message ?? t('pay.notFoundBody'))
      } else {
        const raw = data as Record<string, unknown>
        setInvoice({
          id: raw.id as string,
          number: raw.number as string,
          description: (raw.description as string | null) ?? null,
          amount: Number(raw.amount),
          status: raw.status as string,
          tenant_id: raw.tenant_id as string,
          customerName: (raw.customer_name as string | null) ?? null,
        })
      }
      setLoading(false)
    })()
  }, [invoiceId, t])

  async function payByCard() {
    if (!invoice || !invoiceId) return
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, tenantId: invoice.tenant_id }),
      })
      const result = await res.json() as { ok?: boolean; url?: string; error?: string }
      if (result.ok && result.url) window.location.href = result.url
      else {
        setPayError(result.error ?? 'Unable to start checkout.')
        setPaying(false)
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Network error.')
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-2 text-lg font-semibold text-slate-900">{t('pay.notFound')}</p>
          <p className="text-sm text-slate-500">{error ?? t('pay.notFoundBody')}</p>
        </div>
      </div>
    )
  }

  const alreadyPaid = invoice.status === 'paid'
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between border-b border-slate-100 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="max-w-[220px] text-right text-sm font-medium text-slate-700">{value}</span>
    </div>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-3 flex justify-end"><LangSwitch tone="light" /></div>

        <div className="rounded-t-xl bg-[#0c2340] px-8 py-5">
          <p className="text-base font-semibold text-white">{t('pay.header')}</p>
        </div>

        <div className="space-y-6 rounded-b-xl border border-t-0 border-slate-200 bg-white px-8 py-8 shadow-sm">
          <div className="space-y-3">
            <Row label={t('pay.invoice')} value={invoice.number} />
            {invoice.customerName && <Row label={t('pay.billedTo')} value={invoice.customerName} />}
            {invoice.description && <Row label={t('pay.description')} value={invoice.description} />}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">{t('pay.amountDue')}</span>
              <span className="text-2xl font-bold text-[#0c2340]">{money(invoice.amount)}</span>
            </div>
          </div>

          {alreadyPaid ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <p className="font-semibold text-emerald-700">{t('pay.alreadyPaid')}</p>
              <p className="mt-1 text-sm text-emerald-600">{t('pay.thanks')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => void payByCard()}
                disabled={paying}
                className="w-full rounded-lg bg-[#0c2340] px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-[#15315a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paying ? t('pay.redirecting') : t('pay.payByCard', { amount: money(invoice.amount) })}
              </button>
              {payError && <p className="text-center text-sm text-red-600">{payError}</p>}
              <p className="text-center text-xs text-slate-400">{t('pay.secure')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
