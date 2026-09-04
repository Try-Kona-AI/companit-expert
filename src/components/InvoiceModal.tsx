import { useEffect, useState } from 'react'
import { listCustomers, saveInvoice } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Customer, Invoice } from '../lib/types'
import { plusDays } from '../lib/format'
import { FormActions, Modal, SelectField, TextAreaField, TextField } from './ui'

export default function InvoiceModal({ onClose, onSaved, invoice }: {
  onClose: () => void; onSaved: () => void; invoice?: Invoice
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [customerId, setCustomerId]   = useState(invoice?.customer_id ?? '')
  const [description, setDescription] = useState(invoice?.description ?? '')
  const [amount, setAmount]           = useState(invoice?.amount?.toString() ?? '')
  const [dueDate, setDueDate]         = useState(invoice?.due_date ?? plusDays(14))
  const [status, setStatus]           = useState<Invoice['status']>(invoice?.status ?? 'draft')

  useEffect(() => {
    if (!tenantId) return
    void listCustomers(tenantId).then(setCustomers)
  }, [tenantId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)
    setError(null)
    try {
      await saveInvoice(tenantId, {
        customer_id: customerId, description, amount: parseFloat(amount) || 0,
        due_date: dueDate, status,
      }, invoice?.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <Modal title={invoice ? t('m.editInvoice') : t('m.newInvoice')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <SelectField label={t('common.customer')} value={customerId} onChange={e => setCustomerId(e.target.value)} required>
          <option value="">{t('common.selectCustomer')}</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <TextAreaField label={t('f.description')} value={description} onChange={e => setDescription(e.target.value)} placeholder={t('f.invoiceDescPh')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('f.amount')} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
          <TextField label={t('f.dueDate')} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <SelectField label={t('common.status')} value={status} onChange={e => setStatus(e.target.value as Invoice['status'])}>
          <option value="draft">{t('status.draft')}</option>
          <option value="sent">{t('status.sent')}</option>
          <option value="overdue">{t('status.overdue')}</option>
          <option value="paid">{t('status.paid')}</option>
        </SelectField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} label={invoice ? t('common.saveChanges') : t('m.createInvoice')} />
      </form>
    </Modal>
  )
}
