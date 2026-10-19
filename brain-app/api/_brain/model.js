import { safeStringify } from "./safe-json.js";
// One non-streaming Messages API call with model fallbacks, shared by the WhatsApp bots.
// Tries each model in order; moves on when a model is not available to the account (404 / not_found) or the
// API is overloaded (529), so a retired or busy model never silences the bot. Returns { ok, status, text, model, error }.
const API = "https://api.anthropic.com/v1/messages";

export function modelList(primary, fallbacks) {
  const list = [primary, ...String(fallbacks || "").split(",")].map((x) => String(x || "").trim()).filter(Boolean);
  return [...new Set(list)];
}

export async function askModel({ key, models, system, user, maxTokens = 1200 }) {
  let last = { ok: false, status: 0, text: "", error: "no model" };
  for (const model of models) {
    let r;
    try {
      r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: safeStringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      });
    } catch (e) {
      last = { ok: false, status: 0, text: "", model, error: String(e && e.message || e).slice(0, 200) };
      continue;
    }
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const text = (j && j.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();
      return { ok: true, status: 200, text, model };
    }
    let t = ""; try { t = await r.text(); } catch (e) {}
    last = { ok: false, status: r.status, text: "", model, error: t.slice(0, 300) };
    const retryable = r.status === 404 || r.status === 529 || /not_found_error|overloaded_error/.test(t) || (r.status === 400 && /model/i.test(t) && /not.*(found|exist|available|supported)/i.test(t));
    if (!retryable) break;
  }
  return last;
}
