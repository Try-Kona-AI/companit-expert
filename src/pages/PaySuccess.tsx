import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export default function PaySuccess() {
  const [params] = useSearchParams()
  const { t } = useI18n()
  const invoiceId = params.get('invoice')

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-t-xl bg-[#0c2340] px-8 py-5">
          <p className="text-base font-semibold text-white">{t('pay.confirmed')}</p>
        </div>

        <div className="space-y-4 rounded-b-xl border border-t-0 border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
          <div className="flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('pay.received')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('pay.receivedBody')}</p>
          </div>

          {invoiceId && (
            <p className="inline-block rounded bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-400">
              {t('pay.ref', { id: invoiceId })}
            </p>
          )}

          <p className="text-sm text-slate-500">{t('pay.closePage')}</p>
        </div>
      </div>
    </div>
  )
}
