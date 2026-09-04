import { useI18n, type TKey } from '../lib/i18n'
import { Card, PageHeader } from '../components/ui'

interface Section {
  n: number
  icon: string
  steps: number
  hasTip: boolean
}

const sections: Section[] = [
  { n: 1, icon: '👤', steps: 4, hasTip: true },
  { n: 2, icon: '🔧', steps: 4, hasTip: true },
  { n: 3, icon: '📄', steps: 4, hasTip: true },
  { n: 4, icon: '💰', steps: 3, hasTip: false },
  { n: 5, icon: '✅', steps: 4, hasTip: true },
  { n: 6, icon: '🔄', steps: 4, hasTip: true },
  { n: 7, icon: '⚙️', steps: 4, hasTip: false },
  { n: 8, icon: '🌐', steps: 3, hasTip: true },
]

const ADVISOR_EMAIL = 'mike@trykona.ai'

export default function Guide() {
  const { t } = useI18n()
  // The advisor address is a link, so the sentence is split around it.
  const [before, after] = t('guide.helpBody', { email: '\u0000' }).split('\u0000')

  return (
    <>
      <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} />

      <div className="space-y-5">
        {sections.map(s => (
          <Card key={s.n} className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0c2340] text-lg">
                {s.icon}
              </div>

              <div className="flex-1">
                <h2 className="mb-3 text-base font-semibold text-slate-900">
                  <span className="mr-2 text-slate-400">{t('guide.step', { n: s.n })}</span>
                  {t(`guide.s${s.n}.title` as TKey)}
                </h2>

                <ol className="space-y-1.5">
                  {Array.from({ length: s.steps }, (_, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                        {i + 1}
                      </span>
                      {t(`guide.s${s.n}.${i + 1}` as TKey)}
                    </li>
                  ))}
                </ol>

                {s.hasTip && (
                  <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                    <span className="font-medium">{t('guide.tip')}</span>
                    {t(`guide.s${s.n}.tip` as TKey)}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        <Card className="bg-[#0c2340] p-6">
          <p className="text-sm font-medium text-white">{t('guide.help')}</p>
          <p className="mt-1 text-sm text-slate-300">
            {before}
            <a href={`mailto:${ADVISOR_EMAIL}`} className="text-blue-300 underline underline-offset-2">
              {ADVISOR_EMAIL}
            </a>
            {after}
          </p>
        </Card>
      </div>
    </>
  )
}
