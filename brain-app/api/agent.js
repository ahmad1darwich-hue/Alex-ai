// Brain — streaming agent engine (Vercel Edge function).
// Streams Claude's reply token-by-token so it never hits the 10s serverless limit.
// Requires env var ANTHROPIC_API_KEY.

export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a powerful, autonomous AI agent built for Ahmad. You take any goal and deliver finished work: websites, apps, scripts, documents, plans, analyses and trading checklists.

How you work:
1. Start with a short plan (2-5 numbered steps).
2. Do the work. When you produce a file the user will keep, view, run or download (a web page, app, script, document, data), output it as ONE fenced code block whose FIRST line is a comment naming the file, exactly like:
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
- You do NOT have live internet or code execution yet. If asked for live data (e.g. a current gold/crypto price, today's news), say clearly you can't fetch live data yet, and offer what you CAN do (e.g. build a live price widget they can run, or a template). Live internet is coming soon.`;

function sse(text) { return new TextEncoder().encode(text); }

export default async function handler(req) {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, streaming: true, model: MODEL, hasKey: !!process.env.ANTHROPIC_API_KEY }), { headers: { "content-type": "application/json" } });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  let body = {};
  try { body = await req.json(); } catch {}
  const history = Array.isArray(body.messages) ? body.messages : [];
  const messages = history.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content : (m.text || "")
  })).filter(m => m.content);

  if (!key) {
    return new Response("🔌 Brain is installed but not activated.\n\nAdd ANTHROPIC_API_KEY in Vercel → project \"brain\" → Settings → Environment Variables → Redeploy.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!messages.length) {
    return new Response("Ask Brain to build something 👇", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  let upstream;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: SYSTEM, stream: true, messages })
    });
  } catch (e) {
    return new Response("⚠️ Network error reaching Claude: " + String(e), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => "");
    let hint = "";
    if (/401|authentication|invalid x-api-key/i.test(t)) hint = "\n➡️ مفتاح API غير صالح — تحقّق من ANTHROPIC_API_KEY في Vercel.";
    else if (/credit|billing|quota|insufficient|402/i.test(t)) hint = "\n➡️ نفد الرصيد — اشحن حساب Anthropic (console.anthropic.com → Billing).";
    else if (/429|rate|overloaded|529/i.test(t)) hint = "\n➡️ ضغط مؤقت — انتظر دقيقة وحاول مجدداً.";
    else if (/404|model|not_found/i.test(t)) hint = "\n➡️ اسم الموديل غير متاح — اضبط BRAIN_MODEL في Vercel.";
    return new Response("⚠️ Brain error " + upstream.status + ":\n" + t.slice(0, 400) + hint, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  // Parse Anthropic SSE, re-emit plain text deltas to the client.
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
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
                controller.enqueue(sse(ev.delta.text));
              } else if (ev.type === "error") {
                controller.enqueue(sse("\n⚠️ " + (ev.error && ev.error.message || "stream error")));
              }
            } catch {}
          }
        }
      } catch (e) {
        controller.enqueue(sse("\n⚠️ stream interrupted: " + String(e)));
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
}
