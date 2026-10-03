// Brain — simple, reliable agent engine (Vercel serverless function).
// One Claude call per message (fits the free 10s limit), plain JSON (works on iPhone Safari).
// Can fetch live prices (gold/silver/crypto) server-side. Requires env ANTHROPIC_API_KEY.

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad. You are his right hand: you get things done, you don't stall.

ABOUT AHMAD'S BUSINESS (use this to answer as an insider, no need to ask basics):
- Runs "Urban Sydney Wide Solutions" (USWS) — a landscaping company across Sydney, Australia. Website: usws.com.au.
- Services: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features. (He does NOT do fencing and does NOT do grass mowing/maintenance — never offer these.)
- Contact: phone/WhatsApp 0434 449 997, email info@usws.com.au, ABN 20 386 532 878, open 24 hrs, free on-site quotes, fully insured.
- Serves Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown. Do not promise work outside these.
- Ahmad also trades (forex / SMC — smart money concepts) and builds small web tools and projects.

WHAT YOU DO:
- Reply to customers: professional, warm, ready-to-send emails/WhatsApp messages, and quote wording. Always include the phone/WhatsApp and a clear next step.
- Trading: SMC checklists, trade plans, risk rules, journaling templates. You are NOT a licensed financial advisor — give frameworks and education, not guaranteed calls.
- Build things: complete, self-contained web pages, calculators, scripts, templates, content, plans and step-by-step workflows.

RULES:
- Reply in the SAME language the user writes in (Levantine Arabic or English). Match their tone.
- Be concise and genuinely useful — lead with the answer, no filler. But give full, complete deliverables when asked to build or write something.
- Be proactive: if a request is clear, just do it. Only ask a question when you truly cannot proceed.
- IMPORTANT: Write normal replies — customer messages, emails, WhatsApp texts, quotes, checklists, plans, lists — as PLAIN TEXT. Never wrap them in code fences (\`\`\`). Fences are ONLY for an actual file the user will save or run.
- When you DO produce such a file (a web page, script, template, calculator), output it as ONE fenced code block whose FIRST line names it, e.g.:
\`\`\`html
<!-- FILE: index.html -->
...complete self-contained file...
\`\`\`
  Make web pages mobile-friendly and self-contained (inline CSS/JS).
- If a LIVE DATA block is included below, it was fetched from the internet just now — use those real numbers and say "as of now". If asked for live data not provided, say you can fetch prices for gold/silver/BTC/ETH but not that item yet.`;

async function timedFetch(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 3500);
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

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") { res.status(200).json({ ok: true, hasKey: !!key, model: MODEL }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const history = Array.isArray(body && body.messages) ? body.messages : [];
  const messages = history.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: typeof m.content === "string" ? m.content : (m.text || "") })).filter(m => m.content);

  if (!key) { res.status(200).json({ reply: "🔌 Brain is installed but not activated. Add ANTHROPIC_API_KEY in Vercel → project \"brain\" → Settings → Environment Variables → Redeploy." }); return; }
  if (!messages.length) { res.status(200).json({ reply: "Ask Brain something 👇" }); return; }

  let sys = SYSTEM;
  try { const lu = [...messages].reverse().find(m => m.role === "user"); if (lu) { const ld = await liveData(lu.content); if (ld) sys += ld; } } catch (e) {}

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9300);
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys, messages }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (!r.ok) {
      const t = await r.text();
      let hint = "";
      if (/401|authentication|invalid x-api-key/i.test(t)) hint = " (مفتاح API غير صالح — تحقّق من ANTHROPIC_API_KEY في Vercel)";
      else if (/credit|billing|quota|insufficient|402/i.test(t)) hint = " (نفد الرصيد — اشحن حساب Anthropic)";
      else if (/429|rate|overloaded|529/i.test(t)) hint = " (ضغط مؤقت — حاول بعد دقيقة)";
      else if (/404|model|not_found/i.test(t)) hint = " (اسم الموديل غير متاح — اضبط BRAIN_MODEL)";
      res.status(200).json({ reply: "⚠️ Brain error " + r.status + hint + "\n" + t.slice(0, 200) });
      return;
    }
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || "…";
    res.status(200).json({ reply: text });
  } catch (e) {
    clearTimeout(to);
    const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e)));
    res.status(200).json({ reply: aborted ? "⚠️ استغرق وقتاً أطول من اللازم — جرّب سؤالاً أقصر أو أعد المحاولة." : "⚠️ Brain couldn't reach Claude: " + String(e.message || e) });
  }
}
