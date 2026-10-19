// Brain daily market report: live news (web search) -> outlook per market (up / down / range) in Levantine Arabic.
// Used by api/market.js (cron + on demand) and by the Telegram bot (/market). The report is kept in the KV store
// (brain:market:latest and brain:market:<day>) and sent through every configured channel (Telegram today; WhatsApp
// is added in sendEverywhere when its number is ready).
//
// It is educational analysis, not financial advice, and it never places trades.

import { getCandles } from "./candles.js";
import { safeStringify } from "./safe-json.js";

const API = "https://api.anthropic.com/v1/messages";
export const MARKET_MODEL = process.env.MARKET_MODEL || process.env.BRAIN_MODEL || "claude-sonnet-5-5";
const FALLBACK = (process.env.MARKET_FALLBACK_MODELS || "claude-sonnet-4-5").split(",").map((s) => s.trim()).filter(Boolean);

// Ahmad's choice (Oct 2026): only gold, oil and the US indices, as a short report. MARKET_SYMBOLS overrides it.
export const MARKETS = (process.env.MARKET_SYMBOLS || "XAUUSD (Gold),USOIL (WTI crude oil),US100 (Nasdaq 100),US30 (Dow Jones)").split(",").map((s) => s.trim()).filter(Boolean);

export function sydneyDay(ms = Date.now()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
  catch (e) { return new Date(ms + 11 * 3600000).toISOString().slice(0, 10); }
}
function sydneyNow() {
  try { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }).format(new Date()); } catch (e) { return new Date().toUTCString(); }
}

