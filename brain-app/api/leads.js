// Brain — USWS work lead alert (Vercel NODE function).
// Watches the info@usws.com.au mailbox (VentraIP Axigen IMAP, read-only) and pings
// Ahmad on his existing Brain Telegram the moment a customer email / lead arrives.
//
//   GET /api/leads                                   -> { ok, info }  (public, nothing else)
//   GET /api/leads  (Vercel cron, Bearer CRON_SECRET)-> checks the mailbox, sends alerts
//   GET /api/leads?run=1&key=LEADS_PING_KEY          -> same, on demand (also x-brain-key)
//   GET /api/leads?test=1&key=LEADS_PING_KEY         -> one Telegram proof-of-life line
//
// One-time setup (env vars in the Vercel 'brain' project — added by Ahmad himself):
//   INFO_MAIL_PASSWORD   - the password for info@usws.com.au   [REQUIRED]
//   LEADS_PING_KEY       - a shared key for the external 15-min pinger (GitHub Actions)
// Already set (reused): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CRON_SECRET / DAILY_KEY.
// Optional: INFO_MAIL_USER (info@usws.com.au), INFO_MAIL_HOST (ventraip.email),
//           LEADS_LOOKBACK_MIN (180), LEADS_MAX (12).
//
// Dedup: once alerted (or seen and skipped) a message gets the IMAP keyword "$LeadNotified"
// (invisible in webmail; does NOT mark the mail read). Only messages newer than the lookback
// are ever alerted, so the existing inbox is seeded silently on the first run.
import { ImapFlow } from "imapflow";
import { brainAuth } from "./_brain/lock.js";
import { sendToTelegram } from "./_brain/tg-send.js";
import { bodyText } from "./_brain/mail-parse.js";

const KEYWORD = "$LeadNotified";

const SKIP_SENDER = /(paypal|xero|invoicesimple|getinvoicesimple|mailchimp|no-?reply|donotreply|do-not-reply|notifications?@|whatsapp|facebookmail|instagram|linkedin|google\.com|googlemail|accounts\.google|billing@|postmaster|mailer-daemon)/i;

function sameSecret(given, expected) {
  const g = String(given || ""), e = String(expected || "");
  if (!e || e.length < 16 || g.length !== e.length) return false;
  let d = 0; for (let i = 0; i < e.length; i++) d |= g.charCodeAt(i) ^ e.charCodeAt(i);
  return d === 0;
}
function send(res, obj, status) { res.statusCode = status || 200; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); }

