import { useState } from 'react'
import { createCampaign, patchCampaign, saveSteps, type StepInput } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { MERGE_TAGS, renderOutreach, starterSteps, type MergeContext } from '../lib/outreach'
import type { Campaign, CampaignAudience, CampaignStep, Lang, Lead } from '../lib/types'
import { Button, DeleteButton, FormActions, Modal, SelectField, TextField } from './ui'

const SAMPLE: Pick<Lead, 'name' | 'company' | 'building'> = {
  name: 'Maria Gonzalez', company: 'Parkside Management LLC', building: '412 Ocean Ave, Brooklyn',
}

export default function CampaignModal({ campaign, steps, preset, ctx, onClose, onSaved }: {
  campaign?: Campaign
  steps?: CampaignStep[]
  preset?: CampaignAudience
  ctx: MergeContext
  onClose: () => void
  onSaved: () => void
}) {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const startAudience = campaign?.audience ?? preset ?? 'pm'
  const startLang = campaign?.language ?? 'en'

  const [name, setName]         = useState(campaign?.name ?? t(startAudience === 'landlord' ? 'camp.nameLandlord' : 'camp.namePm'))
  const [audience, setAudience] = useState<CampaignAudience>(startAudience)
  const [language, setLanguage] = useState<Lang>(startLang)
  const [cap, setCap]           = useState(String(campaign?.daily_cap ?? 30))
  const [draft, setDraft]       = useState<StepInput[]>(
    steps?.length ? steps.map(s => ({ delay_days: s.delay_days, subject: s.subject, body: s.body }))
                  : starterSteps(startAudience, startLang),
  )
  const [touched, setTouched]   = useState(Boolean(steps?.length))
  const [preview, setPreview]   = useState(0)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Until the sequence is edited, switching audience/language swaps in the
  // matching starter copy.
  function retarget(a: CampaignAudience, l: Lang) {
    setAudience(a); setLanguage(l)
    if (!touched) setDraft(starterSteps(a, l))
  }

  function editStep(i: number, patch: Partial<StepInput>) {
    setTouched(true)
    setDraft(d => d.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    if (draft.length === 0 || draft.some(s => !s.subject.trim() || !s.body.trim())) {
      setError(t('camp.stepsRequired')); return
    }
    setSaving(true); setError(null)
    try {
      const input = { name: name.trim(), audience, language, daily_cap: Math.min(200, Math.max(1, parseInt(cap) || 30)) }
      if (campaign) {
        await patchCampaign(campaign.id, input)
        await saveSteps(tenantId, campaign.id, draft)
      } else {
        await createCampaign(tenantId, input, draft)
      }
      onSaved(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setSaving(false)
  }

  const shown = draft[Math.min(preview, draft.length - 1)]
  const pctx = { ...ctx, lang: language }
  const area = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'

  return (
    <Modal title={campaign ? t('camp.edit') : t('camp.newTitle')} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <TextField label={t('camp.name')} value={name} onChange={e => setName(e.target.value)} required />
          <SelectField label={t('camp.audience')} value={audience} onChange={e => retarget(e.target.value as CampaignAudience, language)}>
            <option value="pm">{t('camp.aud.pm')}</option>
            <option value="landlord">{t('camp.aud.landlord')}</option>
            <option value="any">{t('camp.aud.any')}</option>
          </SelectField>
          <SelectField label={t('camp.language')} value={language} onChange={e => retarget(audience, e.target.value as Lang)}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </SelectField>
          <TextField label={t('camp.cap')} type="number" min="1" max="200" value={cap} onChange={e => setCap(e.target.value)} />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {t('camp.tagsHint')}{' '}
          {MERGE_TAGS.map(tag => <code key={tag} className="mr-1.5 rounded bg-white px-1 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">{tag}</code>)}
        </div>

        <div className="flex flex-col gap-3">
          {draft.map((s, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {t('camp.step', { n: i + 1 })}
                  <span className="text-xs font-normal text-slate-500">
                    {i === 0 ? t('camp.sendAfterEnroll') : t('camp.sendAfterPrev')}
                  </span>
                  <input type="number" min="0" value={s.delay_days}
                    onChange={e => editStep(i, { delay_days: Number(e.target.value) })}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                  <span className="text-xs font-normal text-slate-500">{t('camp.days')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPreview(i)} className="text-xs font-medium text-blue-600 hover:underline">{t('camp.preview')}</button>
                  {draft.length > 1 && <DeleteButton onClick={() => { setTouched(true); setDraft(d => d.filter((_, j) => j !== i)) }} />}
                </div>
              </div>
              <input value={s.subject} onChange={e => editStep(i, { subject: e.target.value })}
                placeholder={t('camp.subject')} className={`${area} mb-2`} />
              <textarea value={s.body} onChange={e => editStep(i, { body: e.target.value })} rows={7} className={`${area} resize-y`} />
            </div>
          ))}
          {draft.length < 6 && (
            <div>
              <Button size="sm" variant="secondary" onClick={() => {
                setTouched(true)
                setDraft(d => [...d, { delay_days: 5, subject: d[0] ? `Re: ${d[0].subject}` : '', body: '' }])
              }}>{t('camp.addStep')}</Button>
            </div>
          )}
        </div>

        {shown && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-700">
              {t('camp.previewTitle', { n: Math.min(preview, draft.length - 1) + 1 })}
            </div>
            <div className="text-sm font-semibold text-slate-800">{renderOutreach(shown.subject, SAMPLE, pctx)}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{renderOutreach(shown.body, SAMPLE, pctx)}</pre>
            <p className="mt-3 text-[11px] text-slate-400">{t('camp.footerNote')}</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} label={campaign ? t('common.saveChanges') : t('camp.create')} />
      </form>
    </Modal>
  )
}
