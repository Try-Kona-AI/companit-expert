import { useEffect, useState } from 'react'
import { listCustomers, saveJob } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Customer, Job } from '../lib/types'
import { FormActions, Modal, SelectField, TextAreaField, TextField } from './ui'

export default function JobModal({ onClose, onSaved, job }: {
  onClose: () => void; onSaved: () => void; job?: Job
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [customerId, setCustomerId]   = useState(job?.customer_id ?? '')
  const [title, setTitle]             = useState(job?.title ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [status, setStatus]           = useState<Job['status']>(job?.status ?? 'quote')
  const [amount, setAmount]           = useState(job?.amount?.toString() ?? '')
  const [scheduled, setScheduled]     = useState(job?.scheduled_date ?? '')

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
      await saveJob(tenantId, {
        customer_id: customerId, title, description, status,
        amount: parseFloat(amount) || 0, scheduled_date: scheduled || null,
      }, job?.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <Modal title={job ? t('m.editJob') : t('m.newJob')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <SelectField label={t('common.customer')} value={customerId} onChange={e => setCustomerId(e.target.value)} required>
          <option value="">{t('common.selectCustomer')}</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <TextField label={t('f.jobTitle')} value={title} onChange={e => setTitle(e.target.value)} required placeholder={t('f.jobTitlePh')} />
        <TextAreaField label={t('f.description')} value={description} onChange={e => setDescription(e.target.value)} placeholder={t('f.jobDescPh')} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t('common.status')} value={status} onChange={e => setStatus(e.target.value as Job['status'])}>
            <option value="quote">{t('status.quote')}</option>
            <option value="scheduled">{t('status.scheduled')}</option>
            <option value="in_progress">{t('status.in_progress')}</option>
            <option value="done">{t('status.done')}</option>
          </SelectField>
          <TextField label={t('f.amount')} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <TextField label={t('f.scheduledDate')} type="date" value={scheduled} onChange={e => setScheduled(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} label={job ? t('common.saveChanges') : t('m.addJob')} />
      </form>
    </Modal>
  )
}
