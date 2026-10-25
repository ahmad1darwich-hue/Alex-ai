// TradingView alert -> Ahmad's Telegram (Edge). TradingView webhooks cannot post to Telegram directly (TradingView
// alerts FAQ: an intermediary is needed), so an alert's webhook points here and Brain forwards it to his own chat.
//
//   POST /api/tv-alert?k=<TV_ALERT_KEY>   body = the alert message (plain text or JSON) -> sent to Telegram
//   GET  /api/tv-alert                    -> { ok, info, configured }  (public: nothing else)
//
// Setup: set TV_ALERT_KEY (a random 24+ character secret) in Vercel, then in TradingView's alert dialog tick
// "Webhook URL" and paste https://<brain site>/api/tv-alert?k=<TV_ALERT_KEY>. TradingView cannot send custom headers,
// so the secret travels in the URL; it is compared in constant time. Messages only: this endpoint NEVER places trades.
import { sendToTelegram } from "./_brain/tg-send.js";

export const config = { runtime: "edge" };

const MAX_BODY = 4000;
const PER_MINUTE = 20; // TradingView itself stops a script after more than 15 alerts in 3 minutes
const hits = []; // per instance; enough to stop a runaway alert flooding the chat
const recent = new Map(); // message -> time, drops exact repeats within a minute

function sameSecret(given, expected) {
  const g = String(given || ""), e = String(expected || "");
  if (e.length < 24 || g.length !== e.length) return false;
  let d = 0; for (let i = 0; i < e.length; i++) d |= g.charCodeAt(i) ^ e.charCodeAt(i);
  return d === 0;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const LABELS = { ticker: "الرمز", symbol: "الرمز", interval: "الفريم", tf: "الفريم", timeframe: "الفريم", action: "الاتجاه", side: "الاتجاه", signal: "الإشارة", price: "السعر", close: "السعر", entry: "الدخول", sl: "الستوب", stop: "الستوب", tp: "الهدف", tp1: "الهدف 1", tp2: "الهدف 2", tp3: "الهدف 3", time: "الوقت", message: "الرسالة", text: "الرسالة" };

// The Telegram text for one alert body: JSON is shown as labelled lines, anything else as it came.
export function formatAlert(raw) {
  const body = String(raw || "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_BODY);
  if (!body) return "";
  let lines = null;
  if (/^[{[]/.test(body)) {
    try {
      const j = JSON.parse(body);
      if (j && typeof j === "object" && !Array.isArray(j)) {
        lines = Object.entries(j).slice(0, 20).map(([k, v]) => {
          const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
          return `${LABELS[k.toLowerCase()] || k}: ${val.slice(0, 200)}`;
        });
      }
    } catch (e) { /* not JSON: send as text */ }
  }
  const text = lines ? lines.join("\n") : body;
  const up = /\b(buy|long|bull(ish)?)\b|شراء|صعود/i.test(body), down = /\b(sell|short|bear(ish)?)\b|بيع|نزول/i.test(body);
  const icon = up && !down ? "🟢" : down && !up ? "🔴" : "🔔";
  return `${icon} تنبيه TradingView\n${text}\n\nتنبيه آلي من مؤشرك، مش نصيحة مالية.`;
}

async function readBody(req) {
  const t = await req.text();
  return t.length > MAX_BODY * 2 ? t.slice(0, MAX_BODY * 2) : t;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const key = String(process.env.TV_ALERT_KEY || "").trim();
  if (req.method === "GET") return json({ ok: true, info: "Brain: TradingView alert webhook -> Telegram. POST the alert message with ?k=<TV_ALERT_KEY>. Never places trades.", configured: key.length >= 24 });
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);
  if (key.length < 24) return json({ ok: false, message: "TV_ALERT_KEY is not set" }, 503);
  if (!sameSecret(url.searchParams.get("k"), key)) return json({ ok: false, message: "not allowed" }, 401);

  const now = Date.now();
  while (hits.length && now - hits[0] > 60000) hits.shift();
  if (hits.length >= PER_MINUTE) { console.log("TV_ALERT limited"); return json({ ok: false, message: "too many alerts, slow down" }, 429); }
  hits.push(now);

  const text = formatAlert(await readBody(req));
  if (!text) return json({ ok: false, message: "empty alert" }, 400);
  for (const [m, t] of recent) if (now - t > 60000) recent.delete(m);
  if (recent.has(text)) return json({ ok: true, duplicate: true });
  recent.set(text, now);

  const r = await sendToTelegram(text);
  console.log("TV_ALERT " + JSON.stringify({ sent: r.ok, why: r.why || "", chars: text.length }));
  if (!r.ok) return json({ ok: false, message: r.why === "unset" ? "Telegram is not configured" : "Telegram send failed" }, 502);
  return json({ ok: true });
}
