// Brain on Telegram — Vercel NODE function (long-running: an indicator can take a couple of minutes).
//
// POST  = incoming Telegram update -> Brain answers (text, voice note or photo), or builds a TradingView indicator
//         through the Nexus engine (the same engine as /api/indicator) and sends the .pine file.
// GET ?setup=1  = one-time: registers this URL as the bot webhook, returns the bot's @username and sends a hello.
//
// Memory (KV store): the last turns of the conversation (48 h), notes Ahmad asks Brain to remember, and the last
// indicator delivered (so "add an alert" or a pasted TradingView error edits it). Without the store the bot still
// works, one message at a time.
//
// Commands: /new (new conversation) · /remember <text> · /notes · /forget <n|all> · /ind <idea> (force the indicator
// engine) · /chat <text> (force a normal answer) · /status · /report (latest daily self-check) · /help
//
// Env: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (+ TG_LOCK=1 to answer only that chat),
// BRAIN_MODEL (default claude-sonnet-5-5), GROQ_API_KEY (voice notes in; voice replies out), KV_REST_API_URL/TOKEN.
import { runPipeline } from "./_nexus/engine.js";
import { makeCaller, friendlyError, kvPipeline } from "./_nexus/handler.js";
import { KNOWLEDGE_REV } from "./_nexus/knowledge.js";
import { LESSONS } from "./_nexus/lessons.js";
import { saveItem, listItems, getItem } from "./_brain/library.js";
import { buildReport, storeReport, latestReport, chatText, sydneyDay } from "./_brain/market.js";

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-5-5";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const HIST_TURNS = 24; // messages kept per chat
const HIST_TTL = 172800; // 48 h
const IND_BUDGET_MS = Number(process.env.TG_INDICATOR_BUDGET_MS) || 250000;

// Telegram gets its 200 at once and the work continues in the background (waitUntil keeps the function alive);
// without the package (local tests) the work is awaited before answering.
let vercelWaitUntil = null;
try { vercelWaitUntil = (await import("@vercel/functions")).waitUntil; } catch (e) {}

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad, replying to him over Telegram. You are his right hand: you get things done, you don't stall.

ABOUT AHMAD'S BUSINESS (answer as an insider; no need to ask basics):
- Runs "Urban Sydney Wide Solutions" (USWS) — a landscaping company across Sydney, Australia. Website: usws.com.au.
- Services: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features. (He does NOT do fencing and does NOT do grass mowing/maintenance — never offer these.)
- Contact: phone/WhatsApp 0434 449 997, email info@usws.com.au, ABN 20 386 532 878, open 24 hrs, free on-site quotes, fully insured.
- Serves Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown.
- Ahmad also trades (forex / gold / crypto, SMC — smart money concepts) and builds TradingView indicators and small web tools. His indicator builder is "Brain Indicators" (also reachable from this chat: he can just describe an indicator, or type /ind <idea>, and you build it).

WHAT YOU DO:
- Reply to customers: professional, warm, ready-to-send messages and quote wording. Always include a clear next step.
- Trading: analysis (also of chart photos he sends), SMC checklists, trade plans (entry/stop/target + R:R), risk rules. You are NOT a licensed financial advisor — give frameworks and education, not guaranteed calls. Never claim to place real trades.
- Search the web when the answer needs current or external information (prices, news, facts, products): you have a web_search tool. Mention the source briefly. Never claim you cannot access the internet.
- Help with anything else: drafts, plans, ideas, quick answers.

