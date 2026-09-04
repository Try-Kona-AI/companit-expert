import { useEffect, useState } from 'react'
import { getSettings, getTenant, saveSettings, saveTenant } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Lang, SettingsDraft } from '../lib/types'
import {
  Button, Card, ErrorNote, LangSwitch, Loading, PageHeader, TextAreaField, TextField,
} from '../components/ui'

const EMPTY: SettingsDraft = {
  zelle_contact: '', bank_name: '', bank_routing: '', bank_account: '',
  mailing_name: '', mailing_address: '', contact_phone: '', other_instructions: '',
}

function PaymentPreview({ d }: { d: SettingsDraft }) {
  const { t } = useI18n()
  const hasZelle = d.zelle_contact?.trim()
  const hasBank  = d.bank_name?.trim() && d.bank_routing?.trim() && d.bank_account?.trim()
  const hasMail  = d.mailing_name?.trim() && d.mailing_address?.trim()
  const hasOther = d.other_instructions?.trim()

  if (!hasZelle && !hasBank && !hasMail && !hasOther) {
    return <p className="text-sm italic text-slate-400">{t('set.previewEmpty')}</p>
  }

  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">{t('set.howToPay')}</p>

      {hasZelle && (
        <div>
          <p className="font-medium">Zelle</p>
          <p className="text-slate-500">
            {t('set.zelleSendTo')} <span className="font-mono text-slate-800">{d.zelle_contact}</span>
          </p>
        </div>
      )}

      {hasBank && (
        <div>
          <p className="font-medium">{t('set.achTitle')}</p>
          <p className="text-slate-500">{t('set.bankLabel')} {d.bank_name}</p>
          <p className="text-slate-500">{t('set.routingLabel')} <span className="font-mono text-slate-800">{d.bank_routing}</span></p>
          <p className="text-slate-500">{t('set.accountLabel')} <span className="font-mono text-slate-800">{d.bank_account}</span></p>
        </div>
      )}

      {hasBank && (
        <div>
          <p className="font-medium">{t('set.wireTitle')}</p>
          <p className="text-slate-500">{t('set.wireNote')}</p>
        </div>
      )}

      {hasMail && (
        <div>
          <p className="font-medium">{t('set.checkTitle')}</p>
          <p className="text-slate-500">{t('set.payableTo')} <span className="text-slate-800">{d.mailing_name}</span></p>
          <p className="whitespace-pre-line text-slate-500">{d.mailing_address}</p>
        </div>
      )}

      {d.contact_phone?.trim() && (
        <p className="text-slate-500">{t('set.questions', { phone: d.contact_phone })}</p>
      )}

      {hasOther && <p className="whitespace-pre-line text-slate-600">{d.other_instructions}</p>}
    </div>
  )
}

export default function Settings() {
  const { tenantId } = useAuth()
  const { t, lang } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [draft, setDraft]     = useState<SettingsDraft>(EMPTY)
  const [business, setBusiness] = useState('')
  const [owner, setOwner]       = useState('')

  useEffect(() => {
    if (!tenantId) return
    void (async () => {
      try {
        const [s, tenant] = await Promise.all([getSettings(tenantId), getTenant(tenantId)])
        setDraft({ ...EMPTY, ...s })
        setBusiness(tenant?.name ?? '')
        setOwner(tenant?.owner_name ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setLoading(false)
    })()
  }, [tenantId])

  function set(field: keyof SettingsDraft) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(d => ({ ...d, [field]: e.target.value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await Promise.all([
        saveSettings(tenantId, draft),
        saveTenant(tenantId, {
          name: business, owner_name: owner, default_language: lang as Lang,
        }),
      ])
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  if (loading) return <Loading />

  return (
    <>
      <PageHeader title={t('set.title')} subtitle={t('set.subtitle')} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">{t('set.company')}</h2>
            <div className="flex flex-col gap-3.5">
              <TextField label={t('set.businessName')} value={business} onChange={e => setBusiness(e.target.value)} />
              <TextField label={t('set.ownerName')} value={owner} onChange={e => setOwner(e.target.value)} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">{t('set.langSection')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('set.langNote')}</p>
            <LangSwitch tone="light" />
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">{t('set.paymentSection')}</h2>
            <div className="flex flex-col gap-3.5">
              <TextField label={t('set.zelle')} value={draft.zelle_contact ?? ''} onChange={set('zelle_contact')} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField label={t('set.bankName')} value={draft.bank_name ?? ''} onChange={set('bank_name')} />
                <TextField label={t('set.routing')} value={draft.bank_routing ?? ''} onChange={set('bank_routing')} />
                <TextField label={t('set.account')} value={draft.bank_account ?? ''} onChange={set('bank_account')} />
              </div>
              <TextField label={t('set.mailingName')} value={draft.mailing_name ?? ''} onChange={set('mailing_name')} />
              <TextAreaField label={t('set.mailingAddress')} value={draft.mailing_address ?? ''} onChange={set('mailing_address')} />
              <TextField label={t('set.contactPhone')} value={draft.contact_phone ?? ''} onChange={set('contact_phone')} />
              <TextAreaField label={t('set.other')} value={draft.other_instructions ?? ''} onChange={set('other_instructions')} />
            </div>

            {error && <div className="mt-4"><ErrorNote message={error} /></div>}

            <div className="mt-5 flex items-center gap-3">
              <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('set.saveBtn')}</Button>
              {saved && <span className="text-sm font-medium text-emerald-600">{t('set.saved')} ✓</span>}
            </div>
          </Card>
        </form>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">{t('set.previewTitle')}</h2>
          <PaymentPreview d={draft} />
        </Card>
      </div>
    </>
  )
}
