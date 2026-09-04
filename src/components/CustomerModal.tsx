import { useState } from 'react'
import { saveCustomer } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Customer, Lang } from '../lib/types'
import { FormActions, Modal, SelectField, TextAreaField, TextField } from './ui'

export default function CustomerModal({ onClose, onSaved, customer }: {
  onClose: () => void; onSaved: () => void; customer?: Customer
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [name, setName]               = useState(customer?.name ?? '')
  const [contactName, setContactName] = useState(customer?.contact_name ?? '')
  const [phone, setPhone]             = useState(customer?.phone ?? '')
  const [email, setEmail]             = useState(customer?.email ?? '')
  const [address, setAddress]         = useState(customer?.address ?? '')
  const [status, setStatus]           = useState<Customer['status']>(customer?.status ?? 'active')
  const [language, setLanguage]       = useState<Lang>(customer?.language ?? 'en')
  const [lastService, setLastService] = useState(customer?.last_service_date ?? '')
  const [notes, setNotes]             = useState(customer?.notes ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)
    setError(null)
    try {
      await saveCustomer(tenantId, {
        name, contact_name: contactName, phone, email, address, status, language,
        last_service_date: lastService || null, notes,
      }, customer?.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <Modal title={customer ? t('m.editCustomer') : t('m.newCustomer')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField label={t('f.customerName')} value={name} onChange={e => setName(e.target.value)} required placeholder={t('f.customerNamePh')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('f.contactName')} value={contactName} onChange={e => setContactName(e.target.value)} placeholder={t('f.contactNamePh')} />
          <TextField label={t('f.phone')} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('f.phonePh')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('f.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('f.emailPh')} />
          <SelectField label={t('lang.label')} value={language} onChange={e => setLanguage(e.target.value as Lang)}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </SelectField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t('common.status')} value={status} onChange={e => setStatus(e.target.value as Customer['status'])}>
            <option value="active">{t('status.active')}</option>
            <option value="due_for_service">{t('status.due_for_service')}</option>
            <option value="win_back">{t('status.win_back')}</option>
          </SelectField>
          <TextField label={t('f.lastServiceDate')} type="date" value={lastService} onChange={e => setLastService(e.target.value)} />
        </div>
        <TextField label={t('f.address')} value={address} onChange={e => setAddress(e.target.value)} placeholder={t('f.addressPh')} />
        <TextAreaField label={t('f.notes')} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('f.notesPh')} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} label={customer ? t('common.saveChanges') : t('m.addCustomer')} />
      </form>
    </Modal>
  )
}