function isBulk(source) {
  if (!source) return false;
  const raw = Buffer.isBuffer(source) ? source.toString("latin1") : String(source);
  const head = "\n" + (raw.split(/\r?\n\r?\n/)[0] || "").toLowerCase();
  return /\nlist-unsubscribe:/.test(head) || /\nprecedence:\s*(bulk|list|junk)/.test(head) ||
         /\nx-(mailchimp|campaign|mailer|bulkmail|marketing)/.test(head) || /\nfeedback-id:/.test(head);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, { ok: false, message: "GET only" }, 405);
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const cronOk = sameSecret(bearer, process.env.CRON_SECRET);
  const keyOk = sameSecret(q.key, process.env.LEADS_PING_KEY) || sameSecret(q.key, process.env.DAILY_KEY) || sameSecret(q.key, process.env.CRON_SECRET) || brainAuth(req.headers["x-brain-key"]) === "ok";
  if (!cronOk && !keyOk) {
    if (q.run || q.test) return send(res, { ok: false, message: "not allowed" }, 401);
    return send(res, { ok: true, info: "Brain USWS lead alert. Watches info@usws.com.au and pings Telegram on new customer emails. Runs by cron." });
  }

  if (q.test) {
    const r = await sendToTelegram("✅ تجربة: نظام تنبيهات ليدز الشغل شغّال. لما يجي إيميل زبون جديد ع info@usws.com.au رح يوصلك تنبيه هون.");
    return send(res, { ok: !!(r && r.ok), test: true, telegram: r });
  }

  const USER = process.env.INFO_MAIL_USER || "info@usws.com.au";
  const HOST = process.env.INFO_MAIL_HOST || "ventraip.email";
  const PASS = (process.env.INFO_MAIL_PASSWORD || "").replace(/^\s+|\s+$/g, "");
  const lookbackMin = parseInt(process.env.LEADS_LOOKBACK_MIN || "180", 10);
  const max = parseInt(process.env.LEADS_MAX || "12", 10);
  if (!PASS) return send(res, { ok: false, ready: false, message: "INFO_MAIL_PASSWORD not set" });

  const floor = Date.now() - lookbackMin * 60000;
  let client, checked = 0, alerted = 0, seeded = 0, keywordOk = true;
  try {
    client = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false, socketTimeout: 45000 });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      try { const pf = (client.mailbox && client.mailbox.permanentFlags) || []; keywordOk = pf.includes("\\*") || pf.includes(KEYWORD); } catch (e) { keywordOk = true; }

      const since = new Date(Date.now() - 2 * 86400000);
      let uids;
      try { uids = await client.search({ since, unKeyword: KEYWORD }, { uid: true }); }
      catch (e) { uids = await client.search({ since }, { uid: true }); }
      uids = (uids || []).slice(-50);

      if (uids.length) {
        // Pass 1 — cheap metadata only (no bodies): decide who is a candidate.
        const metas = [];
        for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
          if ((msg.flags || new Set()).has(KEYWORD)) continue;
          metas.push({ uid: msg.uid, env: msg.envelope || {}, when: msg.internalDate ? new Date(msg.internalDate).getTime() : 0 });
        }
        const seedUids = [];
        const recent = [];
        for (const m of metas) { checked++; if (!m.when || m.when < floor) seedUids.push(m.uid); else recent.push(m); }

        // Pass 2 — fetch bodies ONLY for the few recent ones.
        const cands = [];
        if (recent.length) {
          const srcMap = {};
          for await (const msg of client.fetch(recent.map(r => r.uid), { uid: true, source: { start: 0, maxLength: 9000 } }, { uid: true })) srcMap[msg.uid] = msg.source;
          for (const m of recent) {
            const src = srcMap[m.uid];
            const fromArr = (m.env.from || []).map(a => (a.name ? a.name + " <" + a.address + ">" : a.address));
            const from = fromArr.join(", ") || "(unknown)";
            if (isBulk(src) || SKIP_SENDER.test(from)) { seedUids.push(m.uid); continue; }
            cands.push({ uid: m.uid, from, subject: m.env.subject || "(بدون موضوع)", body: bodyText(src) });
          }
        }

        cands.sort((a, b) => a.uid - b.uid);
        const toSend = cands.slice(0, max);
        for (const m of toSend) {
          const snippet = (m.body || "").slice(0, 240);
          const text = "🟢 ليد جديد ع الإيميل\n📧 info@usws.com.au\nمن: " + m.from + "\nالموضوع: " + m.subject + (snippet ? "\n\n" + snippet : "") + "\n\nردّ عليه من الويبميل: https://ventraip.email";
          const r = await sendToTelegram(text);
          if (r && r.ok) alerted++;
        }

        seeded = seedUids.length;
        const handled = seedUids.concat(toSend.map(m => m.uid));
        if (keywordOk && handled.length) { try { await client.messageFlagsAdd(handled, [KEYWORD], { uid: true }); } catch (e) { keywordOk = false; } }
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { if (client) await client.logout(); } catch (e2) {}
    const detail = (e && (e.responseText || e.message)) ? String(e.responseText || e.message) : String(e);
    const authFail = (e && e.authenticationFailed) || /AUTHENTICATIONFAILED|invalid cred|LOGIN failed|BadCred/i.test(detail);
    if (authFail) { try { await sendToTelegram("⚠️ تنبيهات الشغل: ما قدرت أدخل ع صندوق info@usws.com.au — تأكد إنو كلمة السر INFO_MAIL_PASSWORD مظبوطة بإعدادات Vercel."); } catch (x) {} }
    try { console.log("LEADS error " + detail.slice(0, 200)); } catch (x) {}
    return send(res, { ok: false, message: detail.slice(0, 200) }, 502);
  }

  try { console.log("LEADS " + JSON.stringify({ checked, alerted, seeded, keywordOk })); } catch (e) {}
  return send(res, { ok: true, checked, alerted, seeded, keywordOk });
}
