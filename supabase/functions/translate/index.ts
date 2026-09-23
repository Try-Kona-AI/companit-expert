// Russian <-> English translator for Companit Expert (Kona AI).
// Called from the app by the signed-in owner (verify_jwt = true). Uses Claude so
// customer messages, notes, and quotes move between languages instantly.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("TRANSLATE_MODEL") ?? "claude-haiku-4-5-20251001";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Target = "en" | "ru";
const NAME: Record<Target, string> = {
  en: "natural, fluent English",
  ru: "natural, fluent Russian",
};

// Any Cyrillic character means the source is Russian.
const looksRussian = (s: string) => /[Ѐ-ӿ]/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY not set in project secrets" }, 500);
    }

    const { text, to } = await req.json().catch(() => ({}));
    const source = typeof text === "string" ? text.trim() : "";
    if (!source) return json({ error: "empty" }, 400);
    if (source.length > 8000) return json({ error: "too_long" }, 413);

    const detected: Target = looksRussian(source) ? "ru" : "en";
    const target: Target =
      to === "en" || to === "ru" ? to : detected === "ru" ? "en" : "ru";

    const system =
      `You are a professional translator for a home-services contractor ` +
      `(handyman work, apartment turnovers, plumbing, painting, drywall, repairs). ` +
      `Translate the user's message into ${NAME[target]}. Keep the meaning, tone, ` +
      `names, addresses, numbers, and any prices exactly. Sound like a real person, ` +
      `not a machine. Return ONLY the translation, with no quotes, labels, or notes.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: source }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ error: "translate_failed", detail: detail.slice(0, 300) }, 502);
    }

    const data = await resp.json();
    const translated = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === "text")
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
          .trim()
      : "";

    if (!translated) return json({ error: "empty_result" }, 502);
    return json({ translated, detected, target });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
