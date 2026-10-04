// Nexus / Brain Indicators - Pine Script engine (runs in a Vercel Edge function, streaming).
// Pipeline: verified templates + model -> automatic check (real Pine v6 parser/type-checker) -> automatic repair.
// Protocol: POST { v: 2, mode, lang, messages, code, templateId, tvError } -> NDJSON events. Without `v` the legacy
// plain-text stream is returned so pages that have not refreshed yet keep working.
// The Edge entry points (api/indicator.js, api/nexus.js) only declare the runtime and call handle().
import { SYSTEM_PROMPT } from "./knowledge.js";
import { runPipeline } from "./engine.js";
import { checkPine, summarizeCheck } from "./lint.js";
import { TEMPLATES, TEMPLATE_BY_ID } from "./templates.js";

const API = "https://api.anthropic.com/v1/messages";
const PRIMARY_MODEL = process.env.NEXUS_MODEL || "claude-sonnet-5-5";
const FALLBACK_MODELS = (process.env.NEXUS_FALLBACK_MODELS || "claude-sonnet-4-5").split(",").map((s) => s.trim()).filter(Boolean);
const EFFORT = process.env.NEXUS_EFFORT || "medium";
const posInt = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const LIMIT_PER_IP = posInt(process.env.NEXUS_DAILY_PER_IP, 40); // model requests per client per day
const LIMIT_TOTAL = posInt(process.env.NEXUS_DAILY_TOTAL, 400); // model requests per day, all clients
const LIMIT_FREE_PER_IP = posInt(process.env.NEXUS_DAILY_FREE_PER_IP, 600); // template / check requests (no model call)
const BUDGET_MS = 280000; // Edge streams may run for 300 s
const MAX_BODY = 4500000; // bytes; attachments arrive as base64 inside the JSON body
const MAX_CODE = 120000; // characters of Pine code accepted from the client
// Optional operator token: lets the owner read stats, skip the per-IP cap and see token usage while testing.
const ADMIN_TOKEN = process.env.NEXUS_ADMIN_TOKEN || "";
function isAdmin(body) {
  const given = body && typeof body.admin === "string" ? body.admin : "";
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16 || given.length !== ADMIN_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ ADMIN_TOKEN.charCodeAt(i);
  return diff === 0;
}

// NEXUS_ALLOWED_ORIGINS: comma separated list of sites allowed to call the API from a browser. Empty = any site.
const ALLOWED_ORIGINS = (process.env.NEXUS_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
// A preflight carries no data and is answered for any site; the request itself is what gets refused. The operator
// (admin token) may call from anywhere, which keeps the test tools working.
function corsFor(req, admin) {
  const origin = ((req && req.headers.get("origin")) || "").replace(/\/$/, "");
  const open = admin || (req && req.method === "OPTIONS");
  const allow = !ALLOWED_ORIGINS.length ? "*" : ALLOWED_ORIGINS.includes(origin) || (open && origin) ? origin : ALLOWED_ORIGINS[0];
  return { "access-control-allow-origin": allow, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "origin" };
}
// With a list configured, browser calls from other sites are refused (requests without an Origin header - curl,
// server to server - are not browsers and are only limited by the caps).
function originAllowed(req) {
  if (!ALLOWED_ORIGINS.length) return true;
  const origin = ((req && req.headers.get("origin")) || "").replace(/\/$/, "");
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return true;
  // Pages served by this same deployment (Brain Indicators) are always allowed.
  try { return origin === new URL(req.url).origin; } catch (e) { return false; }
}
const jsonWith = (cors) => (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors } });

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

function abortError(message) { const e = new Error(message || "aborted"); e.name = "AbortError"; return e; }

