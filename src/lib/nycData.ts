/**
 * NYC building records (HPD Multiple Dwelling Registrations, NYC Open Data).
 * Every building with 3+ units must register its owner and managing agent with
 * the city, so this is a free, public list of who manages and owns rental
 * buildings, with business mailing addresses. No emails: those come from
 * Apollo or from the owner's own research.
 *
 * Public, keyless, CORS-open API, so it is called straight from the browser.
 */

const BASE = 'https://data.cityofnewyork.us/resource'
const CONTACTS = 'feu5-w2e2'      // registration contacts (owner, agent, ...)
const REGISTRATIONS = 'tesw-yqqr' // registration -> building address

export type NycArea = 'brooklyn' | 'queens' | 'manhattan' | 'bronx' | 'staten' | 'longisland' | 'all'

// Filtered on the contact's business ZIP, i.e. where their office or mailing
// address is. A good proxy for "local" without a cross-dataset join.
const AREA_ZIPS: Record<Exclude<NycArea, 'all'>, string[]> = {
  brooklyn:   ['112'],
  queens:     ['110', '111', '113', '114', '116'],
  manhattan:  ['100', '101', '102'],
  bronx:      ['104'],
  staten:     ['103'],
  longisland: ['115', '117', '118', '119'],
}
export const NYC_AREAS: NycArea[] = ['brooklyn', 'queens', 'manhattan', 'bronx', 'staten', 'longisland', 'all']

export interface NycProspect {
  /** Stable de-dup key, stored as leads.external_ref */
  ref: string
  kind: 'manager' | 'landlord'
  company: string | null
  person: string | null
  address: string
  buildings: number
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

function areaWhere(area: NycArea): string {
  if (area === 'all') return "businesszip IS NOT NULL"
  return '(' + AREA_ZIPS[area].map(p => `starts_with(businesszip, ${q(p)})`).join(' OR ') + ')'
}

/**
 * The registry spells the same firm several ways ("MRE PROPERTY MANAGEMENT",
 * "MRE Property Management "). Collapse rows sharing a ref, summing buildings.
 */
function merge(rows: NycProspect[]): NycProspect[] {
  const byRef = new Map<string, NycProspect>()
  for (const r of rows) {
    const prev = byRef.get(r.ref)
    if (prev) prev.buildings += r.buildings
    else byRef.set(r.ref, { ...r })
  }
  return [...byRef.values()].sort((a, b) => b.buildings - a.buildings)
}

async function soql<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`${BASE}/${dataset}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`NYC data ${resp.status}`)
  return (await resp.json()) as T[]
}

const title = (s: string | undefined | null) =>
  (s ?? '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).trim()

const KEEP_UPPER = new Set(['LLC', 'LP', 'LLP', 'PC', 'NY', 'NYC', 'USA', 'II', 'III', 'IV'])
const PROPER: Record<string, string> = { ltd: 'Ltd', mgmt: 'Mgmt', bldg: 'Bldg', svcs: 'Svcs' }

/**
 * City records are often ALL CAPS, which reads as spam in an email.
 * "KOTSONIS ORGANIZATION LLC." -> "Kotsonis Organization LLC".
 * Names that already use mixed case are left exactly as registered.
 */
export function companyCase(raw: string): string {
  const s = raw.trim().replace(/[.,\s]+$/, '')
  if (/[a-z]/.test(s)) return s
  return s.toLowerCase().replace(/[a-z0-9&']+/g, w => {
    const up = w.toUpperCase()
    if (PROPER[w]) return PROPER[w]
    if (KEEP_UPPER.has(up) || !/[aeiouy]/.test(w)) return up
    return (w[0].toUpperCase() + w.slice(1)).replace(/'([a-z])/, (_, ch: string) => `'${ch.toUpperCase()}`)
  })
}