RULES (Telegram):
- LANGUAGE (critical): Mirror the user's language EXACTLY, every message. If their message is in English, reply ONLY in English. If it is in Arabic, reply in Levantine Arabic. Judge by the CURRENT message; if they switch, switch with them. Never mix the two in one reply.
- Keep it concise and chat-friendly — this is a chat app, not a document. Short paragraphs, no heavy markdown (no headings, no tables), no long code blocks unless explicitly asked. Lead with the answer.
- Be proactive: if a request is clear, just do it. Only ask when you truly cannot proceed.
- Use the NOTES below as facts Ahmad told you earlier; use the conversation so far for context.`;

// ---------- small helpers ----------
const hasArabic = (s) => /[؀-ۿ]/.test(String(s || ""));
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
function send(res, obj, status) { res.setHeader("content-type", "application/json; charset=utf-8"); res.statusCode = status || 200; res.end(JSON.stringify(obj, null, 2)); }
function tgApi(token, method) { return "https://api.telegram.org/bot" + token + "/" + method; }
function sydneyNow() {
  try { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }).format(new Date()) + " (Sydney)"; } catch (e) { return new Date().toUTCString(); }
}

// ---------- KV memory (best-effort) ----------
async function kvGetJson(key) {
  const res = await kvPipeline([["GET", key]]);
  const raw = res && res[0] && res[0].result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function kvSetJson(key, value, ttl) { return kvPipeline([["SET", key, JSON.stringify(value), "EX", ttl]]); }
async function seenUpdate(id) {
  // Telegram re-sends an update when the webhook was slow: the first delivery is the one that works.
  if (!id) return false;
  const res = await kvPipeline([["SET", "tg:upd:" + id, "1", "NX", "EX", 900]]);
  return !!(res && res[0] && res[0].result === null);
}
const histKey = (c) => "tg:hist:" + c, notesKey = (c) => "tg:notes:" + c, indKey = (c) => "tg:ind:" + c;

// ---------- Telegram API ----------
async function tg(token, method, body) {
  try {
    const r = await fetch(tgApi(token, method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({}));
  } catch (e) { return {}; }
}
async function sendText(token, chatId, text) {
  let s = String(text || "").trim() || "…";
  const chunks = [];
  while (s.length > 3900) { let cut = s.lastIndexOf("\n", 3900); if (cut < 2000) cut = 3900; chunks.push(s.slice(0, cut)); s = s.slice(cut).trim(); }
  chunks.push(s);
  for (const c of chunks) await tg(token, "sendMessage", { chat_id: chatId, text: c, disable_web_page_preview: true });
}
async function typing(token, chatId, action) { return tg(token, "sendChatAction", { chat_id: chatId, action: action || "typing" }); }
async function sendFile(token, chatId, filename, content, caption, mime) {
  try {
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append("document", new Blob([content], { type: mime || "text/plain" }), filename);
    if (caption) fd.append("caption", clip(caption, 1000));
    const r = await fetch(tgApi(token, "sendDocument"), { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    return !!(j && j.ok);
  } catch (e) { return false; }
}
async function tgFileUrl(token, fileId) {
  try {
    const r = await fetch(tgApi(token, "getFile") + "?file_id=" + encodeURIComponent(fileId));
    const j = await r.json();
    if (!j.ok || !j.result || !j.result.file_path) return null;
    return "https://api.telegram.org/file/bot" + token + "/" + j.result.file_path;
  } catch (e) { return null; }
}
async function fetchBase64(url, maxBytes) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return buf.toString("base64");
  } catch (e) { return null; }
}

// ---------- voice ----------
async function transcribe(audioUrl) {
  const groq = process.env.GROQ_API_KEY, oai = process.env.OPENAI_API_KEY;
  if (!groq && !oai) return { none: true };
  if (!audioUrl) return { text: "" };
  try {
    const a = await fetch(audioUrl);
    const blob = new Blob([await a.arrayBuffer()], { type: "audio/ogg" });
    const fd = new FormData();
    fd.append("file", blob, "voice.ogg");
    fd.append("model", groq ? "whisper-large-v3-turbo" : "whisper-1");
    const r = await fetch(groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + (groq || oai) }, body: fd });
    const j = await r.json();
    return { text: (j && j.text) || "" };
  } catch (e) { return { text: "" }; }
}
function chunkForTTS(text, maxLen, maxChunks) {
  const out = [];
  let s = String(text || "").replace(/\s+/g, " ").trim();
  while (s.length && out.length < maxChunks) {
    if (s.length <= maxLen) { out.push(s); break; }
    let cut = s.lastIndexOf(" ", maxLen);
    const punct = Math.max(s.lastIndexOf(". ", maxLen), s.lastIndexOf("، ", maxLen), s.lastIndexOf("؟ ", maxLen), s.lastIndexOf("! ", maxLen), s.lastIndexOf("\n", maxLen));
    if (punct > maxLen * 0.5) cut = punct + 1;
    if (cut <= 0) cut = maxLen;
    out.push(s.slice(0, cut).trim());
    s = s.slice(cut).trim();
  }
  return out;
}
async function ttsGroqClip(text) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const isAr = hasArabic(text);
  const model = isAr ? "canopylabs/orpheus-arabic-saudi" : "canopylabs/orpheus-v1-english";
  const voice = isAr ? (process.env.ORPHEUS_VOICE_AR || "Fahad") : (process.env.ORPHEUS_VOICE_EN || "Daniel");
  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify({ model, voice, input: text.slice(0, 200), response_format: "wav" }) });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch (e) { return null; }
}
async function sendVoiceReply(token, chatId, text) {
  const chunks = chunkForTTS(text, 190, 3);
  let sent = 0;
  for (const c of chunks) {
    const audio = await ttsGroqClip(c);
    if (!audio) break;
    let ok = false;
    try {
      const fd = new FormData();
      fd.append("chat_id", String(chatId)); fd.append("audio", new Blob([audio], { type: "audio/wav" }), "brain.wav"); fd.append("title", "Brain");
      const j = await (await fetch(tgApi(token, "sendAudio"), { method: "POST", body: fd })).json().catch(() => ({}));
      ok = !!(j && j.ok);
    } catch (e) {}
    if (!ok) ok = await sendFile(token, chatId, "brain.wav", audio, "", "audio/wav");
    if (ok) sent++; else break;
  }
  return sent > 0;
}

// ---------- Brain (chat) ----------
function textOf(content) { return typeof content === "string" ? content : Array.isArray(content) ? content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n") : ""; }
async function askBrain(key, history, userContent, notes) {
  const sys = SYSTEM + "\n\nNOW: " + sydneyNow() + (notes && notes.length ? "\n\nNOTES AHMAD ASKED YOU TO REMEMBER:\n- " + notes.join("\n- ") : "");
  const msgs = [];
  for (const m of history || []) {
    const text = clip(String(m.content || ""), 4000);
    if (!text) continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n\n" + text;
    else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: userContent });
  const body = (tools) => JSON.stringify(Object.assign({ model: MODEL, max_tokens: 2000, system: sys, messages: msgs }, tools ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}));
  const call = (tools) => fetch(ANTHROPIC, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: body(tools) });
  let r = await call(true);
  if (!r.ok) {
    let t = ""; try { t = await r.text(); } catch (e) {}
    if (/web_search|tool|unsupported|not[_ ]?support|invalid.*tool/i.test(t)) r = await call(false);
    if (!r.ok) {
      let t2 = ""; try { t2 = await r.text(); } catch (e) { t2 = t; }
      if (/401|invalid x-api-key|authentication/i.test(t2)) return "⚠️ Brain: مشكلة بمفتاح API.";
      if (/credit|billing|quota|insufficient|402/i.test(t2)) return "⚠️ Brain: الرصيد خلص — اشحن حساب Anthropic.";
      if (/429|rate|overloaded|529/i.test(t2)) return "⚠️ ضغط مؤقت، جرّب بعد شوي.";
      if (/404|model|not_found/i.test(t2)) return "⚠️ Brain: اسم الموديل غير متاح (" + MODEL + ").";
      return "⚠️ Brain error " + r.status;
    }
  }
  const j = await r.json();
  const txt = (j && j.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();
  return txt || "…";
}

// ---------- indicator requests ----------
const IND_WORDS = /(مؤشر|مؤشّر|مؤشرات|اندكيتر|إندكيتر|انديكيتر|indicator|pine\s*script|pinescript|\bpine\b|ستراتيجي|استراتيجي|strategy|سكربت تريدنغ)/i;
const BUILD_WORDS = /(ابني|ابنيلي|اعمل|اعملي|سوي|سويلي|صمم|صمّم|صممي|بدي|أبي|اريد|أريد|جهز|جهّز|اكتب|اكتبلي|طلعلي|حضرلي|build|make|create|design|write|code|generate|want|need|give me)/i;
const EDIT_WORDS = /(عدل|عدّل|غير|غيّر|ضيف|زيد|شيل|احذف|صلح|صلّح|خلي|خلّي|بدّل|بدل|صغّر|كبّر|change|add|remove|delete|fix|edit|modify|update|make it|instead|rename|color|colour|alert)/i;
const TV_ERROR = /^\s*(?:error|line \d+|mismatched input|undeclared identifier|cannot call|syntax error|could not find function|the function)/i;
function wantsIndicator(text, hasLast) {
  const t = String(text || "");
  if (/^\/(?:ind|indicator)\b/i.test(t)) return "build";
  if (/^\/chat\b/i.test(t)) return "";
  if (hasLast && TV_ERROR.test(t)) return "fix";
  if (IND_WORDS.test(t) && BUILD_WORDS.test(t)) return "build";
  if (hasLast && EDIT_WORDS.test(t) && IND_WORDS.test(t)) return "edit";
  return "";
}
function stripCmd(t) { return String(t || "").replace(/^\/(?:ind|indicator|chat)\b\s*/i, "").trim(); }

async function buildIndicator({ key, token, chatId, text, image, last, kind, lang }) {
  const en = lang === "en";
  await sendText(token, chatId, kind === "fix" ? (en ? "🛠️ Fixing the script against that error…" : "🛠️ عم صلّح السكربت على هالخطأ…") : kind === "edit" ? (en ? "✏️ Editing your indicator…" : "✏️ عم عدّل على مؤشرك…") : (en ? "⏳ Building your indicator… usually half a minute to two minutes." : "⏳ عم ابني المؤشر… عادةً من نص دقيقة لدقيقتين."));
  await typing(token, chatId, "upload_document");
  const deadline = Date.now() + IND_BUDGET_MS;
  const userContent = image ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }, { type: "text", text: text || (en ? "Design an indicator from this chart picture." : "صمّم مؤشر من صورة الشارت هاي.") }] : text;
  const keepAlive = setInterval(() => { typing(token, chatId, "upload_document").catch(() => {}); }, 8000);
  let result;
  try {
    result = await runPipeline({ mode: kind === "fix" ? "fix" : "build", lang, history: [], userContent, currentCode: last && (kind === "edit" || kind === "fix") ? last.code : "", currentFile: last ? last.file : "", tvError: kind === "fix" ? text : undefined, callModel: makeCaller(key, deadline, {}, undefined), emit: () => {}, deadline, effort: "medium" });
  } catch (e) {
    clearInterval(keepAlive);
    await sendText(token, chatId, "⚠️ " + friendlyError(e, lang));
    return null;
  }
  clearInterval(keepAlive);
  if (result.kind !== "script") { await sendText(token, chatId, result.explain || "…"); return { text: result.explain || "" }; }
  const r = result.report;
  const line = r.verified ? (en ? "✅ Checked automatically: 0 errors. Paste it into the Pine Editor and press Add to chart." : "✅ انفحص تلقائياً: 0 أخطاء. الصقه بالـ Pine Editor واضغط Add to chart.")
    : (en ? `⚠️ Not fully verified: ${r.errors.length} error(s) / ${r.warnings.length} finding(s) remain. If TradingView shows an error, paste it here and I will fix it.` : `⚠️ مش متحقَّق منه بالكامل: بقي ${r.errors.length} خطأ / ${r.warnings.length} ملاحظة. إذا TradingView طلّع خطأ الصقه هون وبصلّحه.`);
  const caption = clip((result.title ? "📈 " + result.title + "\n" : "") + line, 1000);
  const ok = await sendFile(token, chatId, result.file || "nexus_indicator.pine", result.code, caption);
  if (!ok) await sendText(token, chatId, "```\n" + result.code.slice(0, 3800) + "\n```");
  if (result.explain) await sendText(token, chatId, result.explain);
  if (!r.verified && r.errors.length) await sendText(token, chatId, (en ? "Findings:\n" : "الملاحظات:\n") + r.errors.slice(0, 4).map((e) => (e.line ? "L" + e.line + ": " : "") + e.message).join("\n"));
  // Saved to the library (the same one as the web page), so it can be opened and edited later anywhere.
  let libId = "";
  try {
    const target = last && last.libId && (kind === "edit" || kind === "fix") ? last.libId : undefined;
    const sv = await saveItem({ id: target, code: result.code, file: result.file, title: result.title, request: text, verified: !!r.verified, errors: r.errors, source: "telegram" });
    if (sv.ok) { libId = sv.id; await sendText(token, chatId, target ? (en ? "💾 Saved over the same indicator in My indicators." : "💾 انحفظ التعديل على نفس المؤشر بمؤشراتي.") : (en ? "💾 Saved to My indicators (/saved to list them)." : "💾 انحفظ بمؤشراتي (/saved لتشوفهم).")); }
  } catch (e) {}
  return { text: (en ? "[indicator delivered: " : "[تم تسليم مؤشر: ") + (result.file || "script.pine") + "] " + clip(result.explain, 600), file: result.file, code: result.code, libId };
}

// ---------- commands ----------
const HELP = "🧠 Brain على تيليغرام\n\n• احكيني أي شي (نص أو صوت) وبردّ عليك — عربي أو إنجليزي.\n• ابعتلي صورة شارت وبحلّلها.\n• وصّفلي مؤشر TradingView (أو /ind + الفكرة) وببنيه وببعتلك ملف الـ .pine. بعدها قلّي \"ضيف تنبيه\" أو الصق خطأ TradingView وبعدّله.\n\nأوامر:\n/new — محادثة جديدة\n/remember <شي> — احفظ معلومة\n/notes — شو محفوظ\n/forget <رقم|all> — امسح\n/status — حالة المحرك\n/report — آخر تقرير يومي\n/market — تقرير الذهب والنفط والمؤشرات الأمريكية (/market now لتقرير جديد)\n/saved — مؤشراتي المحفوظة\n/open <رقم> — افتح مؤشر محفوظ للتعديل\n/chat <نص> — جواب عادي حتى لو فيه كلمة مؤشر";

async function handleCommand({ text, chatId, token, notes, saveNotes, clearHistory }) {
  const t = String(text || "").trim();
  if (/^\/market\b/i.test(t) || /^(تقرير السوق|تقرير الأسواق|الأسواق اليوم|market report)$/i.test(t)) {
    const fresh = /\b(now|new|جديد|هلق|هلّق)\b/i.test(t);
    let rep = fresh ? null : await latestReport().catch(() => null);
    if (rep && rep.day !== sydneyDay()) rep = null;
    if (!rep) {
      await sendText(token, chatId, "🔎 عم جمّع أخبار السوق وجهّز التقرير… (دقيقة أو دقيقتين)");
      try { rep = await buildReport({ key: process.env.ANTHROPIC_API_KEY }); await storeReport(rep).catch(() => {}); }
      catch (e) { await sendText(token, chatId, "⚠️ ما قدرت جهّز تقرير السوق هلّق. جرّب بعد شوي."); return true; }
    }
    await sendText(token, chatId, chatText(rep));
    return true;
  }
  if (/^\/saved\b/i.test(t) || /^(مؤشراتي|مؤشراتي المحفوظة|my indicators)$/i.test(t)) {
    const items = await listItems().catch(() => null);
    if (!items) { await sendText(token, chatId, "⚠️ ما قدرت وصل للمكتبة هلّق."); return true; }
    if (!items.length) { await sendText(token, chatId, "📚 ما في مؤشرات محفوظة لسا. ابنيلك واحد وبينحفظ لحاله."); return true; }
    const d = (ms) => { try { return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" }).format(new Date(ms)); } catch (e) { return ""; } };
    await sendText(token, chatId, "📚 مؤشراتي المحفوظة (آخر 15):\n" + items.slice(0, 15).map((it, i) => `${i + 1}. ${it.verified ? "✅" : "⚠️"} ${it.name} — ${it.file} · ${d(it.updated)}`).join("\n") + "\n\nاكتب /open <رقم> لتفتح واحد وتعدّل عليه.");
    return true;
  }
  const op = /^\/open\s*(\d+)/i.exec(t);
  if (op) {
    const items = await listItems().catch(() => null);
    const pick = items && items[Number(op[1]) - 1];
    if (!pick) { await sendText(token, chatId, "ما في مؤشر بهالرقم. اكتب /saved لتشوف القائمة."); return true; }
    const it = await getItem(pick.id).catch(() => null);
    if (!it) { await sendText(token, chatId, "⚠️ ما قدرت افتحه هلّق."); return true; }
    await kvSetJson(indKey(chatId), { file: it.file, code: it.code, libId: it.id, at: Date.now() }, 7 * 86400).catch(() => {});
    const ok = await sendFile(token, chatId, it.file, it.code, "📂 " + it.name + "\nهلّق أي تعديل بتطلبه (مثلاً \"ضيف تنبيه\") بيصير على هالمؤشر وبينحفظ عليه.");
    if (!ok) await sendText(token, chatId, "📂 فتحت " + it.name + ". اطلب التعديل اللي بدك ياه.");
    return true;
  }
  if (/^\/(start|help)\b/i.test(t)) { await sendText(token, chatId, HELP); return true; }
  if (/^\/new\b/i.test(t) || /^(محادثة جديدة|ابدأ من جديد|new chat)$/i.test(t)) { await clearHistory(); await sendText(token, chatId, "🆕 بدينا محادثة جديدة."); return true; }
  const rem = /^(?:\/remember\s+|تذكّر\s+|تذكر\s+|احفظ\s+|remember\s+)(.+)/is.exec(t);
  if (rem) {
    const n = clip(rem[1].replace(/\s+/g, " ").trim(), 300);
    if (n) { notes.push(n); if (notes.length > 30) notes.shift(); await saveNotes(notes); }
    await sendText(token, chatId, n ? "📌 حفظتها: " + n : "شو بدك احفظ؟"); return true;
  }
  if (/^\/notes\b/i.test(t) || /^(شو بتتذكر|شو محفوظ|what do you remember)\??$/i.test(t)) {
    await sendText(token, chatId, notes.length ? "📌 المحفوظ:\n" + notes.map((x, i) => (i + 1) + ". " + x).join("\n") + "\n\n/forget <رقم> لمسح وحدة، /forget all للكل" : "ما في شي محفوظ. قلّي \"تذكّر ...\" واحفظلك ياه.");
    return true;
  }
  const fg = /^\/forget\s*(\d+|all|الكل)?/i.exec(t);
  if (fg) {
    if (!fg[1]) { await sendText(token, chatId, "/forget <رقم> أو /forget all"); return true; }
    if (/all|الكل/i.test(fg[1])) { notes.length = 0; await saveNotes(notes); await sendText(token, chatId, "🗑️ انمسحت كل الملاحظات."); return true; }
    const i = Number(fg[1]) - 1;
    if (i >= 0 && i < notes.length) { const gone = notes.splice(i, 1)[0]; await saveNotes(notes); await sendText(token, chatId, "🗑️ انمسحت: " + gone); } else await sendText(token, chatId, "ما في ملاحظة بهالرقم.");
    return true;
  }
  if (/^\/status\b/i.test(t)) {
    await sendText(token, chatId, `⚙️ Brain شغّال\nالنموذج: ${MODEL}\nمحرك المؤشرات: rev ${KNOWLEDGE_REV} · ${LESSONS.length} درس\nالذاكرة: ${process.env.KV_REST_API_URL ? "مفعّلة" : "غير مفعّلة"}`);
    return true;
  }
  if (/^\/report\b/i.test(t)) {
    const r = await kvGetJson("nx:daily:latest");
    if (!r) { await sendText(token, chatId, "ما في تقرير يومي بعد — أول تقرير بيوصل بعد أول فحص ذاتي (كل يوم الصبح)."); return true; }
    const b = r.bench || { total: 0, passed: 0, cases: [] };
    await sendText(token, chatId, `🧠 آخر تقرير يومي · ${r.day}\n🧪 اختبار المؤشرات: ${b.passed}/${b.total}\n${b.cases.map((c) => (c.pass ? "✅ " : "❌ ") + c.id).join("\n")}\n📊 أمس: ${r.stats && r.stats.yesterday ? r.stats.yesterday.requests + " طلب · " + r.stats.yesterday.verified + " متحقَّق · 👍" + r.stats.yesterday.fbUp + " 👎" + r.stats.yesterday.fbDown : "لا بيانات"}\n⚙️ rev ${r.engineRev} · ${r.lessons} درس`);
    return true;
  }
  return false;
}

// ---------- body / setup ----------
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((resolve) => {
    let data = ""; req.on("data", (c) => { data += c; if (data.length > 4e6) data = data.slice(0, 4e6); }); req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); } }); req.on("error", () => resolve({}));
  });
}
async function setup(req, res, token) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const hook = "https://" + host + "/api/telegram";
  const out = { hook };
  try { const me = await (await fetch(tgApi(token, "getMe"))).json(); out.bot = me.result ? "@" + me.result.username : me; out.open = me.result ? "https://t.me/" + me.result.username : null; } catch (e) { out.getMe_error = String(e); }
  out.setWebhook = await tg(token, "setWebhook", { url: hook, allowed_updates: ["message"], drop_pending_updates: true });
  await tg(token, "setMyCommands", { commands: [{ command: "new", description: "محادثة جديدة" }, { command: "ind", description: "ابني مؤشر TradingView" }, { command: "remember", description: "احفظ معلومة" }, { command: "notes", description: "شو محفوظ" }, { command: "status", description: "حالة Brain" }, { command: "report", description: "آخر تقرير يومي" }, { command: "market", description: "تقرير الأسواق اليوم" }, { command: "saved", description: "مؤشراتي المحفوظة" }, { command: "open", description: "افتح مؤشر محفوظ" }, { command: "help", description: "مساعدة" }] });
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) { await sendText(token, chatId, "👋 أهلاً أحمد، Brain تحدّث: صار عندي ذاكرة للمحادثة، بشوف الصور، وبتقدر تطلب مني مؤشر TradingView مباشرة من هون (/ind + الفكرة أو بس احكيلي). اكتب /help للأوامر."); out.hello_sent_to = chatId; }
  return send(res, out);
}

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (req.method === "GET") {
    const q = req.query || {};
    if (String(q.setup) !== "1") return send(res, { ok: true, info: "Brain Telegram webhook. Visit ?setup=1 once to activate.", model: MODEL, engineRev: KNOWLEDGE_REV });
    if (!token) return send(res, { ok: false, error: "TELEGRAM_BOT_TOKEN missing in Vercel env" }, 500);
    return setup(req, res, token);
  }
  if (req.method !== "POST") { res.statusCode = 405; return res.end("POST only"); }

  try {
    const update = await readJson(req);
    const msg = update.message || update.edited_message || null;
    if (!msg || !token) return send(res, { ok: true });
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return send(res, { ok: true });
    if (process.env.TG_LOCK === "1" && process.env.TELEGRAM_CHAT_ID && String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) return send(res, { ok: true, ignored: "locked" });
    if (await seenUpdate(update.update_id)) return send(res, { ok: true, ignored: "duplicate" });

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { await sendText(token, chatId, "🔌 Brain غير مفعّل — ناقص ANTHROPIC_API_KEY."); return send(res, { ok: true }); }

    // ---- what arrived ----
    let text = String(msg.text || msg.caption || "").trim();
    let heard = "";
    let image = null;
    const voiceObj = msg.voice || msg.audio || msg.video_note;
    if (!text && voiceObj) {
      await typing(token, chatId);
      const tr = await transcribe(await tgFileUrl(token, voiceObj.file_id));
      if (tr.none) { await sendText(token, chatId, "🎤 عشان أفهم الصوت لازم مفتاح تحويل صوت لنص (مجاني من Groq). قلّي وبجهّزلك إياه — أو اكتبلي نص لهلّأ."); return send(res, { ok: true }); }
      heard = (tr.text || "").trim();
      if (!heard) { await sendText(token, chatId, "🎤 ما قدرت أفهم الصوت، جرّب تسجّل كمان مرة بوضوح."); return send(res, { ok: true }); }
      text = heard;
    }
    const photo = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : null;
    const imgDoc = msg.document && /^image\/(jpeg|png|webp)$/i.test(msg.document.mime_type || "") && (msg.document.file_size || 0) <= 4000000 ? msg.document : null;
    if (photo || imgDoc) {
      await typing(token, chatId);
      image = await fetchBase64(await tgFileUrl(token, (photo || imgDoc).file_id), 4000000);
      if (!image) { await sendText(token, chatId, "📎 ما قدرت أنزّل الصورة، جرّب تبعتها مرة تانية."); return send(res, { ok: true }); }
    }
    if (!text && !image) {
      if (msg.video || msg.document || msg.sticker) await sendText(token, chatId, "📎 بشوف الصور وبسمع الصوت وبقرأ النص — الفيديو والملفات التانية لسا لا. ابعتلي صورة أو اكتبلي.");
      else await sendText(token, chatId, HELP);
      return send(res, { ok: true });
    }

    // ---- memory ----
    const [history, notes, last] = await Promise.all([kvGetJson(histKey(chatId)), kvGetJson(notesKey(chatId)), kvGetJson(indKey(chatId))]);
    const hist = Array.isArray(history) ? history : [];
    const noteList = Array.isArray(notes) ? notes : [];
    const saveHist = (h) => kvSetJson(histKey(chatId), h.slice(-HIST_TURNS), HIST_TTL).catch(() => {});
    const saveNotes = (n) => kvSetJson(notesKey(chatId), n, 60 * 86400).catch(() => {});
    const clearHistory = () => kvPipeline([["DEL", histKey(chatId)], ["DEL", indKey(chatId)]]).catch(() => {});

    if (text && !image && await handleCommand({ text, chatId, token, notes: noteList, saveNotes, clearHistory })) return send(res, { ok: true });

    const lang = hasArabic(text) ? "ar" : text ? "en" : "ar";
    const lastValid = last && last.code && Date.now() - (last.at || 0) < 7 * 86400000 ? last : null;
    const kind = wantsIndicator(text, !!lastValid) || (image && IND_WORDS.test(text) ? "build" : "");
    const shown = (heard ? "🎙️ " : "") + (image ? "[photo] " : "") + text;

    if (kind) {
      const req2 = stripCmd(text);
      const out = await buildIndicator({ key, token, chatId, text: req2, image, last: lastValid, kind, lang });
      hist.push({ role: "user", content: clip(shown, 2000), at: Date.now() });
      if (out) { hist.push({ role: "assistant", content: clip(out.text, 2000), at: Date.now() }); if (out.code) await kvSetJson(indKey(chatId), { file: out.file, code: out.code, libId: out.libId || "", at: Date.now() }, 7 * 86400).catch(() => {}); }
      await saveHist(hist);
      return send(res, { ok: true });
    }

    // ---- normal chat ----
    await typing(token, chatId);
    const content = image ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }, { type: "text", text: text || (lang === "en" ? "What do you see? If it is a chart, analyze it (SMC: trend, liquidity, points of interest, scenario)." : "شو بتشوف بالصورة؟ إذا شارت حلّله (SMC: اتجاه، سيولة، مناطق اهتمام، سيناريو).") }] : text;
    const reply = await askBrain(key, hist, content, noteList);
    await sendText(token, chatId, heard ? "🎙️ سمعت: " + heard + "\n\n" + reply : reply);
    hist.push({ role: "user", content: clip(shown, 2000), at: Date.now() }, { role: "assistant", content: clip(reply, 3000), at: Date.now() });
    await saveHist(hist);
    if (heard && !/^⚠️/.test(reply)) await sendVoiceReply(token, chatId, reply);
    return send(res, { ok: true });
  } catch (e) {
    // Always 200 so Telegram does not hammer retries.
    return send(res, { ok: true, error: clip(e && e.message, 200) });
  }
}
