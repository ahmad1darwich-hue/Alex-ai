// Brain — general assistant (Vercel EDGE function, streaming).
// Edge + streaming avoids the 10s serverless cap, so long answers finish.
// Can fetch live prices (gold/silver/crypto) before answering. Uses env ANTHROPIC_API_KEY.
// Private: every request must carry the owner's key (see _brain/lock.js).
import { brainAuth, lockedReply } from "./_brain/lock.js";
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-5-5";
// Tried in order when the configured model is not available to the account.
const FALLBACKS = (process.env.BRAIN_FALLBACK_MODELS || "claude-sonnet-4-5").split(",").map((x) => x.trim()).filter(Boolean);
const isAdaptive = (m) => /^claude-(?:opus|sonnet|fable|mythos|haiku)-(?:[5-9]|4-[6-9])/.test(m);
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad. You are his right hand: you get things done, you don't stall.

ABOUT AHMAD'S BUSINESS (answer as an insider; no need to ask basics):
- Runs "Urban Sydney Wide Solutions" (USWS) — a landscaping company across Sydney, Australia. Website: usws.com.au.
- Services: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features. (He does NOT do fencing and does NOT do grass mowing/maintenance — never offer these.)
- Contact: phone/WhatsApp 0434 449 997, email info@usws.com.au, ABN 20 386 532 878, open 24 hrs, free on-site quotes, fully insured.
- Serves Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown.
- Ahmad also trades (forex / SMC — smart money concepts) and builds small web tools and projects.

WHAT YOU DO:
- Reply to customers: professional, warm, ready-to-send emails/WhatsApp messages and quote wording. Always include the phone/WhatsApp and a clear next step.
- Trading: analysis, SMC checklists, trade plans (entry/stop/target + R:R), risk rules, journaling templates. You are NOT a licensed financial advisor — give frameworks and education, not guaranteed calls. Never claim to place real trades.
- Build things: complete, self-contained web pages, calculators, scripts, templates, content, plans and step-by-step workflows.
- Search the web: you CAN search the internet (web_search tool) for current, real information — news, live prices, facts, people, products, how-tos, anything after your training. Use it whenever the answer needs up-to-date or external info, or when you're not certain, then answer with what you found and mention the source briefly. Don't claim you can't access the internet.

