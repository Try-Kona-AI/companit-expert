import { useState } from 'react'
import { supabase, LIVE } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { Button, Card, PageHeader } from '../components/ui'

type Dir = 'auto' | 'en' | 'ru'

export default function Translate() {
  const { t } = useI18n()
  const [text, setText]         = useState('')
  const [dir, setDir]           = useState<Dir>('auto')
  const [result, setResult]     = useState('')
  const [detected, setDetected] = useState<'en' | 'ru' | null>(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  async function run() {
    const source = text.trim()
    if (!source) { setError(t('translate.empty')); return }
    setBusy(true); setError(null); setResult(''); setDetected(null); setCopied(false)
    try {
      if (!LIVE || !supabase) {
        setResult(t('translate.demoNote'))
        return
      }
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { text: source, to: dir === 'auto' ? undefined : dir },
      })
      if (error) throw error
      const d = data as { translated?: string; detected?: 'en' | 'ru'; error?: string }
      if (!d?.translated) throw new Error(d?.error || 'no_result')
      setResult(d.translated)
      setDetected(d.detected ?? null)
    } catch {
      setError(t('translate.error'))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked, ignore */ }
  }

  const dirs: { key: Dir; label: string }[] = [
    { key: 'auto', label: t('translate.auto') },
    { key: 'en',   label: t('translate.toEn') },
    { key: 'ru',   label: t('translate.toRu') },
  ]
  const langName = (l: 'en' | 'ru') => (l === 'ru' ? t('translate.langRu') : t('translate.langEn'))

  return (
    <>
      <PageHeader title={t('translate.title')} subtitle={t('translate.subtitle')} />

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{t('translate.direction')}:</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {dirs.map(d => (
              <button
                key={d.key}
                onClick={() => setDir(d.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  dir === d.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">{t('translate.sourceLabel')}</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={t('translate.placeholder')}
              rows={9}
              className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-500">{t('translate.resultLabel')}</label>
              {detected && (
                <span className="text-[11px] text-slate-400">{t('translate.detected', { lang: langName(detected) })}</span>
              )}
            </div>
            <div className="min-h-[13.5rem] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              {result
                ? <p className="whitespace-pre-wrap">{result}</p>
                : <p className="text-slate-400">{t('translate.resultPlaceholder')}</p>}
            </div>
            {result && (
              <button onClick={() => void copy()} className="mt-2 text-xs font-medium text-blue-600 hover:underline">
                {copied ? t('translate.copied') : t('translate.copy')}
              </button>
            )}
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? t('translate.translating') : t('translate.button')}
          </Button>
          {(text || result) && (
            <button
              onClick={() => { setText(''); setResult(''); setDetected(null); setError(null) }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              {t('translate.clear')}
            </button>
          )}
        </div>

        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">{t('translate.hint')}</p>
      </Card>
    </>
  )
}
