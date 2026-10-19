// Brain daily self-check (Vercel EDGE function). Run by Vercel Cron every day (see vercel.json) and on demand.
//
//   GET /api/daily                      -> { ok, info }  (public: nothing else)
//   GET /api/daily  (cron, Bearer CRON_SECRET)           -> runs the self-check and streams the report
//   GET /api/daily?run=1&key=DAILY_KEY   -> same, on demand (at most 3 on-demand runs per day)
//   GET /api/daily?report=1&key=DAILY_KEY[&day=YYYY-MM-DD] -> the stored report (latest, or that day's)
//
// What a run does:
//   1. Builds a few benchmark indicators through the same pipeline that serves users (_nexus/bench.js, in rotation)
//      and judges each one: verified by the checker, and the expected building blocks present.
//   2. Reads the engine's counters, the scripts that could not be verified, the TradingView errors users pasted and
//      the thumbs-down feedback from the KV store.
//   3. Stores the report (nx:daily:<day>), logs "DAILY_REPORT {...}" and sends Ahmad a summary on Telegram.
// The daily improvement run (nexus-engine/DAILY.md) reads the report and fixes what it shows.
//
// Env: ANTHROPIC_API_KEY, KV_REST_API_URL/TOKEN, CRON_SECRET (Vercel sends it with cron calls), DAILY_KEY
// (read / on-demand key), TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optional, for the summary).
export const config = { runtime: "edge" };

import { runPipeline } from "./_nexus/engine.js";
import { makeCaller, readStats, kvPipeline, friendlyError, errorKind, OUTAGE_CODES } from "./_nexus/handler.js";
import { KNOWLEDGE_REV } from "./_nexus/knowledge.js";
import { LESSONS } from "./_nexus/lessons.js";
import { BENCH, casesFor, judge } from "./_nexus/bench.js";
import { brainAuth } from "./_brain/lock.js";

const MODEL = process.env.NEXUS_MODEL || "claude-sonnet-5-5";
const BUDGET_MS = 250000; // the stream may run for 300 s on Edge
const ON_DEMAND_PER_DAY = 3;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function sameSecret(given, expected) {
  const g = String(given || ""), e = String(expected || "");
  if (!e || e.length < 16 || g.length !== e.length) return false;
  let diff = 0;
  for (let i = 0; i < e.length; i++) diff |= g.charCodeAt(i) ^ e.charCodeAt(i);
  return diff === 0;
}

// Sydney's calendar day, so the report carries the date Ahmad reads it on.
export function sydneyDay(ms = Date.now()) {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
    const get = (t) => (p.find((x) => x.type === t) || {}).value;
    if (get("year") && get("month") && get("day")) return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (e) {}
  // Fallback without time-zone data: AEDT (UTC+11) from the first Sunday of October to the first Sunday of April.
  const d = new Date(ms);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const firstSunday = (yy, mm) => { const x = new Date(Date.UTC(yy, mm, 1)); return 1 + ((7 - x.getUTCDay()) % 7); };
  const dst = m > 9 || m < 3 || (m === 9 && d.getUTCDate() >= firstSunday(y, 9)) || (m === 3 && d.getUTCDate() < firstSunday(y, 3));
  return new Date(ms + (dst ? 11 : 10) * 3600000).toISOString().slice(0, 10);
}

const utcDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);

async function runCase(c, key, deadline, signal) {
  const started = Date.now();
  const out = { id: c.id, lang: c.lang, pass: false, verified: false, secs: 0, rounds: 0, lines: 0, inputs: 0, errors: [], expectFailed: [], error: "" };
  try {
    const result = await runPipeline({ mode: "build", lang: c.lang, history: [], userContent: c.text, currentCode: "", currentFile: "", callModel: makeCaller(key, deadline, {}, signal), emit: () => {}, deadline, effort: "medium", signal });
    const j = judge(c, result);
    out.pass = j.pass; out.verified = j.verified; out.lines = j.lines; out.inputs = j.inputs; out.expectFailed = j.expectFailed;
    if (result.kind === "script") {
      out.rounds = result.report.rounds || 0;
      if (result.report.design) out.design = result.report.design; // look score (and the score before the polish round)
      out.errors = result.report.errors.slice(0, 3).map((e) => clip((e.line ? "L" + e.line + ": " : "") + e.message, 220));
      if (!result.report.verified && !out.errors.length && result.report.warnings) out.errors = result.report.warnings.slice(0, 2).map((e) => clip((e.line ? "L" + e.line + ": " : "") + e.message, 220));
      if (result.report.unappliedEdits) out.errors.push(result.report.unappliedEdits + " requested change(s) not applied");
    } else out.error = "no script: " + clip(result.explain, 160);
    out.usage = result.usage ? { calls: result.usage.calls, out: result.usage.output } : undefined;
  } catch (e) {
    out.error = (OUTAGE_CODES[errorKind(e)] ? "outage " + OUTAGE_CODES[errorKind(e)] + " - " : "") + clip(friendlyError(e, "en"), 160);
  }
  out.secs = Math.round((Date.now() - started) / 1000);
  return out;
}

