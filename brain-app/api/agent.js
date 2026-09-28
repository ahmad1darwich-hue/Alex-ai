// Brain — simple, reliable agent engine (Vercel serverless function).
// One Claude call per message (fits the free 10s limit), plain JSON (works on iPhone Safari).
// Can fetch live prices (gold/silver/crypto) server-side. Requires env ANTHROPIC_API_KEY.

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a sharp, capable AI assistant built for Ahmad, who runs a landscaping business (Urban Sydney Wide Solutions) in Sydney and also trades.

You help with:
- Replying to customers (professional emails/messages, quotes wording).
- Trading (SMC checklists, plans, journaling templates, risk rules).
- Building simple tools/pages, writing content, plans, and workflows.

Rules:
- Reply in the SAME language the user writes in (Arabic or English).
- Be concise and useful. Get to the point.
- When you produce a file the user can save/run (a web page, script, template), output it as ONE fenced code block whose FIRST line names it, e.g.:
\`\`\`html
<!-- FILE: index.html -->
...complete self-contained file...
\`\`\`
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
      const r = await timedFetch("https://data-asg.goldprice.org/dbXRates/USD", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" } }, 3500);
      if (r.ok) { const j = await r.json(), it = j && j.items && j.items[0];
        if (it) { if (gold && it.xauPrice) out.push("Gold (XAU) = $" + Number(it.xauPrice).toFixed(2) + "/oz USD");
                  if (silver && it.xagPrice) out.push("Silver (XAG) = $" + Number(it.xagPrice).toFixed(2) + "/oz USD"); } }
    } catch (e) {}
  }
  if (btc || eth) {
    try {
      const ids = [btc ? "bitcoin" : null, eth ? "ethereum" : null].filter(Boolean).join(",");
      const r = await timedFetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd", { headers: { "accept": "application/json" } }, 3500);
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

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: sys, messages })
    });
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
    res.status(200).json({ reply: "⚠️ Brain couldn't reach Claude: " + String(e.message || e) });
  }
}
