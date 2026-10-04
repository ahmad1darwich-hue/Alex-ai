// Brain — Work email check-up (Vercel NODE function, IMAP + Gmail App Password).
// Reads recent INBOX messages (read-only) and has Claude triage them.
//
// One-time setup (env vars in Vercel 'brain' project — added by Ahmad himself):
//   GMAIL_USER          - usws.sydney.w@gmail.com
//   GMAIL_APP_PASSWORD  - a 16-char Google App Password (needs 2-Step Verification ON)
//   ANTHROPIC_API_KEY   - already set
// Optional:
//   EMAIL_SINCE_DAYS    - how far back (default 7)
//   EMAIL_MAX           - max emails to read (default 20)
//   BRAIN_MODEL         - model (default claude-sonnet-4-5)
// Private: every request must carry the owner's key (see _brain/lock.js).
import { ImapFlow } from "imapflow";
import { brainAuth, lockedReply } from "./_brain/lock.js";

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain, doing a quick WORK EMAIL check-up for Ahmad's landscaping business (USWS, usws.com.au). You're given a list of recent inbox emails (sender, subject, date, read/unread). Produce a short, practical triage in Levantine Arabic:
- Start with a one-line summary (how many emails, how many unread, how many look important).
- Then a short scannable list: for each email that matters, one line — who it's from, what it's about (from the subject), and what to do (reply / send quote / follow up / ignore / looks like spam).
- Put obvious customer enquiries (someone asking about landscaping work) at the TOP and flag them 🟢.
- Call out anything time-sensitive.
- Collapse newsletters/promos into one line: "+N نشرات/إعلانات تجاهلها".
- You only see senders + subjects (not full bodies) — say "حسب العنوان" when guessing. Keep it tight, no fluff.`;

function send(res, obj, status) { res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.statusCode = status || 200; res.end(JSON.stringify(obj)); }

export default async function handler(req, res) {
  const GPASS = process.env.GMAIL_APP_PASSWORD || process.env.APP_PASSWORD;
  const ready = !!(process.env.GMAIL_USER && GPASS);
  const auth = brainAuth(req.headers["x-brain-key"]);
  if (req.method === "GET") return send(res, auth === "ok" ? { ok: true, auth, connected: ready } : { ok: true, auth });
  if (req.method !== "POST") { res.statusCode = 405; return res.end("POST only"); }
  // The inbox is read only for the owner.
  if (auth !== "ok") return send(res, { locked: true, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!ready) return send(res, { reply: "📧 الإيميل لسّا مش مربوط ببراين.\nمحتاج إعداد لمرة وحدة: فعّل التحقّق بخطوتين على usws.sydney.w@gmail.com، أنشئ App Password، وحطّه مع الإيميل بإعدادات Vercel (GMAIL_USER و GMAIL_APP_PASSWORD). قلّي \"جهّزنا\" لما تخلّص." });
  if (!key) return send(res, { reply: "⚠️ مفتاح Claude غير موجود." });

  const days = parseInt(process.env.EMAIL_SINCE_DAYS || "7", 10);
  const max = parseInt(process.env.EMAIL_MAX || "20", 10);

  let mails = [];
  let client;
  try {
    client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: process.env.GMAIL_USER, pass: (GPASS || "").replace(/\s+/g, "") }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - days * 86400000);
      let uids = await client.search({ since }, { uid: true });
      if (!uids || !uids.length) { mails = []; }
      else {
        uids = uids.slice(-max);
        for await (const msg of client.fetch(uids, { envelope: true, flags: true }, { uid: true })) {
          const env = msg.envelope || {};
          const fromArr = (env.from || []).map(a => a.name ? (a.name + " <" + a.address + ">") : a.address);
          mails.push({ from: fromArr.join(", ") || "(unknown)", subject: env.subject || "(no subject)", date: env.date ? new Date(env.date).toISOString() : "", unread: !(msg.flags && msg.flags.has("\\Seen")) });
        }
        mails.reverse(); // newest first
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { if (client) await client.logout(); } catch (e2) {}
    let hint = "";
    const detail = (e && (e.responseText || e.response)) ? String(e.responseText || e.response) : String(e && e.message || e);
    if (e && e.authenticationFailed || /AUTHENTICATIONFAILED|invalid cred|username and password|BadCredentials/i.test(detail)) {
      hint = " — فشل تسجيل الدخول. الأرجح: (1) لازم App Password مش كلمة سر الإيميل العادية، (2) التحقّق بخطوتين لازم يكون مفعّل، (3) فعّل IMAP من إعدادات Gmail (Settings ▸ Forwarding and POP/IMAP ▸ Enable IMAP).";
    } else if (/IMAP.*disabled|not enabled|\[ALERT\]|lsub|service not enabled/i.test(detail)) {
      hint = " — لازم تفعّل IMAP من إعدادات Gmail (Settings ▸ Forwarding and POP/IMAP ▸ Enable IMAP).";
    }
    return send(res, { reply: "⚠️ تعذّر الاتصال بالبريد: " + detail.slice(0, 200) + hint });
  }

  if (!mails.length) return send(res, { reply: "📭 ما في رسائل بآخر " + days + " يوم بصندوق الوارد. كلشي نظيف ✅" });

  const list = mails.map((m, i) => (i + 1) + ". " + (m.unread ? "[UNREAD] " : "") + "From: " + m.from + " | Subject: " + m.subject + " | " + m.date).join("\n");

  try {
    const r = await fetch(ANTHROPIC, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: "رسائل الشغل (" + mails.length + " رسالة، آخر " + days + " يوم):\n\n" + list }] })
    });
    const j = await r.json();
    const txt = (j && j.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
    return send(res, { reply: txt || ("تم جلب " + mails.length + " رسالة.") });
  } catch (e) {
    return send(res, { reply: "⚠️ جبت " + mails.length + " رسالة بس تعذّر التلخيص: " + String(e && e.message || e).slice(0, 100) });
  }
};
