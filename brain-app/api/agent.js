// Brain — streaming agent engine (Vercel Edge function) with live-data lookup.
// Streams Claude's reply token-by-token (no 10s serverless limit) and can fetch
// live prices (gold, silver, crypto, FX) server-side to answer "current price" questions.
// Requires env var ANTHROPIC_API_KEY.

export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a powerful, autonomous AI agent built for Ahmad. You take any goal and deliver finished work: websites, apps, scripts, documents, plans, analyses and trading checklists.

How you work:
1. Start with a short plan (2-5 numbered steps).
2. Do the work. When you produce a file the user will keep, view, run or download (a web page, app, script, document, data), output it as ONE fenced code block whose FIRST line names the file, exactly like:
\`\`\`html
<!-- FILE: index.html -->
...full file...
\`\`\`
Use the right language tag (html, js, python, css, markdown, csv…). For a website/app, make it ONE complete self-contained HTML file.
3. End with a 1-2 sentence summary and one next step.

Rules:
- Reply in the SAME language the user writes in (Arabic or English).
- Be decisive and complete — real, working output, no placeholders.
- Keep chat text short; put substance in the file block.
- If a LIVE DATA block is provided below, it was fetched just now from the internet — use those real numbers to answer and say "as of now". If the user asks for live data that is NOT in the block, say you couldn't fetch it right now and offer to build them a live widget.`;

// ---- live data lookups (best-effort, graceful) ----
async function timedFetch(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 4000);
  try { return await fetch(url, Object.assign({ signal: c.signal }, opts || {})); }
  finally { clearTimeout(t); }
}

async function liveData(text) {
  const q = (text || "").toLowerCase();
  const out = [];
  const wantGold = /gold|ذهب|xau/i.test(q);
  const wantSilver = /silver|فض[ةه]|xag/i.test(q);
  const wantBTC = /bitcoin|btc|بيتكوين|بتكوين/i.test(q);
  const wantETH = /ethereum|eth|ايثير|إيثير/i.test(q);
  // Metals via goldprice.org public feed
  if (wantGold || wantSilver) {
    try {
      const r = await timedFetch("https://data-asg.goldprice.org/dbXRates/USD", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" } }, 4500);
      if (r.ok) {
        const j = await r.json();
        const it = j && j.items && j.items[0];
        if (it) {
          if (wantGold && it.xauPrice) out.push("Gold (XAU): $" + Number(it.xauPrice).toFixed(2) + " per troy ounce (USD)");
          if (wantSilver && it.xagPrice) out.push("Silver (XAG): $" + Number(it.xagPrice).toFixed(2) + " per troy ounce (USD)");
        }
      }
    } catch (e) {}
  }
  // Crypto via CoinGecko (free, reliable)
  if (wantBTC || wantETH) {
    try {
      const ids = [wantBTC ? "bitcoin" : null, wantETH ? "ethereum" : null].filter(Boolean).join(",");
      const r = await timedFetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd", { headers: { "accept": "application/json" } }, 4500);
      if (r.ok) {
        const j = await r.json();
        if (j.bitcoin) out.push("Bitcoin (BTC): $" + j.bitcoin.usd.toLocaleString() + " USD");
        if (j.ethereum) out.push("Ethereum (ETH): $" + j.ethereum.usd.toLocaleString() + " USD");
      }
    } catch (e) {}
  }
  if (!out.length) return "";
  return "\n\nLIVE DATA (fetched just now, " + new Date().toUTCString() + "):\n- " + out.join("\n- ");
}

function enc(t) { return new TextEncoder().encode(t); }

export default async function handler(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, streaming: true, model: MODEL, hasKey: !!key, liveData: true }), { headers: { "content-type": "application/json" } });
  }
  let body = {};
  try { body = await req.json(); } catch {}
  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages = history.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content : (m.text || "")
  })).filter(m => m.content);

  if (!key) return new Response("🔌 Brain is installed but not activated.\n\nAdd ANTHROPIC_API_KEY in Vercel → project \"brain\" → Settings → Environment Variables → Redeploy.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!messages.length) return new Response("Ask Brain to build something 👇", { headers: { "content-type": "text/plain; charset=utf-8" } });

  // enrich with live data if the latest user message asks for a price
  let sys = SYSTEM;
  try {
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (lastUser) { const ld = await liveData(lastUser.content); if (ld) sys += ld; }
  } catch (e) {}

  let upstream;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sys, stream: true, messages })
    });
  } catch (e) {
    return new Response("⚠️ Network error reaching Claude: " + String(e), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    let hint = "";
    if (/401|authentication|invalid x-api-key/i.test(t)) hint = "\n➡️ مفتاح API غير صالح — تحقّق من ANTHROPIC_API_KEY في Vercel.";
    else if (/credit|billing|quota|insufficient|402/i.test(t)) hint = "\n➡️ نفد الرصيد — اشحن حساب Anthropic (console.anthropic.com → Billing).";
    else if (/429|rate|overloaded|529/i.test(t)) hint = "\n➡️ ضغط مؤقت — انتظر دقيقة وحاول مجدداً.";
    else if (/404|model|not_found/i.test(t)) hint = "\n➡️ اسم الموديل غير متاح — اضبط BRAIN_MODEL في Vercel.";
    return new Response("⚠️ Brain error " + upstream.status + ":\n" + t.slice(0, 400) + hint, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const data = s.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") controller.enqueue(enc(ev.delta.text));
              else if (ev.type === "error") controller.enqueue(enc("\n⚠️ " + (ev.error && ev.error.message || "stream error")));
            } catch {}
          }
        }
      } catch (e) { controller.enqueue(enc("\n⚠️ stream interrupted: " + String(e))); }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
}
