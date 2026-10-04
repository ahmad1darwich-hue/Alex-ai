// Nexus / Brain Indicators - Pine Script engine (Vercel EDGE function, streaming).
// v2 pipeline: verified templates + model -> automatic check (real Pine v6 parser/type-checker) -> automatic repair.
// Protocol: POST { v: 2, mode, lang, messages, code, templateId, tvError } -> NDJSON events. Without `v` the legacy
// plain-text stream is returned so pages that have not refreshed yet keep working.
export const config = { runtime: "edge" };

import { SYSTEM_PROMPT } from "./_nexus/knowledge.js";
import { runPipeline } from "./_nexus/engine.js";
import { checkPine, summarizeCheck } from "./_nexus/lint.js";
import { TEMPLATES, TEMPLATE_BY_ID } from "./_nexus/templates.js";

const API = "https://api.anthropic.com/v1/messages";
const PRIMARY_MODEL = process.env.NEXUS_MODEL || "claude-sonnet-5-5";
const FALLBACK_MODELS = (process.env.NEXUS_FALLBACK_MODELS || "claude-sonnet-4-5").split(",").map((s) => s.trim()).filter(Boolean);
const EFFORT = process.env.NEXUS_EFFORT || "medium";
const LIMIT_PER_IP = Number(process.env.NEXUS_DAILY_PER_IP || 80);
const LIMIT_TOTAL = Number(process.env.NEXUS_DAILY_TOTAL || 500);
const BUDGET_MS = 280000; // Edge streams may run for 300 s

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

// ---------- Anthropic call ----------

// Models from the 4.6 generation on use adaptive thinking + effort; older ones take neither.
const isAdaptiveModel = (m) => /^claude-(?:opus|sonnet|fable|mythos|haiku)-(?:[5-9]|4-[6-9])/.test(m);

class ModelError extends Error {
  constructor(kind, status, detail) { super(kind + " " + status + " " + detail); this.kind = kind; this.status = status; this.detail = detail; }
}

function classify(status, body) {
  const t = String(body || "");
  if (status === 401 || /authentication_error|invalid x-api-key/i.test(t)) return "auth";
  if (status === 402 || /credit balance|billing/i.test(t)) return "credit";
  if (status === 404 || /not_found_error/i.test(t) || (status === 400 && /model:/i.test(t))) return "model";
  if (status === 429 || /rate_limit/i.test(t)) return "rate";
  if (status === 529 || status === 503 || /overloaded/i.test(t)) return "overloaded";
  if (status === 400) return "bad_request";
  return "other";
}

async function callOnce({ key, model, messages, effort, onText, signal, legacyShape }) {
  const adaptive = isAdaptiveModel(model) && !legacyShape;
  const body = {
    model,
    max_tokens: adaptive ? 40000 : 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages,
    stream: true,
  };
  if (adaptive) { body.thinking = { type: "adaptive" }; body.output_config = { effort: effort || EFFORT }; }
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let t = ""; try { t = await res.text(); } catch (e) {}
    throw new ModelError(classify(res.status, t), res.status, t.slice(0, 300));
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", stopReason = "";
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") { text += ev.delta.text; if (onText) onText(ev.delta.text); }
      else if (ev.type === "message_start" && ev.message && ev.message.usage) { const u = ev.message.usage; usage.input += u.input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; }
      else if (ev.type === "message_delta") { if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason; if (ev.usage && ev.usage.output_tokens) usage.output = ev.usage.output_tokens; }
      else if (ev.type === "error") { const m = (ev.error && (ev.error.type + ": " + ev.error.message)) || "stream error"; throw new ModelError(classify(0, m), 0, m); }
    }
  }
  return { text, stopReason, usage, model };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tries the configured model, then the fallbacks. Auth and billing problems are never retried.
