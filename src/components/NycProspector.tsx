import { useState } from 'react'
import { addProspectLead } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n, type TKey } from '../lib/i18n'
import { NYC_AREAS, enrichProspect, searchLandlords, searchManagers, type NycArea, type NycProspect } from '../lib/nycData'
import { Button, Card, EmptyState } from './ui'

type Kind = 'manager' | 'landlord'

// Buildings managed/owned. Small firms and small landlords are the sweet spot:
// big enough to have steady turnovers, too small for an in-house crew.
const SIZES: Record<Kind, { key: TKey; min: number; max: number }[]> = {
  manager: [
    { key: 'nyc.sizeMgrSmall', min: 3, max: 15 },
    { key: 'nyc.sizeMgrMid',   min: 16, max: 60 },
    { key: 'nyc.sizeMgrLarge', min: 61, max: 400 },
  ],
  landlord: [
    { key: 'nyc.sizeOwnOne',  min: 1, max: 1 },
    { key: 'nyc.sizeOwnFew',  min: 2, max: 5 },
    { key: 'nyc.sizeOwnMore', min: 6, max: 30 },
  ],
}

export default function NycProspector() {
  const { tenantId } = useAuth()
  const { t } = useI18n()
  const [kind, setKind]       = useState<Kind>('manager')
  const [area, setArea]       = useState<NycArea>('brooklyn')
  const [sizeIdx, setSizeIdx] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<NycProspect[] | null>(null)
  const [picked, setPicked]   = useState<Record<string, boolean>>({})
  const [busy, setBusy]       = useState(false)
  const [adding, setAdding]   = useState(false)
  const [report, setReport]   = useState<{ added: number; dupes: number } | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const size = SIZES[kind][sizeIdx] ?? SIZES[kind][0]

  async function search() {
    setBusy(true); setError(null); setResults(null); setPicked({}); setReport(null)
    try {
      const rows = kind === 'manager'
        ? await searchManagers({ area, min: size.min, max: size.max, keyword })
        : await searchLandlords({ area, min: size.min, max: size.max })
      setResults(rows)
    } catch {
      setError(t('nyc.error'))
    } finally {
      setBusy(false)
    }
  }

  const selected = (results ?? []).filter(r => picked[r.ref])

  function toggleAll() {
    if (!results) return
    const allOn = results.length > 0 && results.every(r => picked[r.ref])
    setPicked(allOn ? {} : Object.fromEntries(results.map(r => [r.ref, true])))
  }

  async function addToLeads() {
    if (!tenantId || selected.length === 0) return
    setAdding(true); setError(null)
    let added = 0, dupes = 0
    for (const p of selected) {
      try {
        const extra = await enrichProspect(p).catch(() => ({ person: p.person, address: p.address, building: null }))
        const res = await addProspectLead(tenantId, {
          name: extra.person || p.company || p.person || 'Unknown',
          company: p.company,
          building: extra.building,
          external_ref: p.ref,
          phone: null,
          email: null,
          address: extra.address || p.address,
          service: p.kind === 'manager' ? t('nyc.serviceMgr') : t('nyc.serviceOwner'),
          source: 'nyc_records',
          status: 'new',
          est_value: 0,
          notes: t('nyc.leadNote', { n: p.buildings }),
        })
        if (res === 'added') added++; else dupes++
      } catch { /* skip one, keep going */ }
    }
    setReport({ added, dupes })
    setResults(rs => (rs ? rs.filter(r => !picked[r.ref]) : rs))
    setPicked({})
    setAdding(false)
  }

  const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  return (
    <>
      <Card className="mb-6 p-5">
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {(['manager', 'landlord'] as Kind[]).map(k => (
            <button key={k} onClick={() => { setKind(k); setSizeIdx(0); setResults(null) }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${kind === k ? 'bg-[#0c2340] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t(k === 'manager' ? 'nyc.kindMgr' : 'nyc.kindOwner')}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{t('nyc.area')}</span>
            <select value={area} onChange={e => setArea(e.target.value as NycArea)} className={field}>
              {NYC_AREAS.map(a => <option key={a} value={a}>{t(`nyc.area.${a}` as TKey)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t(kind === 'manager' ? 'nyc.sizeMgr' : 'nyc.sizeOwn')}
            </span>
            <select value={sizeIdx} onChange={e => setSizeIdx(Number(e.target.value))} className={field}>
              {SIZES[kind].map((s, i) => <option key={s.key} value={i}>{t(s.key)}</option>)}
            </select>
          </label>
          {kind === 'manager' ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{t('nyc.keyword')}</span>
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t('nyc.keywordPh')} className={field} />
            </label>
          ) : <div className="hidden sm:block" />}
          <Button onClick={() => void search()} disabled={busy}>{busy ? t('prospect.searching') : t('prospect.search')}</Button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{t(kind === 'manager' ? 'nyc.hintMgr' : 'nyc.hintOwner')}</p>
      </Card>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {report && (
        <div className="mb-4 text-sm font-medium text-emerald-600">
          {t('prospect.added', { n: report.added })}
          {report.dupes > 0 && <span className="ml-2 font-normal text-slate-500">{t('nyc.dupes', { n: report.dupes })}</span>}
        </div>
      )}

      {results && (
        results.length === 0 ? (
          <Card><EmptyState message={t('nyc.empty')} /></Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <button onClick={toggleAll} className="text-xs font-medium text-blue-600 hover:underline">{t('prospect.selectAll')}</button>
              <span className="text-xs text-slate-500">{t('prospect.results', { n: results.length })}</span>
              <Button size="sm" onClick={() => void addToLeads()} disabled={adding || selected.length === 0}>
                {adding ? t('prospect.adding') : t('prospect.addSelected', { n: selected.length })}
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {results.map(p => (
                <label key={p.ref} className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <input type="checkbox" checked={!!picked[p.ref]}
                    onChange={e => setPicked(s => ({ ...s, [p.ref]: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{p.company || p.person}</div>
                    <div className="truncate text-xs text-slate-500">{p.address}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {t('nyc.buildings', { n: p.buildings })}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        )
      )}

      {!results && !busy && <p className="text-sm text-slate-400">{t('nyc.noEmailNote')}</p>}
    </>
  )
}