function dayStats(s) {
  if (!s) return null;
  const n = (k) => Number(s[k] || 0);
  const requests = n("requests");
  const outages = {};
  for (const k in s) if (k.startsWith("outage_")) outages[k.slice(7)] = n(k);
  return { day: s.day, requests, verified: n("verified"), unverified: n("unverified"), repaired: n("repaired"), failed: n("failed"), cancelled: n("cancelled"), textReplies: n("text_replies"), fbUp: n("fb_up"), fbDown: n("fb_down"), avgSecs: requests ? Math.round(n("ms") / requests / 1000) : 0, modelCalls: n("model_calls"), tokensIn: n("tokens_in") + n("tokens_cache_read"), tokensOut: n("tokens_out"), outages };
}

function telegramText(r) {
  const b = r.bench;
  const caseLine = b.cases.map((c) => `${c.pass ? "✅" : "❌"} ${c.id} (${c.secs}ث${c.rounds ? "، " + c.rounds + " جولة تصليح" : ""})${!c.pass ? " — " + clip(c.error || c.errors[0] || c.expectFailed.join(", "), 90) : ""}`).join("\n");
  const st = (d) => d ? `${d.day}: ${d.requests} طلب · ${d.verified} متحقَّق ✅ · ${d.unverified} غير متحقَّق ⚠️ · ${d.failed} فشل ❌ · 👍${d.fbUp} 👎${d.fbDown}${d.requests ? " · متوسط " + d.avgSecs + "ث" : ""}` : "لا بيانات";
  const tv = r.samples.tvErrors.length ? `\n🩹 أخطاء TradingView جديدة (${r.samples.tvErrors.length}): ${clip(r.samples.tvErrors[0].error, 100)}` : "";
  const fb = r.samples.feedbackDown.length ? `\n👎 ملاحظات: ${r.samples.feedbackDown.slice(0, 2).map((f) => clip(f.note || f.file, 60)).join(" · ")}` : "";
  return `🧠 تقرير Brain اليومي · ${r.day}\n\n🧪 اختبار بوت المؤشرات: ${b.passed}/${b.total}\n${caseLine}\n\n📊 الاستخدام\n${st(r.stats.today)}\n${st(r.stats.yesterday)}${tv}${fb}\n\n⚙️ محرك rev ${r.engineRev} · ${r.lessons} درس · ${r.model}`;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }) });
    return r.ok;
  } catch (e) { return false; }
}

