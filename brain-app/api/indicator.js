// Brain Indicators — Pine Script designer (Vercel EDGE function, streaming).
// Edge + streaming avoids the 10s serverless cap, so long indicators finish.
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are "Brain Indicators" — an expert TradingView Pine Script engineer. Your ONLY job is to design trading indicators and strategies for Ahmad and give him working code.

OUTPUT RULES:
- Write clean, COMPLETE, working Pine Script v6 code (start with //@version=6). Use v5 only if the user insists.
- When the user describes an idea, produce the FULL code ready to paste into TradingView's Pine Editor — not a snippet.
- Put the code in ONE fenced block whose FIRST line is a filename comment, e.g.:
\`\`\`pine
// FILE: nexus_smc.pine
//@version=6
indicator("...", shorttitle="...", overlay=true)
...
\`\`\`
- Include a clear indicator()/strategy() declaration (good title + shorttitle), inputs with tooltips, the logic, plots/labels/lines, and alertcondition()/alert() where it makes sense.
- Use indicator() by default. Use strategy() only when the user wants a backtest — then add proper entries/exits and risk (stop/target or % risk).

QUALITY:
- Follow Pine v6 best practices: avoid repainting unless intended (use confirmed/barstate), no lookahead in request.security, manage labels/lines with max_labels_count/max_lines_count and delete old ones, guard array access, keep it efficient.
- If the user uploads a chart/indicator screenshot, recreate or analyze the logic shown and deliver Pine code for it.
- If an idea is ambiguous, make a sensible choice and state your assumption in one line — don't stall.

STYLE:
- Reply in the user's language (Levantine Arabic or English). Keep the explanation short and practical — the CODE is the main deliverable. After the code, add 2-4 lines: what it does, key inputs, and how to set alerts.
- You are not a financial advisor; indicators are tools, not guaranteed signals.`;

function mapMessages(history) {
  return (Array.isArray(history) ? history : []).map(m => {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: m.text || "" };
  }).filter(m => Array.isArray(m.content) ? m.content.length : m.content);
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
function jsonResp(obj) { return new Response(JSON.stringify(obj), { headers: Object.assign({ "content-type": "application/json" }, CORS) }); }

export default async function handler(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return jsonResp({ ok: true, hasKey: !!key, model: MODEL, mode: "indicators", streaming: true });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

  let body = {};
  try { body = await req.json(); } catch (e) {}
  const messages = mapMessages(body.messages);

  if (!key) return jsonResp({ reply: "🔌 غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel." });
  if (!messages.length) return jsonResp({ reply: "وصّفلي المؤشر اللي بدك اصمّمه 👇" });

  let upstream;
  try {
    upstream = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: SYSTEM, messages, stream: true })
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
    return jsonResp({ reply: "⚠️ خطأ " + upstream.status + hint + "\n" + t.slice(0, 200) });
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
  return new Response(stream, { headers: Object.assign({ "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" }, CORS) });
}