function makeCaller(key, deadline, state) {
  return async ({ messages, effort, onText }) => {
    const chain = [state.model || PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== (state.model || PRIMARY_MODEL))];
    let lastErr = null;
    for (const model of chain) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const ms = Math.max(15000, Math.min(240000, deadline - Date.now() - 4000));
        const timer = setTimeout(() => ctrl.abort(), ms);
        let streamed = false;
        try {
          const out = await callOnce({ key, model, messages, effort, onText: (d) => { streamed = true; if (onText) onText(d); }, signal: ctrl.signal, legacyShape: state.legacyShape && state.legacyShape.has(model) });
          state.model = model;
          return out;
        } catch (e) {
          lastErr = e;
          const kind = e instanceof ModelError ? e.kind : e && e.name === "AbortError" ? "timeout" : "other";
          if (kind === "auth" || kind === "credit" || kind === "timeout" || streamed) throw e;
          if (kind === "bad_request" && isAdaptiveModel(model) && !(state.legacyShape && state.legacyShape.has(model))) { (state.legacyShape = state.legacyShape || new Set()).add(model); continue; }
          if ((kind === "rate" || kind === "overloaded") && attempt === 0) { await sleep(1800); continue; }
          break; // next model
        } finally { clearTimeout(timer); }
      }
    }
    throw lastErr || new Error("model call failed");
  };
}

function friendlyError(e, lang) {
  const en = lang === "en";
  const kind = e instanceof ModelError ? e.kind : e && e.name === "AbortError" ? "timeout" : "other";
  if (kind === "auth") return en ? "The AI key is invalid. Check ANTHROPIC_API_KEY in Vercel." : "مفتاح الذكاء الاصطناعي غير صالح. راجع ANTHROPIC_API_KEY بـ Vercel.";
  if (kind === "credit") return en ? "The AI account is out of credit. Top up the Anthropic account." : "رصيد حساب الذكاء الاصطناعي خلص. اشحن حساب Anthropic.";
  if (kind === "rate" || kind === "overloaded") return en ? "The AI service is busy right now. Try again in a minute." : "خدمة الذكاء الاصطناعي مشغولة هلّق. جرّب بعد دقيقة.";
  if (kind === "timeout") return en ? "This took too long and was stopped. Try again, or ask for a simpler version first." : "الطلب أخد وقت طويل وتوقّف. جرّب مرة تانية، أو اطلب نسخة أبسط أول.";
  if (kind === "model") return en ? "The configured AI model is not available on this account." : "موديل الذكاء الاصطناعي المحدَّد مش متاح على هالحساب.";
  return (en ? "Something went wrong: " : "صار خطأ: ") + String((e && (e.detail || e.message)) || e).slice(0, 160);
}

// ---------- KV (optional): daily limits and lightweight stats ----------

async function kvPipeline(cmds) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(cmds), signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

const today = () => new Date().toISOString().slice(0, 10);

// Fails open: if the store is unreachable the request is allowed.
async function overLimit(req) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim().slice(0, 60);
  const day = today();
  const kIp = `nx:rl:${day}:ip:${ip}`, kAll = `nx:rl:${day}:all`;
  const res = await kvPipeline([["INCR", kIp], ["EXPIRE", kIp, 172800], ["INCR", kAll], ["EXPIRE", kAll, 172800]]);
  if (!res || !Array.isArray(res)) return false;
  const nIp = Number(res[0] && res[0].result), nAll = Number(res[2] && res[2].result);
  return (Number.isFinite(nIp) && nIp > LIMIT_PER_IP) || (Number.isFinite(nAll) && nAll > LIMIT_TOTAL);
}

