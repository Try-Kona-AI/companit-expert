// Apollo prospecting for Companit Expert (Kona AI).
// Finds property-management companies and their decision-makers so they can be
// added to the leads pipeline (Phase 2 lead generation). Called by the signed-in
// owner. Gated on APOLLO_API_KEY: inert and clearly signalled until a subscription
// key is set, then live. Credits are only spent on explicit search/enrich calls.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") ?? "";
const BASE = "https://api.apollo.io/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Default ICP: residential property managers across NYC and Long Island, the
// size range that turns over units often but has no in-house crew.
const DEFAULT_TITLES = [
  "Property Manager", "Owner", "Principal", "Operations Manager",
  "Director of Operations", "Maintenance Coordinator", "Managing Member",
];
const DEFAULT_LOCATIONS = [
  "New York City, New York, United States",
  "Brooklyn, New York, United States",
  "Queens, New York, United States",
  "Bronx, New York, United States",
  "Staten Island, New York, United States",
  "Nassau County, New York, United States",
  "Suffolk County, New York, United States",
];
const DEFAULT_SIZES = ["1,10", "11,20", "21,50", "51,100", "101,200"];

type ApolloPerson = {
  id?: string; first_name?: string; last_name?: string; name?: string; title?: string;
  email?: string; linkedin_url?: string; city?: string; state?: string;
  phone_numbers?: { sanitized_number?: string }[];
  organization?: { name?: string; phone?: string };
};

function normalize(p: ApolloPerson) {
  const org = p.organization ?? {};
  const email = p.email && !String(p.email).includes("not_unlocked") ? p.email : null;
  const phone = p.phone_numbers?.[0]?.sanitized_number ?? org.phone ?? null;
  return {
    id: p.id ?? "",
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || "",
    title: p.title ?? "",
    company: org.name ?? "",
    email,
    phone,
    city: [p.city, p.state].filter(Boolean).join(", "),
    linkedin: p.linkedin_url ?? "",
    locked: !email,
  };
}

const apollo = (path: string, payload: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "X-Api-Key": APOLLO_API_KEY, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(payload),
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Not configured yet: respond clearly so the UI shows a "connect Apollo" state.
  if (!APOLLO_API_KEY) return json({ needsKey: true, error: "APOLLO_API_KEY not set" });

  try {
    const body = await req.json().catch(() => ({}));

    // Reveal email + phone for one person (uses an Apollo credit).
    if (body.action === "enrich") {
      const resp = await apollo("/people/match", {
        id: body.id || undefined,
        first_name: body.first_name || undefined,
        last_name: body.last_name || undefined,
        organization_name: body.company || undefined,
        reveal_personal_emails: false,
      });
      if (!resp.ok) return json({ error: `apollo_${resp.status}`, detail: (await resp.text()).slice(0, 300) }, 502);
      const data = await resp.json();
      return json({ person: data.person ? normalize(data.person) : null });
    }

    // Search for PM companies + contacts (ICP defaults applied when not provided).
    const payload = {
      person_titles: body.titles ?? DEFAULT_TITLES,
      person_locations: body.locations ?? DEFAULT_LOCATIONS,
      q_keywords: body.keywords ?? "property management",
      organization_num_employees_ranges: body.sizes ?? DEFAULT_SIZES,
      page: body.page ?? 1,
      per_page: Math.min(Number(body.perPage) || 25, 50),
    };
    const resp = await apollo("/mixed_people/search", payload);
    if (!resp.ok) return json({ error: `apollo_${resp.status}`, detail: (await resp.text()).slice(0, 300) }, 502);
    const data = await resp.json();
    const people = (data.people ?? data.contacts ?? []).map(normalize);
    return json({ people, pagination: data.pagination ?? null });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