RULES:
- LANGUAGE (critical): Mirror the user's language EXACTLY, every single message. If their latest message is in English, reply ONLY in English. If it is in Arabic, reply in Levantine Arabic. Judge by the language of the CURRENT message, not earlier ones — if they switch, you switch with them. Never mix the two languages in one reply and never answer in a language they did not just use. Match their tone.
- Be concise and genuinely useful — lead with the answer, no filler. Give full, complete deliverables when asked to build or write something.
- Be proactive: if a request is clear, just do it. Only ask a question when you truly cannot proceed.
- Write normal replies — customer messages, emails, WhatsApp texts, quotes, checklists, plans, trade analysis — as PLAIN TEXT. Never wrap them in code fences (\`\`\`). Fences are ONLY for an actual file the user will save or run.
- When you DO produce such a file (a web page, script, template, calculator), output it as ONE fenced code block whose FIRST line names it, e.g.:
\`\`\`html
<!-- FILE: index.html -->
...complete self-contained file...
\`\`\`
  Make web pages mobile-friendly and self-contained (inline CSS/JS).
- THINK LIKE A SENIOR OPERATOR: for anything non-trivial, work out the goal, the facts you need, and the plan before you answer; check your own numbers; end with the concrete next step(s) Ahmad should take.
- You can read web pages (web_fetch tool) as well as search: open the best sources and read them instead of guessing from snippets.
- If a LIVE DATA block is included below, it was fetched from the internet just now — use those real numbers and say "as of now". If asked for live data not provided, say you can fetch prices for gold/silver/BTC/ETH but not that item yet.`;

async function timedFetch(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 3000);
  try { return await fetch(url, Object.assign({ signal: c.signal }, opts || {})); }
  finally { clearTimeout(t); }
}
async function liveData(text) {
  const q = (text || "").toLowerCase(), out = [];
  const gold = /gold|ذهب|xau/i.test(q), silver = /silver|فض[ةه]|xag/i.test(q);
  const btc = /bitcoin|btc|بيتكوين|بتكوين/i.test(q), eth = /ethereum|eth|ايثير|إيثير/i.test(q);
  if (gold || silver) {
    try {
      const r = await timedFetch("https://data-asg.goldprice.org/dbXRates/USD", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" } }, 2500);
      if (r.ok) { const j = await r.json(), it = j && j.items && j.items[0];
        if (it) { if (gold && it.xauPrice) out.push("Gold (XAU) = $" + Number(it.xauPrice).toFixed(2) + "/oz USD");
                  if (silver && it.xagPrice) out.push("Silver (XAG) = $" + Number(it.xagPrice).toFixed(2) + "/oz USD"); } }
    } catch (e) {}
  }
  if (btc || eth) {
    try {
      const ids = [btc ? "bitcoin" : null, eth ? "ethereum" : null].filter(Boolean).join(",");
      const r = await timedFetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd", { headers: { "accept": "application/json" } }, 2500);
      if (r.ok) { const j = await r.json();
        if (j.bitcoin) out.push("Bitcoin (BTC) = $" + j.bitcoin.usd.toLocaleString() + " USD");
        if (j.ethereum) out.push("Ethereum (ETH) = $" + j.ethereum.usd.toLocaleString() + " USD"); }
    } catch (e) {}
  }
  return out.length ? "\n\nLIVE DATA (fetched now, " + new Date().toUTCString() + "):\n- " + out.join("\n- ") : "";
}

// Work modes: the page sends body.mode, or it is inferred from the request.
const MODES = {
  deep: `MODE: DEEP RESEARCH. Act as a research analyst. 1) Break the question into 3-6 sub-questions. 2) Run many web searches (different angles, recent dates, primary sources), open the best pages with web_fetch and read them. 3) Cross-check facts between sources; note disagreements. 4) Deliver: a short bottom line first, then findings grouped by sub-question, numbers with dates, what is uncertain, and a "Sources" list (title — URL). Never invent a source or a number.`,
  workflow: `MODE: WORKFLOW (do the whole job). Turn Ahmad's goal into a numbered plan of concrete steps, then EXECUTE every step you can yourself right now (research with web_search / web_fetch, calculations, drafting emails, messages, quotes, posts, checklists, files). Show each step as "✅ done: ..." with its result, and list the steps only Ahmad can do as "👤 لازم منك:" with exact instructions (where to click, what to send). Finish with the ready-to-use deliverables.`,
  plan: `MODE: PLANS, MAPS & SITE DRAWINGS. The image/PDF is a site plan, survey, architectural/landscape drawing, aerial or Google Maps screenshot, or a job-site photo. 1) Say what it is and read every label, dimension, scale bar, north arrow, levels/RLs and boundary. 2) Work out areas (m²), lengths (lm), volumes (m³: area × depth) for each zone — show the formula; if there is no scale or dimension, say so and estimate from a known reference (car ≈ 4.5 m, door ≈ 0.82 m, standard paver size) and mark it "تقدير". 3) Quantity take-off for USWS services: excavation & spoil, base/road base, concrete, pavers, turf (rolls/m²), retaining wall blocks/sleepers and courses, drainage (ag pipe lm, pits), edging, soil/mulch, plants — add 10% waste. 4) Spot issues: slope/fall and drainage direction, access for machinery, trees, services/easements, council/DA or engineer needs (retaining walls over 600 mm usually need an engineer in NSW — say "check with council"). 5) Give a clean materials list and a quote outline (use Ahmad's rates if he gave them, otherwise leave a "$___" for each line).`,
  files: `MODE: FILE INSPECTION. Read the attached file(s) completely. Say what the file is, summarize the key points, extract every number, date, deadline, amount, name and obligation into a tidy list, flag anything wrong, missing, risky or unusual (wrong totals, unfavourable contract terms, missing ABN/GST, expired dates), and finish with what Ahmad should do next. For spreadsheets/CSV: check totals and give the key figures.`,
  security: `MODE: SECURITY CHECK (defensive only — protecting Ahmad's own business, accounts, website, files and email). You help him: spot phishing / scam emails, fake invoices and payment-change requests (verify by phone on a known number before paying), dangerous attachments (macros, .exe/.scr/.js/.iso/.html attachments, password-protected zips), suspicious links (look-alike domains, URL shorteners, login pages not on the real domain); review his website's security from the PASSIVE CHECK data if given (HTTPS, HSTS, security headers, leaked server versions) and explain fixes for Vercel (vercel.json headers); harden accounts (2-step verification, password manager, recovery codes, Google/Vercel/Meta/bank account checks) and say what to do after a suspected breach (change passwords, sign out all sessions, check forwarding rules and app passwords, notify the bank). Rate each finding 🔴 high / 🟠 medium / 🟢 low with the exact fix. Never help to break into, scan aggressively, or attack systems he does not own.`,
};
function inferMode(text) {
  const s = String(text || "");
  if (/(بحث عميق|ابحث بعمق|deep search|deep research|research deeply)/i.test(s)) return "deep";
  if (/(workflow|ورك ?فلو|سير العمل|نفّذ المهمة كاملة|خطة كاملة ونفذ)/i.test(s)) return "workflow";
  if (/(مخطط|خريطة|خرائط|الخريطة|site plan|floor plan|survey|drawing|blueprint|aerial|google maps)/i.test(s)) return "plan";
  if (/(phishing|احتيال|اختراق|مخترق|هاكر|فيروس|malware|scam|security|أمان|حماية الموقع|سكام)/i.test(s)) return "security";
  return "";
}
// Passive website check (one GET, no probing): HTTPS, redirect, security headers, leaked versions.
async function passiveSiteCheck(text) {
  const m = /(https?:\/\/[^\s"'<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com\.au|com|net\.au|net|org|au|io|app|co)\b)/i.exec(String(text || ""));
  if (!m) return "";
  let host;
  try { host = new URL(/^https?:/i.test(m[1]) ? m[1] : "https://" + m[1]).hostname; } catch (e) { return ""; }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return "";
  const lines = ["Host: " + host];
  try {
    const plain = await timedFetch("http://" + host + "/", { redirect: "manual", headers: { "user-agent": "BrainSecurityCheck/1.0" } }, 5000);
    const loc = plain.headers.get("location") || "";
    lines.push("HTTP -> " + plain.status + (loc ? " redirect to " + loc : "") + (/^https:/i.test(loc) ? " (redirects to HTTPS: good)" : " (no redirect to HTTPS)"));
  } catch (e) { lines.push("HTTP: not reachable"); }
  try {
    const r = await timedFetch("https://" + host + "/", { redirect: "follow", headers: { "user-agent": "BrainSecurityCheck/1.0" } }, 6000);
    lines.push("HTTPS -> " + r.status + " (TLS certificate accepted)");
    for (const h of ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) lines.push(h + ": " + (r.headers.get(h) || "MISSING"));
    for (const h of ["server", "x-powered-by"]) if (r.headers.get(h)) lines.push(h + ": " + r.headers.get(h) + " (version leak?)");
    const ck = r.headers.get("set-cookie");
    if (ck) lines.push("set-cookie flags: " + ["Secure", "HttpOnly", "SameSite"].map((f) => f + (new RegExp(f, "i").test(ck) ? " yes" : " NO")).join(", "));
  } catch (e) { lines.push("HTTPS: failed (" + String(e && e.message || e).slice(0, 80) + ")"); }
  return "\n\nPASSIVE CHECK (fetched now, one normal request, " + new Date().toUTCString() + "):\n- " + lines.join("\n- ");
}

function mapMessages(history) {
  return (Array.isArray(history) ? history : []).map(m => {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: m.text || "" };
  }).filter(m => Array.isArray(m.content) ? m.content.length : m.content);
}
function textOf(c) { if (typeof c === "string") return c; if (Array.isArray(c)) return c.filter(b => b && b.type === "text").map(b => b.text).join(" "); return ""; }

function jsonResp(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }

export default async function handler(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  const auth = brainAuth(req.headers.get("x-brain-key"));
  // The status call tells the page whether this device is activated; it reveals nothing else to other callers.
  if (req.method === "GET") return jsonResp(auth === "ok" ? { ok: true, auth, hasKey: !!key, model: MODEL, streaming: true } : { ok: true, auth });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (auth !== "ok") return jsonResp({ locked: true, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);

  let body = {};
  try { body = await req.json(); } catch (e) {}
  const messages = mapMessages(body.messages);
  if (!key) return jsonResp({ reply: "🔌 Brain غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel." });
  if (!messages.length) return jsonResp({ reply: "اسأل Brain شي 👇" });

  let sys = SYSTEM;
  const lu = [...messages].reverse().find(m => m.role === "user");
  const luText = lu ? textOf(lu.content) : "";
  const hasFile = lu && Array.isArray(lu.content) && lu.content.some((b) => b && (b.type === "document" || (b.type === "text" && /^(File|محتوى الملف|File content)/i.test(String(b.text || "").slice(0, 40)))));
  const mode = MODES[body.mode] ? body.mode : inferMode(luText) || (hasFile ? "files" : "");
  try { const ld = await liveData(luText); if (ld) sys += ld; } catch (e) {}
  if (mode === "security") { try { sys += await passiveSiteCheck(luText); } catch (e) {} }
  if (mode) sys += "\n\n" + MODES[mode];
  sys += "\n\nNOW: " + new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }) + " (Sydney).";
  const heavy = mode === "deep" || mode === "workflow" || mode === "plan";

  // Tool sets, from the richest to none: a request the account cannot serve falls back to the next one.
  const TOOLSETS = [
    [{ type: "web_search_20250305", name: "web_search", max_uses: heavy ? 25 : 6 }, { type: "web_fetch_20250910", name: "web_fetch", max_uses: heavy ? 12 : 4 }],
    [{ type: "web_search_20250305", name: "web_search", max_uses: heavy ? 25 : 6 }],
    null,
  ];
  function reqBody(model, tools, think) {
    const b = { model, max_tokens: heavy ? 20000 : 8000, system: sys, messages, stream: true };
    if (tools) b.tools = tools;
    if (think && isAdaptive(model)) { b.thinking = { type: "adaptive" }; b.output_config = { effort: heavy ? "high" : "medium" }; }
    return JSON.stringify(b);
  }
  function call(model, tools, think) {
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "web-fetch-2025-09-10" },
      body: reqBody(model, tools, think)
    });
  }

  let upstream = null, t = "";
  try {
    outer: for (const model of [MODEL, ...FALLBACKS.filter((m) => m !== MODEL)]) {
      for (let i = 0; i < TOOLSETS.length; i++) {
        for (const think of [true, false]) {
          upstream = await call(model, TOOLSETS[i], think);
          if (upstream.ok) break outer;
          t = ""; try { t = await upstream.text(); } catch (e) {}
          if (/thinking|output_config|effort/i.test(t) && think) continue; // older request shape
          break;
        }
        if (/web_fetch|web_search|tool|unsupported|not[_ ]?support|beta/i.test(t)) continue; // fewer tools
        break;
      }
      if (/not_found|model/i.test(t) || upstream.status === 404) continue; // next model
      break;
    }
  } catch (e) { return jsonResp({ reply: "⚠️ تعذّر الاتصال: " + String(e && e.message || e) }); }

  {
    if (!upstream.ok) {
      let t2 = t;
      let hint = "";
      if (/401|authentication|invalid x-api-key/i.test(t2)) hint = " (مفتاح API غير صالح)";
      else if (/credit|billing|quota|insufficient|402/i.test(t2)) hint = " (نفد الرصيد — اشحن حساب Anthropic)";
      else if (/429|rate|overloaded|529/i.test(t2)) hint = " (ضغط مؤقت — جرّب بعد دقيقة)";
      else if (/404|model|not_found/i.test(t2)) hint = " (اسم الموديل غير متاح)";
      return jsonResp({ reply: "⚠️ Brain error " + upstream.status + hint + "\n" + t2.slice(0, 200) });
    }
  }
  if (!upstream.body) { return jsonResp({ reply: "⚠️ Brain error — no response stream." }); }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const data = s.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
                controller.enqueue(enc.encode(ev.delta.text));
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        controller.enqueue(enc.encode("\n⚠️ انقطع البث: " + String(e && e.message || e)));
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
