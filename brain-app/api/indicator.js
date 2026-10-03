// Brain Indicators — a dedicated Pine Script indicator designer (Vercel serverless).
// Reuses the project's ANTHROPIC_API_KEY. Non-streaming, fits the free limit.

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are "Brain Indicators" — an expert TradingView Pine Script engineer. Your ONLY job is to design trading indicators and strategies for Ahmad and give him working code.

OUTPUT RULES:
- Write clean, COMPLETE, working Pine Script v6 code (start with //@version=6). If the user insists on v5, use v5.
- When the user describes an idea, produce the FULL code ready to paste into TradingView's Pine Editor — not a snippet.
- Put the code in ONE fenced block whose FIRST line is a filename comment, e.g.:
\`\`\`pine
// FILE: nexus_smc.pine
//@version=6
indicator("...", shorttitle="...", overlay=true)
...
\`\`\`
- Include: a clear indicator()/strategy() declaration (good title + shorttitle), inputs with tooltips, the logic, plots/labels/lines, and alertcondition()/alert() where it makes sense.
- Use indicator() by default. Use strategy() only when the user wants a backtest — then add proper entries/exits, and risk (stop/target or % risk).

QUALITY:
- Follow Pine v6 best practices: avoid repainting unless intended (use confirmed/barstate), no lookahead in request.security, manage labels/lines with max_labels_count/max_lines_count and delete old ones, guard array access, and keep it efficient.
- If the user uploads a chart/indicator screenshot, recreate or analyze the logic shown and deliver Pine code for it.
- If an idea is ambiguous, make a sensible choice and state your assumption in one line — don't stall. Ask only if you truly cannot proceed.

STYLE:
- Reply in the user's language (Levantine Arabic or English). Keep the explanation short and practical — the CODE is the main deliverable. After the code, add 2-4 lines: what it does, key inputs, and how to use/set alerts.
- You are not a financial advisor; indicators are tools, not guaranteed signals.`;

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") { res.status(200).json({ ok: true, hasKey: !!key, model: MODEL, mode: "indicators" }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const history = Array.isArray(body && body.messages) ? body.messages : [];
  const messages = history.map(m => {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: m.text || "" };
  }).filter(m => Array.isArray(m.content) ? m.content.length : m.content);

  if (!key) { res.status(200).json({ reply: "🔌 غير مفعّل — أضف ANTHROPIC_API_KEY في إعدادات Vercel." }); return; }
  if (!messages.length) { res.status(200).json({ reply: "وصّفلي المؤشر اللي بدك اصمّمه 👇" }); return; }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9300);
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (!r.ok) {
      const t = await r.text();
      let hint = "";
      if (/401|authentication|invalid x-api-key/i.test(t)) hint = " (مفتاح API غير صالح)";
      else if (/credit|billing|quota|insufficient|402/i.test(t)) hint = " (نفد الرصيد — اشحن حساب Anthropic)";
      else if (/429|rate|overloaded|529/i.test(t)) hint = " (ضغط مؤقت — جرّب بعد دقيقة)";
      else if (/404|model|not_found/i.test(t)) hint = " (اسم الموديل غير متاح)";
      res.status(200).json({ reply: "⚠️ خطأ " + r.status + hint + "\n" + t.slice(0, 200) });
      return;
    }
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") || "…";
    res.status(200).json({ reply: text });
  } catch (e) {
    clearTimeout(to);
    const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e)));
    res.status(200).json({ reply: aborted ? "⚠️ المؤشر طويل وتأخّر — جرّب تقسيمه أو اطلب نسخة أبسط." : "⚠️ تعذّر الاتصال: " + String(e.message || e) });
  }
}
