// Brain — Work email check-up (Vercel EDGE function).
// Reads recent messages from the connected Gmail mailbox (read-only) and has
// Claude triage them: who wrote, who's a customer enquiry, what needs a reply.
//
// One-time setup (env vars in Vercel, added by Ahmad himself — never in chat):
//   GMAIL_CLIENT_ID      - OAuth client id (Google Cloud)
//   GMAIL_CLIENT_SECRET  - OAuth client secret
//   GMAIL_REFRESH_TOKEN  - a read-only refresh token for usws.sydney.w@gmail.com
//                          (scope: https://www.googleapis.com/auth/gmail.readonly)
//   ANTHROPIC_API_KEY    - already set
// Optional:
//   EMAIL_QUERY          - Gmail search (default "newer_than:7d in:inbox")
//   BRAIN_MODEL          - model (default claude-sonnet-4-5)
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

function jsonResp(obj) { return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" } }); }

async function getAccessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("token " + r.status + " " + t.slice(0, 120)); }
  const j = await r.json();
  return j.access_token;
}

function header(headers, name) {
  const h = (headers || []).find(x => (x.name || "").toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

export default async function handler(req) {
  if (req.method === "GET") {
    const ready = !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
    return jsonResp({ ok: true, connected: ready });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    return jsonResp({ reply: "📧 الإيميل لسّا مش مربوط ببراين.\nمحتاج إعداد لمرة وحدة (توكِن قراءة من Google) بتحطّه بإعدادات Vercel — قلّي \"جهّز ربط الإيميل\" ونمشي خطوة خطوة." });
  }
  if (!key) return jsonResp({ reply: "⚠️ مفتاح Claude غير موجود." });

  let q = process.env.EMAIL_QUERY || "newer_than:7d in:inbox";
  try { const b = await req.json(); if (b && b.query) q = String(b.query); } catch (e) {}

  let token;
  try { token = await getAccessToken(); }
  catch (e) { return jsonResp({ reply: "⚠️ تعذّر الاتصال بـ Gmail: " + String(e && e.message || e) + "\n(تأكّد من صحة التوكِن بإعدادات Vercel.)" }); }

  // List recent message ids
  let ids = [];
  try {
    const lr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=" + encodeURIComponent(q), { headers: { authorization: "Bearer " + token } });
    const lj = await lr.json();
    ids = (lj.messages || []).map(m => m.id);
  } catch (e) { return jsonResp({ reply: "⚠️ تعذّر قراءة القائمة: " + String(e && e.message || e) }); }

  if (!ids.length) return jsonResp({ reply: "📭 ما في رسائل جديدة بصندوق الوارد ضمن \"" + q + "\". كلشي نظيف ✅" });

  // Fetch metadata + snippet for each
  const mails = [];
  for (const id of ids.slice(0, 15)) {
    try {
      const mr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date", { headers: { authorization: "Bearer " + token } });
      const mj = await mr.json();
      const hdrs = (mj.payload && mj.payload.headers) || [];
      mails.push({ from: header(hdrs, "From"), subject: header(hdrs, "Subject"), date: header(hdrs, "Date"), snippet: (mj.snippet || "").slice(0, 300), unread: (mj.labelIds || []).indexOf("UNREAD") >= 0 });
    } catch (e) {}
  }

  const list = mails.map((m, i) => (i + 1) + ". " + (m.unread ? "[UNREAD] " : "") + "From: " + m.from + " | Subject: " + m.subject + " | " + m.date + "\n   " + m.snippet).join("\n\n");

  const SYSTEM = `You are Brain, doing a quick WORK EMAIL check-up for Ahmad's landscaping business (USWS, usws.com.au). You are given a list of recent emails (sender, subject, date, snippet). Produce a short, practical triage in Levantine Arabic:
- Start with a one-line summary (how many emails, how many look important).
- Then a short list: for each email that matters, one line — who it's from, what it's about, and what to do (reply / quote / ignore / spam).
- Group obvious customer enquiries (someone asking about landscaping work) at the top and flag them clearly 🟢.
- Call out anything time-sensitive.
- Skip pure newsletters/promos (just say "+N نشرات/إعلانات تجاهلها").
- Keep it tight and scannable. No fluff. You are NOT reading full bodies, only snippets — say "حسب العنوان/المقتطف" when unsure.`;

  try {
    const r = await fetch(ANTHROPIC, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: "هاي رسائل الشغل (" + mails.length + " رسالة، بحث: " + q + "):\n\n" + list }] })
    });
    const j = await r.json();
    const txt = (j && j.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
    return jsonResp({ reply: txt || "تم جلب " + mails.length + " رسالة بس تعذّر التلخيص." });
  } catch (e) {
    return jsonResp({ reply: "⚠️ تعذّر التلخيص: " + String(e && e.message || e) });
  }
}
