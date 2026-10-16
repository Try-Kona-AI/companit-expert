import type { CampaignAudience, Lang, Lead } from './types'

/**
 * Cold-outreach copy and merge-tag rendering. Plain text on purpose: short,
 * personal, plain emails get replies; designed HTML newsletters get filtered.
 *
 * KEEP IN SYNC with renderOutreach() in supabase/functions/send-campaign, which
 * renders the same tags server-side at send time.
 */

export const MERGE_TAGS = [
  '{{greeting}}', '{{signature}}', '{{company}}', '{{first_name}}',
  '{{building}}', '{{business}}', '{{phone}}',
] as const

export interface MergeContext {
  ownerName: string
  business: string
  phone: string
  lang: Lang
}

const FALLBACK = {
  en: { first_name: 'there', company: 'your company', building: 'your buildings' },
  ru: { first_name: '',      company: 'вашей компании', building: 'ваших домах' },
}

export function firstNameOf(lead: Pick<Lead, 'name'>): string {
  const n = (lead.name ?? '').trim()
  // Company-only leads ("Pelican Management, Inc.") have no first name.
  if (!n || /\b(llc|inc|corp|co\.|mgmt|management|realty|group|associates|properties|property|services|holdings|partners|nyc)\b/i.test(n)) return ''
  return n.split(/\s+/)[0]
}

export function renderOutreach(
  text: string,
  lead: Pick<Lead, 'name' | 'company' | 'building'>,
  ctx: MergeContext,
): string {
  const fb = FALLBACK[ctx.lang]
  const first = firstNameOf(lead)
  const values: Record<string, string> = {
    first_name: first || fb.first_name,
    company:    shortCompany(lead.company ?? '') || fb.company,
    building:   (lead.building ?? '').trim() || fb.building,
    owner_name: ctx.ownerName,
    business:   shortCompany(ctx.business),
    phone:      ctx.phone,
    greeting:   greetingFor(first, (lead.company ?? '').trim(), ctx.lang),
    signature:  `${ctx.lang === 'ru' ? 'С уважением,' : 'Best,'}\nMichael K\n${shortCompany(ctx.business)}\n240-599-6037`,
  }
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m))
    // "Здравствуйте, !" when there is no first name -> "Здравствуйте!"
    .replace(/,\s*!/g, '!')
}

export interface StepDraft { delay_days: number; subject: string; body: string }

/**
 * Legal footer for hand-sent outreach: who we are, where we are, and how to
 * opt out. US law (CAN-SPAM) wants both on every commercial email.
 */
export function outreachFooter(legalName: string, address: string, lang: Lang): string {
  const addr = address.replace(/\s*\n\s*/g, ', ').trim()
  return lang === 'ru'
    ? `\n\n--\n${legalName}, ${addr}\nЕсли не хотите получать письма, ответьте «нет, спасибо», и я больше не напишу.`
    : `\n\n--\n${legalName}, ${addr}\nIf you'd rather not hear from me, reply "no thanks" and I won't follow up.`
}

/** Starter sequences. Fully editable per campaign after creation. */
export function starterSteps(audience: CampaignAudience, lang: Lang): StepDraft[] {
  if (lang === 'ru') return audience === 'landlord' ? RU_LANDLORD : RU_PM
  return audience === 'landlord' ? EN_LANDLORD : EN_PM
}

const EN_PM: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Apartment turnovers for {{company}}',
    body: `{{greeting}}

I'm Michael with {{business}}, a Brooklyn painting and renovation team. We handle affordable apartment turnovers, painting, drywall, flooring and repairs for property managers and landlords across all five boroughs.

When a unit goes vacant, we get it rent-ready fast. You get a written quote before we start, photos and videos when we finish, and one clean invoice per unit.

See our recent work and Google reviews at companitexpert.com

Do you have a turnover coming up? I'd like to quote it.

{{signature}}`,
  },
  {
    delay_days: 4,
    subject: 'Re: Apartment turnovers for {{company}}',
    body: `{{greeting}}

Following up on my last note. If you have a vacant unit coming up, our team can walk it this week and have a quote to you the same day.

{{signature}}`,
  },
  {
    delay_days: 7,
    subject: 'Vendor list',
    body: `{{greeting}}

One last note from me. We'd like to earn a spot on your vendor list for paint and turnovers, and the best way to do that is one job. Our work and reviews are at companitexpert.com. If the timing isn't right, reply "later" and I'll check back in a few months.

{{signature}}`,
  },
]

const EN_LANDLORD: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Turnovers and repairs at {{building}}',
    body: `{{greeting}}

I'm Michael with {{business}}, a Brooklyn painting and renovation team. We handle affordable unit turnovers, painting and repairs between tenants for building owners across all five boroughs, with a written quote up front and photos and videos when we finish.

See our recent work and Google reviews at companitexpert.com

Do you have a unit opening up? I'd like to quote it.

{{signature}}`,
  },
  {
    delay_days: 5,
    subject: 'Re: Turnovers and repairs at {{building}}',
    body: `{{greeting}}

Following up on my last note. Whenever a unit opens up or something needs fixing, reply here and our team will set up a walkthrough the same week.

{{signature}}`,
  },
]

const RU_PM: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Подготовка квартир для {{company}}',
    body: `{{greeting}}

Меня зовут Майкл, я из {{business}}, бруклинской команды по покраске и ремонту. Мы недорого готовим квартиры к сдаче, а также занимаемся покраской, гипсокартоном, полами и ремонтом для управляющих компаний и владельцев во всех пяти районах.

Когда квартира освобождается, мы быстро готовим её к сдаче. Письменная смета до начала работ, фото и видео после, один понятный счёт на квартиру.

Наши работы и отзывы: companitexpert.com

Есть квартира, которую нужно подготовить? Буду рад посчитать.

{{signature}}`,
  },
  {
    delay_days: 4,
    subject: 'Re: Подготовка квартир для {{company}}',
    body: `{{greeting}}

Напоминаю о своём письме. Если скоро освобождается квартира, наша команда посмотрит её на этой неделе и пришлёт смету в тот же день.

{{signature}}`,
  },
]

const RU_LANDLORD: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Ремонт и подготовка квартир, {{building}}',
    body: `{{greeting}}

Меня зовут Майкл, я из {{business}}, бруклинской команды по покраске и ремонту. Мы недорого готовим квартиры к новым жильцам, красим и делаем ремонт для владельцев домов во всех пяти районах. Письменная смета заранее, фото и видео после работ.

Наши работы и отзывы: companitexpert.com

Освобождается квартира? Буду рад посчитать.

{{signature}}`,
  },
  {
    delay_days: 5,
    subject: 'Re: Ремонт и подготовка квартир, {{building}}',
    body: `{{greeting}}

Напоминаю о своём письме. Когда освободится квартира или понадобится ремонт, просто ответьте, и мы приедем посмотреть на этой же неделе.

{{signature}}`,
  },
]

/** "Hello Victoria," / "Hello Fidy Management team," / RU equivalents. */
/** "Fidy Management Inc." -> "Fidy Management" for subjects and greetings. */
export function shortCompany(company: string): string {
  return company.trim().replace(/[,.]?\s*\b(llc|inc|corp|corporation|co)\b\.?$/i, '').trim()
}

export function greetingFor(first: string, company: string, lang: 'en' | 'ru'): string {
  const co = shortCompany(company)
  if (lang === 'ru') return first ? `Здравствуйте, ${first}!` : 'Здравствуйте!'
  if (first) return `Hello ${first},`
  return co ? `Hello ${co} team,` : 'Hello,'
}
