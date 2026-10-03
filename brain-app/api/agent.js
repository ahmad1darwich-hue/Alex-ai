// Brain — general assistant (Vercel EDGE function, streaming).
// Edge + streaming avoids the 10s serverless cap, so long answers finish.
// Can fetch live prices (gold/silver/crypto) before answering. Uses env ANTHROPIC_API_KEY.
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
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

RULES:
- Reply in the SAME language the user writes in (Levantine Arabic or English). Match their tone.
- Be concise and genuinely useful — lead with the answer, no filler. Give full, complete deliverables when asked to build or write something.
- Be proactive: if a request is clear, just do it. Only ask a question when you truly cannot proceed.
- Write normal replies — customer messages, emails, WhatsApp texts, quotes, checklists, plans, trade analysis — as PLAIN TEXT. Never wrap them in code fences (\`\`\`). Fences are ONLY for an actual file the user will save or run.
- When you DO produce such a file (a web page, script, template, calculator), output it as ONE fenced code block whose FIRST line names it, e.g.:
\`\`\`html
<!-- FILE: index.html -->
...complete self-contained file...
\`\`\`
  Make web pages mobile-friendly and self-contained (inline CSS/JS).
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

function mapMessages(history) {
  return (Array.isArray(history) ? history : []).map(m => {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: m.text || "" };
  }).filter(m => Array.isArray(m.content) ? m.content.length : m.content);
}
function textOf(c) { if (typeof c === "string") return c; if (Array.isArray(c)) return c.filter(b => b && b.type === "text").map(b => b.text).join(" "); return ""; }

function jsonResp(obj) { return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" } }); }

export default async function handler(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") return jsonResp({ ok: true, hasKey: !!key, model: MODEL, streaming: true });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body = {};
  try { body = await req.json(); } catch (e) {}
  const messages = mapMessages(body.messages);
  if (!key) return jsonResp({ reply: "🔌 Brain غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel." });
  if (!messages.length) return jsonResp({ reply: "اسأل Brain شي 👇" });

  let sys = SYSTEM;
  try { const lu = [...messages].reverse().find(m => m.role === "user"); if (lu) { const ld = await liveData(textOf(lu.content)); if (ld) sys += ld; } } catch (e) {}

  let upstream;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: sys, messages, stream: true })
    });
  } catch (e) {
    return jsonResp({ reply: "⚠️ تعذّر الاتصال: " + String(e && e.message || e) });
  }
  if (!upstream.ok || !upstream.body) {
    let t = ""; try { t = await upstream.text(); } catch (e) {}
    let hint = "";
    if (/401|authentication|invalid x-api-key/i.test(t)) hint = " (مفتاح API غير صالح)";
    else if (/credit|billing|quota|insufficient|402/i.test(t)) hint = " (نفد الرصيد — اشحن حساب Anthropic)";
    else if (/429|rate|overloaded|529/i.test(t)) hint = " (ضغط مؤقت — جرّب بعد دقيقة)";
    else if (/404|model|not_found/i.test(t)) hint = " (اسم الموديل غير متاح)";
    return jsonResp({ reply: "⚠️ Brain error " + upstream.status + hint + "\n" + t.slice(0, 200) });
  }

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