function recordStats(result, mode, ms, tvError) {
  const day = today();
  const key = `nx:stats:${day}`;
  const cmds = [["HINCRBY", key, "requests", 1], ["HINCRBY", key, "ms", Math.round(ms)], ["EXPIRE", key, 60 * 86400]];
  if (result && result.usage) cmds.push(["HINCRBY", key, "tokens_in", (result.usage.input || 0) + (result.usage.cacheRead || 0) + (result.usage.cacheWrite || 0)], ["HINCRBY", key, "tokens_out", result.usage.output || 0], ["HINCRBY", key, "model_calls", result.usage.calls || 0]);
  if (result && result.kind === "script") {
    cmds.push(["HINCRBY", key, result.report.verified ? "verified" : "unverified", 1], ["HINCRBY", key, "repair_rounds", result.report.rounds || 0]);
    if (!result.report.verified) cmds.push(["LPUSH", "nx:unverified", JSON.stringify({ at: new Date().toISOString(), errors: result.report.errors.slice(0, 4), warnings: result.report.warnings.slice(0, 4), base: result.base })], ["LTRIM", "nx:unverified", 0, 99]);
  }
  // Errors users paste from TradingView are the cases the checker missed: keep them to improve the checker.
  if (mode === "fix" && tvError) cmds.push(["LPUSH", "nx:tverrors", JSON.stringify({ at: new Date().toISOString(), error: String(tvError).slice(0, 500) })], ["LTRIM", "nx:tverrors", 0, 199]);
  return kvPipeline(cmds);
}

// ---------- request helpers ----------

const hasArabic = (s) => /[؀-ۿ]/.test(String(s || ""));

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
  return "";
}

function splitHistory(messages) {
  const list = (Array.isArray(messages) ? messages : []).filter((m) => m && (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.length : m.text));
  let lastUser = -1;
  for (let i = list.length - 1; i >= 0; i--) { if (list[i].role !== "assistant") { lastUser = i; break; } }
  if (lastUser < 0) return { history: [], userContent: "", lastAssistantText: "" };
  const prior = list.slice(0, lastUser);
  let lastAssistantText = "";
  for (let i = prior.length - 1; i >= 0; i--) { if (prior[i].role === "assistant") { lastAssistantText = textOf(prior[i].content); break; } }
  // Old turns: text only, and without the code blocks (the current script is sent separately).
  const history = prior.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: textOf(m.content || m.text || "").replace(/```[a-zA-Z]*\n[\s\S]*?```/g, "[script omitted]") }));
  return { history, userContent: list[lastUser].content || list[lastUser].text || "", lastAssistantText };
}

