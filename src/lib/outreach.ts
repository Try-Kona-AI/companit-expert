import type { CampaignAudience, Lang, Lead } from './types'

/**
 * Cold-outreach copy and merge-tag rendering. Plain text on purpose: short,
 * personal, plain emails get replies; designed HTML newsletters get filtered.
 *
 * KEEP IN SYNC with renderOutreach() in supabase/functions/send-campaign, which
 * renders the same tags server-side at send time.
 */

export const MERGE_TAGS = [
  '{{first_name}}', '{{company}}', '{{building}}',
  '{{owner_name}}', '{{business}}', '{{phone}}',
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
    company:    (lead.company ?? '').trim() || fb.company,
    building:   (lead.building ?? '').trim() || fb.building,
    owner_name: ctx.ownerName,
    business:   ctx.business,
    phone:      ctx.phone,
  }
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m))
    // "Здравствуйте, !" when there is no first name -> "Здравствуйте!"
    .replace(/,\s*!/g, '!')
}

export interface StepDraft { delay_days: number; subject: string; body: string }

/** Starter sequences. Fully editable per campaign after creation. */
export function starterSteps(audience: CampaignAudience, lang: Lang): StepDraft[] {
  if (lang === 'ru') return audience === 'landlord' ? RU_LANDLORD : RU_PM
  return audience === 'landlord' ? EN_LANDLORD : EN_PM
}

const EN_PM: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Turnover crew for {{company}}',
    body: `Hi {{first_name}},

I'm {{owner_name}}, owner of {{business}}, a licensed and insured painting and renovation crew here in New York. We do apartment turnovers for property managers: paint, drywall, flooring, kitchen and bath fixes, usually done in 1 to 3 days so units get back on the market fast.

I saw that {{company}} manages {{building}}. If you ever need a reliable crew for turnovers or repairs, I'd be glad to price out your next vacant unit.

Worth a quick call this week?

{{owner_name}}
{{business}} · {{phone}}`,
  },
  {
    delay_days: 4,
    subject: 'Re: Turnover crew for {{company}}',
    body: `Hi {{first_name}},

Following up on my note. Most managers we work with start by sending us one unit to see the quality and the turnaround. If you have a vacancy coming up, I can walk it and send you a fixed price within 24 hours.

{{owner_name}}
{{phone}}`,
  },
  {
    delay_days: 7,
    subject: 'Last note from {{business}}',
    body: `Hi {{first_name}},

I won't keep filling your inbox. If turnovers or repairs ever start piling up, just reply here or call/text me at {{phone}} and we'll take care of it.

Thanks,
{{owner_name}}`,
  },
]

const EN_LANDLORD: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Repairs and turnovers at {{building}}',
    body: `Hi {{first_name}},

I'm {{owner_name}}, owner of {{business}}, a licensed and insured painting and renovation company in New York. We work with building owners on unit turnovers, painting, and repairs between tenants, with fixed prices and quick turnaround.

If you have work coming up at {{building}} or any of your other buildings, I'd be happy to come by and give you a free quote.

{{owner_name}}
{{business}} · {{phone}}`,
  },
  {
    delay_days: 5,
    subject: 'Re: Repairs and turnovers at {{building}}',
    body: `Hi {{first_name}},

Just following up. Whenever a unit opens up or something needs fixing, a quick call or text to {{phone}} is all it takes and we'll schedule a walkthrough.

{{owner_name}}`,
  },
]

const RU_PM: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Бригада для ремонта квартир, {{company}}',
    body: `Здравствуйте, {{first_name}}!

Меня зовут {{owner_name}}, я владелец {{business}}, лицензированной и застрахованной ремонтной компании в Нью-Йорке. Мы делаем ремонт квартир между жильцами для управляющих компаний: покраска, гипсокартон, полы, кухни и ванные, обычно за 1-3 дня, чтобы квартира быстрее сдавалась.

Я увидел, что {{company}} управляет домом {{building}}. Если вам нужна надёжная бригада для ремонтов, буду рад оценить вашу следующую свободную квартиру.

Удобно созвониться на этой неделе?

{{owner_name}}
{{business}} · {{phone}}`,
  },
  {
    delay_days: 4,
    subject: 'Re: Бригада для ремонта квартир, {{company}}',
    body: `Здравствуйте, {{first_name}}!

Пишу ещё раз. Обычно управляющие начинают с одной квартиры, чтобы оценить качество и сроки. Если скоро освобождается квартира, я приеду, посмотрю и пришлю фиксированную цену в течение 24 часов.

{{owner_name}}
{{phone}}`,
  },
  {
    delay_days: 7,
    subject: 'Последнее письмо от {{business}}',
    body: `Здравствуйте, {{first_name}}!

Не буду больше занимать ваш почтовый ящик. Если появятся ремонты, просто ответьте на это письмо или позвоните/напишите мне: {{phone}}.

Спасибо,
{{owner_name}}`,
  },
]

const RU_LANDLORD: StepDraft[] = [
  {
    delay_days: 0,
    subject: 'Ремонт и подготовка квартир, {{building}}',
    body: `Здравствуйте, {{first_name}}!

Меня зовут {{owner_name}}, я владелец {{business}}, лицензированной и застрахованной ремонтной компании в Нью-Йорке. Мы помогаем владельцам домов с ремонтом квартир между жильцами, покраской и мелким ремонтом, по фиксированной цене и быстро.

Если в доме {{building}} или других ваших домах намечаются работы, с удовольствием приеду и бесплатно оценю.

{{owner_name}}
{{business}} · {{phone}}`,
  },
  {
    delay_days: 5,
    subject: 'Re: Ремонт и подготовка квартир, {{building}}',
    body: `Здравствуйте, {{first_name}}!

Напоминаю о себе. Когда освободится квартира или что-то понадобится починить, просто позвоните или напишите на {{phone}}, и мы приедем посмотреть.

{{owner_name}}`,
  },
]
