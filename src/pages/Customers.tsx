import { useEffect, useState } from 'react'
import { deleteCustomer, listCustomers } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Customer } from '../lib/types'
import { shortDate } from '../lib/format'
import {
  Badge, Button, Card, DeleteButton, EmptyState, ErrorNote, Loading, PageHeader,
} from '../components/ui'
import CustomerModal from '../components/CustomerModal'

export default function Customers() {
  const { tenantId } = useAuth()
  const { t, locale } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [modal, setModal]         = useState<'new' | Customer | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)

  async function load() {
    if (!tenantId) return
    try {
      setCustomers(await listCustomers(tenantId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])

  async function remove(c: Customer) {
    if (!confirm(t('cust.confirmDelete', { name: c.name }))) return
    setDeleting(c.id)
    await deleteCustomer(c.id)
    await load()
    setDeleting(null)
  }

  if (loading) return <Loading />
  if (error)   return <ErrorNote message={error} />

  return (
    <>
      <PageHeader
        title={t('cust.title')}
        subtitle={t('cust.subtitle')}
        action={<Button onClick={() => setModal('new')}>{t('cust.new')}</Button>}
      />
      <Card>
        {customers.length === 0 ? (
          <EmptyState message={t('cust.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">{t('common.customer')}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t('cust.colContact')}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t('cust.colLastService')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{c.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          {c.language}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">{c.address}</div>
                      {c.phone && <div className="text-xs text-slate-400 sm:hidden">{c.phone}</div>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                      <div>{c.contact_name}</div>
                      <div className="text-xs text-slate-400">{c.phone}</div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{shortDate(c.last_service_date, locale)}</td>
                    <td className="px-4 py-3"><Badge status={c.status} kind="customer" /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setModal(c)}>{t('common.edit')}</Button>
                        <DeleteButton onClick={() => void remove(c)} disabled={deleting === c.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal === 'new' && <CustomerModal onClose={() => setModal(null)} onSaved={load} />}
      {modal && modal !== 'new' && <CustomerModal customer={modal} onClose={() => setModal(null)} onSaved={load} />}
    </>
  )
}