async function callOnce({ key, model, messages, effort, onText, onThinking, signal, legacyShape, maxTokens }) {
  const adaptive = isAdaptiveModel(model) && !legacyShape;
  const body = {
    model,
    // Thinking counts towards max_tokens on adaptive models. The caps bound the cost of one call; a script that
    // does not fit is continued once by the pipeline.
    max_tokens: Math.min(maxTokens || 24000, adaptive ? 24000 : 16000),
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
      else if ((ev.type === "content_block_start" && ev.content_block && /thinking/.test(ev.content_block.type || "")) || (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "thinking_delta")) { if (onThinking) onThinking(); }
      else if (ev.type === "message_start" && ev.message && ev.message.usage) { const u = ev.message.usage; usage.input += u.input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; }
      else if (ev.type === "message_delta") { if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason; if (ev.usage && ev.usage.output_tokens) usage.output = ev.usage.output_tokens; }
      else if (ev.type === "error") { const m = (ev.error && (ev.error.type + ": " + ev.error.message)) || "stream error"; throw new ModelError(classify(0, m), 0, m); }
    }
  }
  // A stream that ends without a stop reason was cut off upstream: what arrived is not a complete reply.
  if (!stopReason) throw new ModelError("incomplete", 0, "the model stream ended early");
  return { text, stopReason, usage, model };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tries the configured model, then the fallbacks. Auth and billing problems are never retried.
// `signal` aborts everything when the client goes away or presses Stop.
function makeCaller(key, deadline, state, signal) {
  return async ({ messages, effort, onText, onThinking, maxTokens }) => {
    const chain = [state.model || PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== (state.model || PRIMARY_MODEL))];
    let lastErr = null;
    for (const model of chain) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal && signal.aborted) throw abortError("cancelled");
        const left = deadline - Date.now();
        if (left < 8000) throw lastErr || abortError("out of time");
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(240000, left - 3000));
        const onAbort = () => ctrl.abort();
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        let streamed = false;
        try {
          const out = await callOnce({ key, model, messages, effort, maxTokens, onText: (d) => { streamed = true; if (onText) onText(d); }, onThinking, signal: ctrl.signal, legacyShape: state.legacyShape && state.legacyShape.has(model) });
          state.model = model;
          return out;
        } catch (e) {
          lastErr = e;
          const kind = e instanceof ModelError ? e.kind : e && e.name === "AbortError" ? "timeout" : "other";
          if (kind === "auth" || kind === "credit" || kind === "timeout" || streamed) throw e;
          if (kind === "bad_request") {
            // Only a complaint about the thinking / effort fields is worth retrying in the older request shape;
            // any other invalid request would fail the same way on every model.
            if (/thinking|output_config|effort/i.test(e.detail || "") && isAdaptiveModel(model) && !(state.legacyShape && state.legacyShape.has(model))) { (state.legacyShape = state.legacyShape || new Set()).add(model); continue; }
            throw e;
          }
          if ((kind === "rate" || kind === "overloaded" || kind === "incomplete") && attempt === 0) { await sleep(1800); continue; }
          break; // next model
        } finally {
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", onAbort);
        }
      }
    }
    throw lastErr || new Error("model call failed");
  };
}

// Problems only the operator can solve (the key, the credit, the model name). Visitors get a neutral sentence with a
// short code; the operator finds the code in the README, in the logs and in the stats.
const OUTAGE_CODES = { nokey: "K1", auth: "K2", credit: "C1", model: "M1" };
function outageMessage(kind, lang) {
  const code = OUTAGE_CODES[kind];
  try { console.error("nexus outage " + code + " (" + kind + ")"); } catch (x) {}
  return lang === "en" ? `The service is paused for the moment (code ${code}). Please try again later.` : `الخدمة متوقفة مؤقتاً (رمز ${code}). جرّب بعد شوي.`;
}
const errorKind = (e) => (e instanceof ModelError ? e.kind : e && e.name === "AbortError" ? "timeout" : "other");