const joinAddr = (r: Record<string, string | undefined>) =>
  [
    [r.businesshousenumber, title(r.businessstreetname)].filter(Boolean).join(' '),
    title(r.businesscity),
    [r.businessstate, r.businesszip?.slice(0, 5)].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

/** Management companies (registered managing agents), sized by buildings managed. */
export async function searchManagers(opts: {
  area: NycArea; min: number; max: number; keyword?: string
}): Promise<NycProspect[]> {
  const where = [
    "type='Agent'", 'corporationname IS NOT NULL', areaWhere(opts.area),
    opts.keyword?.trim() ? `upper(corporationname) like ${q('%' + opts.keyword.trim().toUpperCase() + '%')}` : '',
  ].filter(Boolean).join(' AND ')
  const rows = await soql<Record<string, string>>(CONTACTS, {
    $select: 'corporationname, count(distinct registrationid) as n, max(businesszip) as zip, max(businesscity) as city',
    $where: where,
    $group: 'corporationname',
    $having: `count(distinct registrationid) between ${opts.min} and ${opts.max}`,
    $order: 'n DESC',
    $limit: '60',
  })
  return merge(rows.map(r => ({
    ref: `hpd:agent:${r.corporationname.trim().toUpperCase()}`,
    kind: 'manager' as const,
    company: companyCase(r.corporationname),
    person: null,
    address: [title(r.city), r.zip?.slice(0, 5)].filter(Boolean).join(' '),
    buildings: Number(r.n) || 0,
  })))
}

/** Individual owners (small landlords), sized by buildings owned. */
export async function searchLandlords(opts: {
  area: NycArea; min: number; max: number
}): Promise<NycProspect[]> {
  const group = 'firstname, lastname, businesshousenumber, businessstreetname, businesscity, businessstate, businesszip'
  const rows = await soql<Record<string, string>>(CONTACTS, {
    $select: `${group}, count(distinct registrationid) as n, max(registrationid::number) as rid`,
    $where: ["type='IndividualOwner'", 'lastname IS NOT NULL', 'businessstreetname IS NOT NULL', areaWhere(opts.area)].join(' AND '),
    $group: group,
    $having: `count(distinct registrationid) between ${opts.min} and ${opts.max}`,
    // Newest registrations first: recent buyers are the likeliest to renovate.
    $order: 'rid DESC',
    $limit: '150',
  })
  // Drop placeholder registrations ("# #", "N/A") that are not real people.
  const real = rows.filter(r => /[a-z]{2}/i.test(r.firstname ?? '') && /[a-z]{2}/i.test(r.lastname ?? '') &&
    !/^(n\/?a|none|unknown|same)$/i.test((r.lastname ?? '').trim()) &&
    !/\b(llc|inc|corp|realty|properties|holdings|trust|associates)\b/i.test(`${r.firstname} ${r.lastname}`))
  return merge(real.slice(0, 60).map(r => {
    const person = [title(r.firstname), title(r.lastname)].filter(Boolean).join(' ')
    const address = joinAddr(r)
    return {
      ref: `hpd:owner:${person.toUpperCase()}|${address.toUpperCase()}`,
      kind: 'landlord' as const,
      company: null,
      person,
      address,
      buildings: Number(r.n) || 0,
    }
  }))
}

/**
 * Fill in what a lead needs before outreach: for a management company, the
 * named agent and office address; for both kinds, one real building they run,
 * used to personalize the first email ("I noticed you manage 787 E 56th St").
 */
export async function enrichProspect(p: NycProspect): Promise<{
  person: string | null; address: string; building: string | null
}> {
  let where: string
  if (p.kind === 'manager') {
    where = `type='Agent' AND upper(trim(corporationname))=${q(p.ref.slice('hpd:agent:'.length))}`
  } else {
    const [first, ...rest] = (p.person ?? '').split(' ')
    where = `type='IndividualOwner' AND upper(firstname)=${q(first.toUpperCase())} AND upper(lastname)=${q(rest.join(' ').toUpperCase())}`
  }
  const contacts = await soql<Record<string, string>>(CONTACTS, { $where: where, $limit: '25' })

  // Most frequently listed person at the firm is the likeliest decision-maker.
  const tally = new Map<string, number>()
  for (const c of contacts) {
    const n = [title(c.firstname), title(c.lastname)].filter(Boolean).join(' ')
    if (n) tally.set(n, (tally.get(n) ?? 0) + 1)
  }
  const person = p.person ?? ([...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
  const office = contacts.find(c => c.businessstreetname)
  const address = office ? joinAddr(office) : p.address

  let building: string | null = null
  const rid = contacts.find(c => c.registrationid)?.registrationid
  if (rid) {
    const regs = await soql<Record<string, string>>(REGISTRATIONS, {
      $select: 'housenumber, streetname, boro',
      $where: `registrationid=${q(rid)}`,
      $limit: '1',
    })
    const b = regs[0]
    if (b) building = [b.housenumber, title(b.streetname)].filter(Boolean).join(' ') + (b.boro ? `, ${title(b.boro)}` : '')
  }
  return { person, address, building }
}
