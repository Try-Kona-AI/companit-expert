import { useState } from 'react'
import { supabase, LIVE } from '../lib/supabase'
import { saveLead } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { Button, Card, EmptyState, PageHeader } from '../components/ui'

type Prospect = {
  id: string; name: string; title: string; company: string
  email: string | null; phone: string | null; city: string; linkedin: string; locked: boolean
}
type Size = 'small' | 'mid' | 'any'

const SIZE_RANGES: Record<Size, string[] | undefined> = {
  small: ['1,10', '11,20', '21,50'],
  mid: ['51,100', '101,200'],
  any: undefined,
}

export default function Prospecting() {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [keywords, setKeywords] = useState('property management')
  const [location, setLocation] = useState('')
  const [size, setSize]         = useState<Size>('small')
  const [results, setResults]   = useState<Prospect[] | null>(null)
  const [picked, setPicked]     = useState<Record<string, boolean>>({})
  const [busy, setBusy]         = useState(false)
  const [adding, setAdding]     = useState(false)
  const [addedCount, setAddedCount] = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const [needsKey, setNeedsKey] = useState(false)

  async function search() {
    setBusy(true); setError(null); setResults(null); setPicked({}); setAddedCount(0); setNeedsKey(false)
    try {
      if (!LIVE || !supabase) { setNeedsKey(true); return }
      const { data, error } = await supabase.functions.invoke('apollo-search', {
        body: {
          keywords: keywords.trim() || undefined,
          locations: location.trim() ? [location.trim()] : undefined,
          sizes: SIZE_RANGES[size],
          perPage: 25,
        },
      })
      if (error) throw error
      const d = data as { needsKey?: boolean; people?: Prospect[]; error?: string }
      if (d?.needsKey) { setNeedsKey(true); return }
      if (d?.error) throw new Error(d.error)
      setResults(d.people ?? [])
    } catch {
      setError(t('prospect.error'))
    } finally {
      setBusy(false)
    }
  }

  const selectedIds = Object.keys(picked).filter(id => picked[id])

  function toggleAll() {
    if (!results) return
    const allOn = results.length > 0 && results.every(r => picked[r.id])
    setPicked(allOn ? {} : Object.fromEntries(results.map(r => [r.id, true])))
  }

  async function addToLeads() {
    if (!results || !tenantId || selectedIds.length === 0) return
    setAdding(true); setError(null)
    let n = 0
    for (const p of results.filter(r => picked[r.id])) {
      let email = p.email, phone = p.phone
      if (p.locked && supabase && LIVE) {
        try {
          const { data } = await supabase.functions.invoke('apollo-search', {
            body: { action: 'enrich', id: p.id, first_name: p.name.split(' ')[0], last_name: p.name.split(' ').slice(1).join(' '), company: p.company },
          })
          const r = (data as { person?: Prospect })?.person
          if (r) { email = r.email ?? email; phone = r.phone ?? phone }
        } catch { /* keep what we have */ }
      }
      try {
        await saveLead(tenantId, {
          name: p.name || p.company,
          phone: phone ?? '',
          email: email ?? '',
          address: p.city,
          service: p.company,
          source: 'pm_outreach',
          status: 'new',
          est_value: 0,
          notes: [p.title, 'Apollo', p.linkedin].filter(Boolean).join(' · '),
        })
        n++
      } catch { /* skip one, keep going */ }
    }
    setAddedCount(n)
    setResults(rs => (rs ? rs.filter(r => !picked[r.id]) : rs))
    setPicked({})
    setAdding(false)
  }

  return (
    <>
      <PageHeader title={t('prospect.title')} subtitle={t('prospect.subtitle')} />

      <Card className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('prospect.keywords')}</span>
            <input value={keywords} onChange={e => setKeywords(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('prospect.location')}</span>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('prospect.locationHint')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('prospect.size')}</span>
            <select value={size} onChange={e => setSize(e.target.value as Size)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
              <option value="small">{t('prospect.sizeSmall')}</option>
              <option value="mid">{t('prospect.sizeMid')}</option>
              <option value="any">{t('prospect.sizeAny')}</option>
            </select>
          </label>
          <Button onClick={() => void search()} disabled={busy}>{busy ? t('prospect.searching') : t('prospect.search')}</Button>
        </div>
      </Card>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {addedCount > 0 && <div className="mb-4 text-sm font-medium text-emerald-600">{t('prospect.added', { n: addedCount })}</div>}

      {needsKey && (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-800">{t('prospect.needKeyTitle')}</div>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{t('prospect.needKey')}</p>
        </Card>
      )}

      {results && !needsKey && (
        results.length === 0 ? (
          <Card><EmptyState message={t('prospect.empty')} /></Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <button onClick={toggleAll} className="text-xs font-medium text-blue-600 hover:underline">{t('prospect.selectAll')}</button>
              <span className="text-xs text-slate-500">{t('prospect.results', { n: results.length })}</span>
              <Button size="sm" onClick={() => void addToLeads()} disabled={adding || selectedIds.length === 0}>
                {adding ? t('prospect.adding') : t('prospect.addSelected', { n: selectedIds.length })}
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {results.map(p => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <input type="checkbox" checked={!!picked[p.id]}
                    onChange={e => setPicked(s => ({ ...s, [p.id]: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="text-sm font-semibold text-slate-800">{p.name || p.company}</span>
                      {p.title && <span className="text-xs text-slate-500">{p.title}</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {p.company}{p.city ? ` · ${p.city}` : ''}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                      {p.phone && <span className="text-slate-600">{p.phone}</span>}
                      {p.email
                        ? <span className="text-slate-600">{p.email}</span>
                        : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{t('prospect.locked')}</span>}
                      {p.linkedin && <a href={p.linkedin} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">LinkedIn</a>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Card>
        )
      )}

      {!results && !needsKey && !busy && (
        <p className="text-sm text-slate-400">{t('prospect.hint')}</p>
      )}
    </>
  )
}
