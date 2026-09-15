import { useState } from 'react'
import { saveLead } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import type { Lead } from '../lib/types'
import { LEAD_SOURCES, LEAD_STAGES } from '../lib/types'
import { FormActions, Modal, SelectField, TextAreaField, TextField } from './ui'

export default function LeadModal({ onClose, onSaved, lead }: {
  onClose: () => void; onSaved: () => void; lead?: Lead
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [name, setName]         = useState(lead?.name ?? '')
  const [phone, setPhone]       = useState(lead?.phone ?? '')
  const [email, setEmail]       = useState(lead?.email ?? '')
  const [service, setService]   = useState(lead?.service ?? '')
  const [address, setAddress]   = useState(lead?.address ?? '')
  const [source, setSource]     = useState<Lead['source']>(lead?.source ?? 'google_lsa')
  const [status, setStatus]     = useState<Lead['status']>(lead?.status ?? 'new')
  const [estValue, setEstValue] = useState(lead?.est_value ? String(lead.est_value) : '')
  const [notes, setNotes]       = useState(lead?.notes ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true); setError(null)
    try {
      await saveLead(tenantId, {
        name, phone: phone || null, email: email || null, address: address || null,
        service: service || null, source, status,
        est_value: parseFloat(estValue) || 0, notes: notes || null,
      }, lead?.id)
      onSaved(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  return (
    <Modal title={lead ? t('m.editLead') : t('m.newLead')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField label={t('f.leadName')} value={name} onChange={e => setName(e.target.value)} required placeholder={t('f.leadNamePh')} />
        <TextField label={t('f.service')} value={service} onChange={e => setService(e.target.value)} placeholder={t('f.servicePh')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('f.phone')} value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('f.phonePh')} />
          <TextField label={t('f.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('f.emailPh')} />
        </div>
        <TextField label={t('f.address')} value={address} onChange={e => setAddress(e.target.value)} placeholder={t('f.addressPh')} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t('f.source')} value={source} onChange={e => setSource(e.target.value as Lead['source'])}>
            {LEAD_SOURCES.map(s => <option key={s} value={s}>{t(`leadsrc.${s}` as TKey)}</option>)}
          </SelectField>
          <SelectField label={t('common.status')} value={status} onChange={e => setStatus(e.target.value as Lead['status'])}>
            {LEAD_STAGES.map(s => <option key={s} value={s}>{t(`status.${s}` as TKey)}</option>)}
          </SelectField>
        </div>
        <TextField label={t('f.estValue')} type="number" min="0" step="0.01" value={estValue} onChange={e => setEstValue(e.target.value)} placeholder="0.00" />
        <TextAreaField label={t('f.notes')} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('f.notesPh')} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} label={lead ? t('common.saveChanges') : t('m.addLead')} />
      </form>
    </Modal>
  )
}