function lastPineBlock(text) {
  const re = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)```/g;
  let m, last = "";
  while ((m = re.exec(String(text || ""))) !== null) { if (/\/\/@version=/.test(m[1])) last = m[1]; }
  return last;
}

function reportLine(result, lang) {
  const en = lang === "en";
  const r = result.report;
  if (r.verified) return en ? (r.rounds ? `Checked automatically: ${r.rounds} issue round(s) fixed, 0 errors.` : "Checked automatically: 0 errors.") : (r.rounds ? `انفحص تلقائياً: تصلّحت الملاحظات (${r.rounds} جولة)، 0 أخطاء.` : "انفحص تلقائياً: 0 أخطاء.");
  const n = r.errors.length + r.warnings.length;
  return en ? `Automatic check: ${n} finding(s) remain. If TradingView shows an error, paste it here and I will fix it.` : `الفحص التلقائي: بقي ${n} ملاحظة. إذا طلعلك خطأ بـ TradingView الصقه هون وبصلّحه.`;
}

function templatePayload(t, lang) {
  const check = checkPine(t.code);
  return { kind: "script", code: check.code, file: t.file, title: t.title.en, explain: t.explain[lang === "en" ? "en" : "ar"], base: "template:" + t.id, report: { ...summarizeCheck(check), rounds: 0, history: [], unappliedEdits: 0, verified: check.clean }, model: null };
}

// ---------- handler ----------

export default async function handler(req, ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") {
    return json({ ok: true, hasKey: !!key, model: PRIMARY_MODEL, mode: "indicators", streaming: true, engine: 2, templates: TEMPLATES.map((t) => ({ id: t.id, title: t.title })) });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

  let body = {};
  try { body = await req.json(); } catch (e) {}
  const v2 = Number(body.v) >= 2;
  const mode = ["build", "fix", "template", "lint"].includes(body.mode) ? body.mode : "build";
  const { history, userContent, lastAssistantText } = splitHistory(body.messages);
  const userText = textOf(userContent);
  const lang = userText.trim() ? (hasArabic(userText) ? "ar" : "en") : body.lang === "en" ? "en" : "ar";

  // No-model modes first: they are free and instant.
  if (mode === "template") {
    const t = TEMPLATE_BY_ID.get(String(body.templateId || "").toLowerCase());
    if (!t) return json({ kind: "error", message: lang === "en" ? "Unknown template." : "قالب غير معروف." }, 404);
    return json(templatePayload(t, body.lang === "en" ? "en" : "ar"));
  }
  if (mode === "lint") {
    const check = checkPine(String(body.code || ""));
    return json({ kind: "lint", code: check.code, report: { ...summarizeCheck(check), verified: check.clean } });
  }

  if (!key) return json(v2 ? { kind: "error", message: "ANTHROPIC_API_KEY is not set in Vercel." } : { reply: "🔌 غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel." });
  const hasAttachment = Array.isArray(userContent) && userContent.some((b) => b && (b.type === "image" || b.type === "document"));
  if (!userText.trim() && !hasAttachment && mode !== "fix") return json(v2 ? { kind: "error", message: lang === "en" ? "Describe the indicator you want." : "وصّفلي المؤشر اللي بدك ياه." } : { reply: "وصّفلي المؤشر اللي بدك اصمّمه 👇" });
  if (await overLimit(req)) {
    const msg = lang === "en" ? "Daily limit reached. Please try again tomorrow." : "وصلت للحدّ اليومي. جرّب بكرا.";
    return json(v2 ? { kind: "error", message: msg } : { reply: "⚠️ " + msg });
  }

  const currentCode = v2 ? String(body.code || "") : lastPineBlock(lastAssistantText);
  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const enc = new TextEncoder();
  const state = {};

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (s) => { if (closed) return; try { controller.enqueue(enc.encode(s)); } catch (e) { closed = true; } };
      const emit = v2 ? (ev) => send(JSON.stringify(ev) + "\n") : () => {};
      // Keep the connection alive while the model thinks (no bytes flow during thinking).
      const beat = setInterval(() => (v2 ? emit({ t: "ping" }) : send(" ")), 7000);
      if (v2) emit({ t: "stage", id: "start", model: PRIMARY_MODEL }); else send(" ");
      let result = null;
      try {
        result = await runPipeline({ mode: mode === "fix" ? "fix" : "build", lang, history, userContent, currentCode, tvError: body.tvError, callModel: makeCaller(key, deadline, state), emit, deadline, effort: EFFORT });
        result.ms = Date.now() - started;
        if (v2) emit({ t: "final", ...result, line: result.kind === "script" ? reportLine(result, lang) : undefined });
        else if (result.kind === "script") send("```pine\n// FILE: " + result.file + "\n" + result.code.trimEnd() + "\n```\n\n" + (result.explain ? result.explain + "\n\n" : "") + (result.report.verified ? "✅ " : "⚠️ ") + reportLine(result, lang));
        else send(result.explain || "…");
      } catch (e) {
        const msg = friendlyError(e, lang);
        if (v2) emit({ t: "error", message: msg }); else send("\n⚠️ " + msg);
      } finally {
        clearInterval(beat);
        closed = true;
        try { controller.close(); } catch (e) {}
        // Stats are best-effort and must not delay the reply.
        const p = recordStats(result, mode, Date.now() - started, body.tvError).catch(() => {});
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
      }
    },
  });
  return new Response(stream, { headers: { "content-type": v2 ? "application/x-ndjson; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", ...CORS } });
}