function friendlyError(e, lang) {
  const en = lang === "en";
  const kind = errorKind(e);
  if (OUTAGE_CODES[kind]) return outageMessage(kind, lang);
  if (kind === "rate" || kind === "overloaded") return en ? "The AI service is busy right now. Try again in a minute." : "خدمة الذكاء الاصطناعي مشغولة هلّق. جرّب بعد دقيقة.";
  if (kind === "timeout") return en ? "This took too long and was stopped. Try again, or ask for a simpler version first." : "الطلب أخد وقت طويل وتوقّف. جرّب مرة تانية، أو اطلب نسخة أبسط أول.";
  if (kind === "incomplete" || (e && e.kind === "empty")) return en ? "The reply did not arrive complete. Please try again." : "الرد ما وصل كامل. جرّب مرة تانية.";
  // Upstream error text stays in the logs: it is not written for end users and may carry internals.
  try { console.error("nexus error:", String((e && (e.detail || e.message)) || e).slice(0, 500)); } catch (x) {}
  return en ? "Something went wrong on our side. Please try again in a moment." : "صار خطأ من عنّا. جرّب مرة تانية بعد شوي.";
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

// The client key for the caps. Vercel sets these headers itself (a caller cannot forge them there). An IPv6 customer
// owns a whole /64, so the prefix is the key: rotating addresses inside it does not reset the cap.
function clientKey(req) {
  const raw = (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 60);
  if (!raw.includes(":")) return raw;
  const [head, tail] = raw.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = raw.includes("::") ? h.concat(new Array(Math.max(0, 8 - h.length - t.length)).fill("0"), t) : h;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

// Small in-memory allowance per isolate: the cap that still exists when the store is missing or unreachable.
const memHits = new Map();
function memOver(key, max, windowMs) {
  const now = Date.now();
  // Full: drop the oldest keys (a flood of new clients must not reset the ones already limited).
  if (memHits.size > 4000) { let drop = 1000; for (const k of memHits.keys()) { memHits.delete(k); if (--drop <= 0) break; } }
  const hits = (memHits.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  memHits.set(key, hits);
  return hits.length > max;
}

// A ceiling for all clients together in the no-store case.
const memAll = [];
function memGlobalOver(max, windowMs) {
  const now = Date.now();
  while (memAll.length && now - memAll[0] >= windowMs) memAll.shift();
  memAll.push(now);
  return memAll.length > max;
}

// Daily caps for model requests. A request refused by the per-client cap does not use up the shared allowance.
async function overLimit(req, admin) {
  const ip = clientKey(req);
  const day = today();
  const kIp = `nx:rl:${day}:ip:${ip}`, kAll = `nx:rl:${day}:all`;
  const res = await kvPipeline([["INCR", kIp], ["EXPIRE", kIp, 172800], ["INCR", kAll], ["EXPIRE", kAll, 172800]]);
  const nIp = Array.isArray(res) ? Number(res[0] && res[0].result) : NaN;
  const nAll = Array.isArray(res) ? Number(res[2] && res[2].result) : NaN;
  if (!Number.isFinite(nIp) || !Number.isFinite(nAll) || nIp < 1 || nAll < 1) {
    // No store, or it failed: allow a little per client instead of everything.
    return !admin && (memOver("m:" + ip, 12, 3600000) || memGlobalOver(120, 3600000));
  }
  if (!admin && nIp > LIMIT_PER_IP) { await kvPipeline([["DECR", kAll]]); return true; }
  return nAll > LIMIT_TOTAL;
}

// Template and check requests cost no model call but do cost compute: a generous cap keeps them from being hammered.
async function overFreeLimit(req, admin) {
  if (admin) return false;
  const ip = clientKey(req);
  if (memOver("f:" + ip, 90, 60000)) return true; // bursts, per isolate
  const k = `nx:rl:${today()}:free:${ip}`;
  const res = await kvPipeline([["INCR", k], ["EXPIRE", k, 172800]]);
  const n = Array.isArray(res) ? Number(res[0] && res[0].result) : NaN;
  return Number.isFinite(n) && n > LIMIT_FREE_PER_IP;
}

// Last days of counters plus the most recent problem samples (operator only).
async function readStats() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const res = await kvPipeline(days.map((d) => ["HGETALL", "nx:stats:" + d]).concat([["LRANGE", "nx:unverified", 0, 19], ["LRANGE", "nx:tverrors", 0, 19]]));
  if (!res || !Array.isArray(res)) return { ok: false, message: "The stats store is not reachable." };
  const toObj = (v) => { const o = {}; if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) o[v[i]] = Number(v[i + 1]); else if (v && typeof v === "object") for (const k in v) o[k] = Number(v[k]); return o; };
  const parse = (list) => (Array.isArray(list) ? list.map((x) => { try { return JSON.parse(x); } catch (e) { return x; } }) : []);
  return { ok: true, limits: { perIp: LIMIT_PER_IP, total: LIMIT_TOTAL }, days: days.map((d, i) => ({ day: d, ...toObj(res[i] && res[i].result) })), unverified: parse(res[days.length] && res[days.length].result), tvErrors: parse(res[days.length + 1] && res[days.length + 1].result) };
}

function recordStats(result, mode, ms, tvError, outage) {
  const day = today();
  const key = `nx:stats:${day}`;
  const cmds = [["HINCRBY", key, "requests", 1], ["HINCRBY", key, "ms", Math.round(ms)], ["EXPIRE", key, 60 * 86400]];
  if (!result) cmds.push(["HINCRBY", key, mode === "cancelled" ? "cancelled" : "failed", 1]);
  if (outage) cmds.push(["HINCRBY", key, "outage_" + outage, 1]);
  if (result && result.kind === "text") cmds.push(["HINCRBY", key, "text_replies", 1]);
  if (result && result.usage) cmds.push(["HINCRBY", key, "tokens_in", result.usage.input || 0], ["HINCRBY", key, "tokens_cache_read", result.usage.cacheRead || 0], ["HINCRBY", key, "tokens_cache_write", result.usage.cacheWrite || 0], ["HINCRBY", key, "tokens_out", result.usage.output || 0], ["HINCRBY", key, "model_calls", result.usage.calls || 0]);
  if (result && result.kind === "script") {
    cmds.push(["HINCRBY", key, result.report.verified ? "verified" : "unverified", 1], ["HINCRBY", key, "repair_rounds", result.report.rounds || 0]);
    if (!result.report.verified) cmds.push(["LPUSH", "nx:unverified", JSON.stringify({ at: new Date().toISOString(), errors: result.report.errors.slice(0, 4), warnings: result.report.warnings.slice(0, 4), base: result.base })], ["LTRIM", "nx:unverified", 0, 99]);
  }
  // Errors users paste from TradingView are the cases the checker missed: keep them to improve the checker.
  if (mode === "fix" && tvError && result) cmds.push(["LPUSH", "nx:tverrors", JSON.stringify({ at: new Date().toISOString(), error: String(tvError).slice(0, 500) })], ["LTRIM", "nx:tverrors", 0, 199]);
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

// A message that contains a whole script ("fix this: //@version=6 ...") is split into the script and the request,
// so the model can answer with small edits instead of rewriting everything.
function extractPastedScript(text) {
  const src = String(text || "");
  const fenced = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)```/.exec(src);
  if (fenced && /\/\/@version=\d/.test(fenced[1])) return { code: fenced[1], rest: src.replace(fenced[0], "\n").trim() };
  const i = src.search(/^[ \t]*\/\/@version=\d/m);
  if (i < 0) return null;
  const lines = src.slice(i).split("\n");
  const tail = [];
  // Trailing lines written as plain language (Arabic, or a sentence without any code punctuation) are part of the
  // request, not of the script.
  const isProse = (l) => { const t = l.trim(); return !t || hasArabic(t) || (!/^\s/.test(l) && !/[=()\[\]{}:<>]|^\/\//.test(t) && t.split(/\s+/).length >= 3); };
  while (lines.length > 3 && isProse(lines[lines.length - 1])) { const l = lines.pop(); if (l.trim()) tail.unshift(l); }
  if (lines.length < 3) return null;
  return { code: lines.join("\n"), rest: (src.slice(0, i).trim() + "\n" + tail.join("\n")).trim() };
}

function reportLine(result, lang) {
  const en = lang === "en";
  const r = result.report;
  if (r.verified) return en ? (r.fixed ? `Checked automatically: issues found and fixed, 0 errors.` : "Checked automatically: 0 errors.") : (r.fixed ? `انفحص تلقائياً: لقيت ملاحظات وتصلّحت، 0 أخطاء.` : "انفحص تلقائياً: 0 أخطاء.");
  const nErr = r.errorCount ?? r.errors.length;
  const nWarn = r.warningCount ?? r.warnings.length;
  const parts = [];
  if (r.unappliedEdits) parts.push(en ? `${r.unappliedEdits} requested change(s) could not be applied.` : `ما قدرت طبّق ${r.unappliedEdits} من التعديلات المطلوبة.`);
  if (nErr) parts.push(en ? `Not verified: ${nErr} error(s) remain, so the script may not compile yet.` : `مش متحقَّق منه: بقي ${nErr} خطأ، ويمكن السكربت ما يشتغل لسا.`);
  else if (nWarn) parts.push(en ? `Not fully verified: ${nWarn} warning(s) remain.` : `مش متحقَّق منه بالكامل: بقي ${nWarn} ملاحظة.`);
  parts.push(en ? "If TradingView shows an error, paste it here and I will fix it." : "إذا طلعلك خطأ بـ TradingView الصقه هون وبصلّحه.");
  return parts.join(" ");
}

function templatePayload(t, lang) {
  const check = checkPine(t.code);
  return { kind: "script", code: check.code, file: t.file, title: t.title.en, explain: t.explain[lang === "en" ? "en" : "ar"], base: "template:" + t.id, report: { ...summarizeCheck(check), rounds: 0, history: [], unappliedEdits: 0, verified: check.clean }, model: null };
}

// ---------- handler ----------

export async function handle(req, ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  let CORS = corsFor(req, false);
  let json = jsonWith(CORS);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") {
    // `rev` changes whenever the knowledge pack changes: an easy way to confirm which build is live.
    return json({ ok: true, hasKey: !!key, mode: "indicators", streaming: true, engine: 2, rev: SYSTEM_PROMPT.length, templates: TEMPLATES.map((t) => ({ id: t.id, title: t.title, file: t.file })) });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

  // Bounded body: the largest real request is a few attachments of about a megabyte each.
  const tooLarge = () => json({ kind: "error", message: "The request is too large. Send smaller files." }, 413);
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return tooLarge();
  let raw = "";
  try { raw = await req.text(); } catch (e) {}
  if (raw.length > MAX_BODY) return tooLarge();
  let body = {};
  try { body = JSON.parse(raw); } catch (e) {}
  raw = "";
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  const v2 = Number(body.v) >= 2;
  const admin = isAdmin(body);
  if (admin) { CORS = corsFor(req, true); json = jsonWith(CORS); }
  if (!admin && !originAllowed(req)) return json({ kind: "error", message: "This site is not allowed to use the service." }, 403);
  if (body.mode === "stats") return admin ? json(await readStats()) : json({ kind: "error", message: "Not allowed." }, 403);
  const mode = ["build", "fix", "template", "lint"].includes(body.mode) ? body.mode : "build";
  const split = splitHistory(body.messages);
  const { history, lastAssistantText } = split;
  let userContent = split.userContent;
  let userText = textOf(userContent);
  // Arabic text always gets an Arabic answer; otherwise the page language decides.
  const lang = hasArabic(userText) ? "ar" : body.lang === "ar" ? "ar" : body.lang === "en" ? "en" : userText.trim() ? "en" : "ar";

  // No-model modes first: they are free and instant.
  if ((mode === "template" || mode === "lint") && await overFreeLimit(req, admin)) {
    return json({ kind: "error", message: lang === "en" ? "Too many requests. Please slow down and try again in a minute." : "طلبات كتير ورا بعض. استنى دقيقة وجرّب." }, 429);
  }
  if (mode === "template") {
    const t = TEMPLATE_BY_ID.get(String(body.templateId || "").toLowerCase());
    if (!t) return json({ kind: "error", message: lang === "en" ? "Unknown template." : "قالب غير معروف." }, 404);
    return json(templatePayload(t, body.lang === "en" ? "en" : "ar"));
  }
  if (mode === "lint") {
    const src = String(body.code || "").slice(0, MAX_CODE);
    if (!src.trim()) return json({ kind: "error", message: lang === "en" ? "Paste the Pine code to check." : "الصق كود Pine اللي بدك تفحصه." }, 400);
    const check = checkPine(src);
    return json({ kind: "lint", code: check.code, report: { ...summarizeCheck(check), verified: check.clean } });
  }

  if (!key) { const msg = outageMessage("nokey", lang); return json(v2 ? { kind: "error", message: msg } : { reply: "⚠️ " + msg }); }
  const hasAttachment = Array.isArray(userContent) && userContent.some((b) => b && (b.type === "image" || b.type === "document"));
  if (!userText.trim() && !hasAttachment && mode !== "fix") return json(v2 ? { kind: "error", message: lang === "en" ? "Describe the indicator you want." : "وصّفلي المؤشر اللي بدك ياه." } : { reply: "وصّفلي المؤشر اللي بدك اصمّمه 👇" });
  if (await overLimit(req, admin)) {
    const msg = lang === "en" ? "Daily limit reached. Please try again tomorrow." : "وصلت للحدّ اليومي. جرّب بكرا.";
    return json(v2 ? { kind: "error", message: msg } : { reply: "⚠️ " + msg });
  }

  let currentCode = (v2 ? String(body.code || "") : lastPineBlock(lastAssistantText)).slice(0, MAX_CODE);
  // A script pasted inside the message becomes the current script.
  if (typeof userContent === "string" || !hasAttachment) {
    const pasted = extractPastedScript(userText);
    if (pasted) {
      currentCode = pasted.code.slice(0, MAX_CODE);
      userText = pasted.rest;
      userContent = pasted.rest || (lang === "en" ? "Check this script, fix what is wrong and explain what you changed." : "افحص هالسكربت، صلّح الغلط واشرحلي شو غيّرت.");
    }
  }

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const enc = new TextEncoder();
  // The operator may try another model or effort for one request (used to compare models).
  const state = admin && typeof body.model === "string" && /^claude-[a-z0-9-]+$/.test(body.model) ? { model: body.model } : {};
  const effort = admin && ["low", "medium", "high", "xhigh", "max"].includes(body.effort) ? body.effort : EFFORT;
  const debug = admin && !!body.debug;

  // One switch for the whole request: Stop in the browser, a closed tab or a dropped connection end the model calls.
  const abort = new AbortController();
  if (req.signal) { if (req.signal.aborted) abort.abort(); else req.signal.addEventListener("abort", () => abort.abort(), { once: true }); }

  const stream = new ReadableStream({
    cancel() { abort.abort(); },
    async start(controller) {
      let closed = false;
      const send = (s) => { if (closed) return; try { controller.enqueue(enc.encode(s)); } catch (e) { closed = true; } };
      const emit = v2 ? (ev) => send(JSON.stringify(ev) + "\n") : () => {};
      // Keep the connection alive while the model thinks (no bytes flow during thinking).
      const beat = setInterval(() => (v2 ? emit({ t: "ping" }) : send(" ")), 7000);
      if (v2) emit({ t: "stage", id: "start" }); else send(" ");
      let result = null, outage = "";
      try {
        const currentFile = String(body.file || "").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
        result = await runPipeline({ mode: mode === "fix" ? "fix" : "build", lang, history, userContent, currentCode, currentFile, tvError: body.tvError, callModel: makeCaller(key, deadline, state, abort.signal), emit, deadline, effort, signal: abort.signal });
        result.ms = Date.now() - started;
        if (v2) {
          // Token usage, the model id and the repair history are internal: only sent when the client asks for them.
          const { usage, model, ...pub } = result;
          if (pub.report && !debug) pub.report = { ...pub.report, history: undefined };
          emit({ t: "final", ...pub, ...(debug ? { usage, model } : {}), line: result.kind === "script" ? reportLine(result, lang) : undefined });
        }
        else if (result.kind === "script") send("```pine\n// FILE: " + result.file + "\n" + result.code.trimEnd() + "\n```\n\n" + (result.explain ? result.explain + "\n\n" : "") + (result.report.verified ? "✅ " : "⚠️ ") + reportLine(result, lang));
        else send(result.explain || "…");
      } catch (e) {
        if (!abort.signal.aborted) {
          outage = OUTAGE_CODES[errorKind(e)] || "";
          const msg = friendlyError(e, lang);
          if (v2) emit({ t: "error", message: msg }); else send("\n⚠️ " + msg);
        }
      } finally {
        clearInterval(beat);
        closed = true;
        try { controller.close(); } catch (e) {}
        // Stats are best-effort and must not delay the reply.
        const p = recordStats(result, abort.signal.aborted && !result ? "cancelled" : mode, Date.now() - started, body.tvError, outage).catch(() => {});
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
      }
    },
  });
  return new Response(stream, { headers: { "content-type": v2 ? "application/x-ndjson; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", ...CORS } });
}

export default handle;