async function storedReport(day) {
  const res = await kvPipeline([["GET", day ? "nx:daily:" + day : "nx:daily:latest"]]);
  const raw = res && res[0] && res[0].result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function onDemandAllowed() {
  const k = "nx:daily:runs:" + utcDay();
  const res = await kvPipeline([["INCR", k], ["EXPIRE", k, 172800]]);
  const n = res && res[0] && Number(res[0].result);
  return !Number.isFinite(n) || n <= ON_DEMAND_PER_DAY;
}

export async function runSelfCheck({ key, signal, trigger }) {
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const dayIndex = Math.floor(started / 86400000);
  const cases = key ? casesFor(dayIndex) : [];
  const results = await Promise.all(cases.map((c) => runCase(c, key, deadline, signal)));
  const stats = await readStats(3).catch(() => null);
  const days = stats && stats.ok ? stats.days : [];
  const today = utcDay(), yesterday = utcDay(1);
  const since = new Date(started - 36 * 3600000).toISOString();
  const recent = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === "object" && (!x.at || x.at >= since)) : []);
  const report = {
    ok: true,
    day: sydneyDay(started),
    at: new Date(started).toISOString(),
    trigger,
    engineRev: KNOWLEDGE_REV,
    lessons: LESSONS.length,
    model: MODEL,
    secs: 0,
    bench: { total: results.length, passed: results.filter((r) => r.pass).length, cases: results, pool: BENCH.length, noKey: !key },
    stats: { today: dayStats(days.find((d) => d.day === today)), yesterday: dayStats(days.find((d) => d.day === yesterday)), storeOk: !!(stats && stats.ok) },
    samples: {
      unverified: recent(stats && stats.unverified).slice(0, 6).map((u) => ({ at: u.at, request: clip(u.request, 160), base: u.base, rounds: u.rounds, errors: (u.errors || []).slice(0, 2).map((e) => clip((e.line ? "L" + e.line + ": " : "") + (e.message || e), 200)) })),
      tvErrors: recent(stats && stats.tvErrors).slice(0, 6).map((t) => ({ at: t.at, error: clip(t.error, 300), request: clip(t.request, 120), fixedNow: !!t.fixedNow })),
      feedbackDown: recent(stats && stats.feedback).filter((f) => f.verdict === "down").slice(0, 6).map((f) => ({ at: f.at, note: clip(f.note, 300), file: f.file, base: f.base, request: clip(f.request, 160), errors: (f.errors || []).slice(0, 2) })),
      feedbackUp: recent(stats && stats.feedback).filter((f) => f.verdict === "up").length,
    },
  };
  report.secs = Math.round((Date.now() - started) / 1000);
  const text = JSON.stringify(report);
  await kvPipeline([["SET", "nx:daily:" + report.day, text, "EX", 60 * 86400], ["SET", "nx:daily:latest", text, "EX", 60 * 86400]]);
  try { console.log("DAILY_REPORT " + text); } catch (e) {}
  report.telegram = await sendTelegram(telegramText(report));
  return report;
}

export default async function handler(req) {
  if (req.method !== "GET") return new Response("GET only", { status: 405 });
  const url = new URL(req.url);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const qkey = url.searchParams.get("key") || "";
  const cronOk = sameSecret(bearer, process.env.CRON_SECRET);
  const keyOk = sameSecret(qkey, process.env.DAILY_KEY) || sameSecret(qkey, process.env.CRON_SECRET) || brainAuth(req.headers.get("x-brain-key")) === "ok";
  const wantReport = url.searchParams.get("report") === "1";
  const wantRun = url.searchParams.get("run") === "1";

  if (!cronOk && !keyOk) {
    if (wantReport || wantRun) return json({ ok: false, message: "not allowed" }, 401);
    return json({ ok: true, info: "Brain daily self-check. Runs by cron; ?report=1 with the key returns the latest report.", engineRev: KNOWLEDGE_REV, lessons: LESSONS.length, bench: BENCH.length });
  }
  if (wantReport) {
    const r = await storedReport(/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("day") || "") ? url.searchParams.get("day") : "");
    return r ? json(r) : json({ ok: false, message: "no report stored yet" }, 404);
  }
  if (!cronOk && !(await onDemandAllowed())) return json({ ok: false, message: "on-demand limit reached for today" }, 429);

  const key = process.env.ANTHROPIC_API_KEY;
  const abort = new AbortController();
  if (req.signal) { if (req.signal.aborted) abort.abort(); else req.signal.addEventListener("abort", () => abort.abort(), { once: true }); }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    cancel() { abort.abort(); },
    async start(controller) {
      let closed = false;
      const send = (s) => { if (closed) return; try { controller.enqueue(enc.encode(s)); } catch (e) { closed = true; } };
      // Bytes flow while the models think, so the connection stays open (Edge needs a first byte within 25 s).
      const beat = setInterval(() => send(" "), 7000);
      send(" ");
      try {
        const report = await runSelfCheck({ key, signal: abort.signal, trigger: cronOk ? "cron" : "manual" });
        send("\n" + JSON.stringify(report) + "\n");
      } catch (e) {
        send("\n" + JSON.stringify({ ok: false, message: clip(e && e.message, 300) }) + "\n");
      } finally {
        clearInterval(beat);
        closed = true;
        try { controller.close(); } catch (e) {}
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