// Offset of a time zone from UTC in hours on a given day (handles daylight saving): used to give the model the exact
// Sydney time of the US and UK sessions today, so calendar times are converted correctly.
export function tzOffset(tz, ms = Date.now()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 900000) / 4;
  } catch (e) { return null; }
}
// "8:30 New York = 23:30 Sydney" for the main release times of today.
export function sessionClock(ms = Date.now()) {
  const syd = tzOffset("Australia/Sydney", ms), ny = tzOffset("America/New_York", ms), ldn = tzOffset("Europe/London", ms), tk = tzOffset("Asia/Tokyo", ms);
  if ([syd, ny, ldn, tk].some((x) => x === null)) return "";
  const at = (h, m, off) => { let t = (h + m / 60 - off + syd) % 24; if (t < 0) t += 24; const H = Math.floor(t), M = Math.round((t - H) * 60); return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0"); };
  return `Sydney is UTC${syd >= 0 ? "+" : ""}${syd} today. Conversions to Sydney time: 08:30 New York = ${at(8, 30, ny)}, 10:00 New York = ${at(10, 0, ny)}, 14:00 New York (FOMC) = ${at(14, 0, ny)}, 07:00 London = ${at(7, 0, ldn)}, 09:30 London = ${at(9, 30, ldn)}, 08:50 Tokyo = ${at(8, 50, tk)}. A US/UK event in the evening there is often the NEXT calendar day in Sydney.`;
}

// Gold's active windows (New York kill zones: London 02:00-05:00 NY, New York 07:00-10:00 NY) in Sydney time,
// computed here (DST-aware) instead of by the model, so the times are always right.
export function killZoneLine(ms = Date.now()) {
  const syd = tzOffset("Australia/Sydney", ms), ny = tzOffset("America/New_York", ms);
  if (syd === null || ny === null) return "";
  const at = (h) => { let t = (h - ny + syd) % 24; if (t < 0) t += 24; const H = Math.floor(t), M = Math.round((t - H) * 60); return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0"); };
  return `⏰ أقوى أوقات حركة الذهب (سيدني): لندن ${at(2)}–${at(5)} · نيويورك ${at(7)}–${at(10)}`;
}
export function addKillZones(text, ms = Date.now()) {
  const line = killZoneLine(ms);
  const t = String(text || "");
  if (!line || t.includes("⏰")) return t;
  const i = t.lastIndexOf(DISCLAIMER);
  return i > 0 ? t.slice(0, i).trimEnd() + "\n\n" + line + "\n\n" + t.slice(i) : t + "\n\n" + line;
}

// Levels computed from real daily candles (Yahoo futures; crypto from Binance/Kraken), so the report's support /
// resistance and price come from data instead of the model's guess. Returns "" when no source answered.
const fmt = (x) => (Math.abs(x) >= 1000 ? x.toFixed(1) : Math.abs(x) >= 10 ? x.toFixed(2) : x.toFixed(4));
export function levelsFromDaily(candles) {
  const c = (candles || []).filter((x) => x && isFinite(x.h) && isFinite(x.l) && isFinite(x.c));
  if (c.length < 16) return null;
  const last = c[c.length - 1], prev = c[c.length - 2], wk = c.slice(-5), rng = c.slice(-15, -1);
  const adr = rng.reduce((a, x) => a + (x.h - x.l), 0) / rng.length;
  return {
    date: sydneyDay(last.t), close: last.c, high: last.h, low: last.l, prevHigh: prev.h, prevLow: prev.l,
    wkHigh: Math.max(...wk.map((x) => x.h)), wkLow: Math.min(...wk.map((x) => x.l)), adr,
    pivot: (last.h + last.l + last.c) / 3, chg: ((last.c - prev.c) / prev.c) * 100,
  };
}
export async function priceLevels(markets = MARKETS, fetchDaily = (sym) => getCandles(sym, 86400, 40)) {
  const lines = await Promise.all(markets.map(async (m) => {
    const sym = String(m).split(/[\s(]/)[0].toUpperCase();
    try {
      const { candles, source } = await fetchDaily(sym);
      const L = levelsFromDaily(candles);
      if (!L) return "";
      return `${sym}: last daily candle ${L.date} close ${fmt(L.close)} (${L.chg >= 0 ? "+" : ""}${L.chg.toFixed(2)}%), high ${fmt(L.high)}, low ${fmt(L.low)}; previous day high ${fmt(L.prevHigh)} / low ${fmt(L.prevLow)}; 5-day high ${fmt(L.wkHigh)} / low ${fmt(L.wkLow)}; classic pivot ${fmt(L.pivot)}; average daily range (14) ${fmt(L.adr)} [${source}]`;
    } catch (e) { return ""; }
  }));
  const ok = lines.filter(Boolean);
  return ok.length ? "PRICE DATA from daily candles (futures / exchange feeds; a broker's CFD price can differ a little - say ~):\n" + ok.join("\n") : "";
}

export const DISCLAIMER = "تحليل تعليمي مش نصيحة مالية. قرار الصفقة إلك.";

const PROMPT = (markets, levels = "") => `You are Brain, the market analyst of Ahmad, a Sydney-based trader (gold first, also oil and US indices; Smart Money Concepts style). It is ${sydneyNow()} in Sydney.

Use web_search NOW to get today's real information (do not rely on memory): the latest price and overnight move of each market below, the market-moving news of the last 24 hours, and today's HIGH-impact economic calendar events (mostly USD: CPI, NFP, FOMC/Fed speakers, PCE, GDP, jobless claims, ISM; plus OPEC/EIA oil inventories for oil) with their Sydney times.

${sessionClock()}

Markets: ${markets.join(", ")}.
${levels ? "\n" + levels + "\nUse this price data for every price and for the support / resistance levels (previous day high/low, 5-day high/low, pivot); a level is valid only if it is on the right side of the current price. Use the search results for news, the calendar and the reason. If a search price is fresher, prefer it and keep levels consistent with it.\n" : ""}
Ahmad wants it SHORT: no long explanations. Write in Levantine Arabic (tickers and numbers in English). Plain text for a chat app: no markdown headings, no tables, no ** bold. Exactly this layout:

📊 الذهب والنفط والمؤشرات · <date>

🌍 الملخص
1-2 short lines: the main driver today and the mood.

🗓️ أخبار قوية اليوم (بتوقيت سيدني)
• up to 4 lines, high-impact only: <Sydney time> – <event> – عالذهب: ⬆️ صعود / ⬇️ نزول / ↔️ تأثير ضعيف (the likely effect on GOLD if it comes out hotter/stronger than expected, in 3-6 words).
Write "ما في أخبار قوية اليوم" if none.

📈 التوقع
One line per market, nothing more:
<🟢 صعود / 🔴 نزول / 🟡 عرضي> <TICKER> ~<price> · دعم <x> / مقاومة <y> · <reason in max 8 words>

Close with exactly: "${DISCLAIMER}"

Rules: every price, level and event must come from today's search results; if you could not confirm something write "مش مأكد" instead of inventing it. Use 🟡 when the evidence is mixed. Keep the whole report under 1200 characters. Output only the report.`;

async function callModel(key, model, markets, signal, levels = "") {
  const body = { model, max_tokens: 6000, messages: [{ role: "user", content: PROMPT(markets, levels) }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }] };
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: safeStringify(body), signal });
  const t = await r.text();
  if (!r.ok) { const e = new Error("model " + r.status + ": " + t.slice(0, 200)); e.status = r.status; throw e; }
  const j = JSON.parse(t);
  const text = (j.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("").trim();
  const sources = [];
  // Pages the report actually cites come first, then the other search results.
  for (const b of j.content || []) {
    if (b && b.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) if (c && c.url && sources.length < 8 && !sources.some((x) => x.url === c.url)) sources.push({ title: String(c.title || "").slice(0, 120), url: c.url, cited: true });
  }
  for (const b of j.content || []) {
    if (b && b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const s of b.content) if (s && s.url && sources.length < 8 && !sources.some((x) => x.url === s.url)) sources.push({ title: String(s.title || "").slice(0, 120), url: s.url });
  }
  return { text, sources, model };
}

// Builds a fresh report. Tries the configured model, then the fallbacks (not on auth or billing problems).
export async function buildReport({ key, markets = MARKETS, signal } = {}) {
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  let last = null;
  // Price data never holds the report up for long: 12 s at most, then the report goes ahead on search alone.
  let timer;
  const levels = await Promise.race([priceLevels(markets), new Promise((r) => { timer = setTimeout(() => r(""), 12000); })]).catch(() => "");
  clearTimeout(timer);
  for (const model of [MARKET_MODEL, ...FALLBACK.filter((m) => m !== MARKET_MODEL)]) {
    try {
      const out = await callModel(key, model, markets, signal, levels);
      if (!out.text) throw new Error("empty report");
      return { day: sydneyDay(), at: new Date().toISOString(), model: out.model, markets, levels: !!levels, text: addKillZones(finishText(out.text, out.sources)), sources: out.sources };
    } catch (e) {
      last = e;
      if (e.status === 401 || e.status === 402 || (signal && signal.aborted)) break;
    }
  }
  throw last || new Error("report failed");
}

// Final guards: a report without any source of today is marked as unconfirmed, and it always ends with the
// educational disclaimer.
export function finishText(text, sources) {
  let t = String(text || "").trim();
  if (!(sources || []).length) t = "⚠️ ما قدرت أتأكد من مصادر اليوم — اعتبر الأرقام مش مأكدة.\n\n" + t;
  if (!t.includes(DISCLAIMER)) t = t.slice(0, 3900 - DISCLAIMER.length - 2) + "\n\n" + DISCLAIMER;
  return t.slice(0, 3900);
}

async function kv(cmds) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(cmds) });
    return r.ok ? (await r.json()).map((x) => (x && "result" in x ? x.result : null)) : null;
  } catch (e) { return null; }
}
export async function storeReport(rep) {
  const s = JSON.stringify(rep);
  return kv([["SET", "brain:market:latest", s, "EX", 30 * 86400], ["SET", "brain:market:" + rep.day, s, "EX", 30 * 86400]]);
}
export async function latestReport(day) {
  const res = await kv([["GET", day ? "brain:market:" + day : "brain:market:latest"]]);
  try { return res && res[0] ? JSON.parse(res[0]) : null; } catch (e) { return null; }
}

// The text as sent to a chat: the report plus up to 2 sources (Ahmad wants it short).
export function chatText(rep) {
  const src = (rep.sources || []).slice(0, 2).map((s) => "• " + (s.title || s.url) + "\n  " + s.url).join("\n");
  return rep.text + (src ? "\n\n🔗 مصادر:\n" + src : "");
}

async function sendTelegram(text, chatId) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return "not configured";
  let s = text, ok = true;
  while (s) {
    let cut = s.length > 3900 ? s.lastIndexOf("\n", 3900) : s.length;
    if (cut < 1500) cut = Math.min(3900, s.length);
    const part = s.slice(0, cut); s = s.slice(cut).trim();
    try { const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: part, disable_web_page_preview: true }) }); ok = ok && r.ok; } catch (e) { ok = false; }
  }
  return ok ? "sent" : "failed";
}

// Every channel the report goes to. WhatsApp: set MARKET_WA_TO (digits, international format) with WA_TOKEN and
// WA_PHONE_ID once the personal WhatsApp number is connected; until then it is skipped.
export async function sendEverywhere(rep) {
  const text = chatText(rep);
  const out = { telegram: await sendTelegram(text) };
  const waTok = process.env.WA_TOKEN, waPhone = process.env.WA_PHONE_ID, waTo = process.env.MARKET_WA_TO;
  if (waTok && waPhone && waTo) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${waPhone}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + waTok }, body: JSON.stringify({ messaging_product: "whatsapp", to: waTo, type: "text", text: { body: text.slice(0, 4000), preview_url: false } }) });
      out.whatsapp = r.ok ? "sent" : "failed:" + r.status;
    } catch (e) { out.whatsapp = "failed"; }
  } else out.whatsapp = "not configured";
  return out;
}
