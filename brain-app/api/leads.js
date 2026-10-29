// Brain — USWS work lead alert (Vercel NODE function).
// Watches the info@usws.com.au mailbox (VentraIP Axigen IMAP, read-only) and pings
// Ahmad on his existing Brain Telegram the moment a customer email / lead arrives.
//
//   GET /api/leads                                  -> { ok, info }  (public, nothing else)
//   GET /api/leads  (Vercel cron, Bearer CRON_SECRET)-> checks the mailbox, sends alerts
//   GET /api/leads?run=1&key=DAILY_KEY              -> same, on demand (also x-brain-key)
//
// One-time setup (env vars in the Vercel 'brain' project — added by Ahmad himself):
//   INFO_MAIL_PASSWORD   - the password for info@usws.com.au   [REQUIRED]
// Already set (reused): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CRON_SECRET / DAILY_KEY.
// Optional:
//   INFO_MAIL_USER  (default info@usws.com.au)
//   INFO_MAIL_HOST  (default ventraip.email)
//   LEADS_LOOKBACK_MIN (default 60)   LEADS_MAX (default 12)
//
// Dedup: once an email has been alerted it gets the IMAP keyword "$LeadNotified" (invisible
// in webmail; it does NOT mark the mail read). Only messages newer than LEADS_LOOKBACK_MIN
// are ever alerted, so the existing inbox is never blasted on the first run.
import { ImapFlow } from "imapflow";
import { brainAuth } from "./_brain/lock.js";
import { sendToTelegram } from "./_brain/tg-send.js";
import { bodyText } from "./_brain/mail-parse.js";

const KEYWORD = "$LeadNotified";

// Senders / mail that are never a customer lead (transactional + bulk noise).
const SKIP_SENDER = /(paypal|xero|invoicesimple|getinvoicesimple|mailchimp|no-?reply|donotreply|do-not-reply|notifications?@|whatsapp|facebookmail|instagram|linkedin|google\.com|googlemail|accounts\.google|billing@|postmaster|mailer-daemon)/i;

function sameSecret(given, expected) {
  const g = String(given || ""), e = String(expected || "");
  if (!e || e.length < 16 || g.length !== e.length) return false;
  let d = 0; for (let i = 0; i < e.length; i++) d |= g.charCodeAt(i) ^ e.charCodeAt(i);
  return d === 0;
}
function send(res, obj, status) { res.statusCode = status || 200; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); }

// Pull a raw header value out of the top of a MIME source (before the first blank line).
function headerVal(source, name) {
  if (!source) return "";
  const raw = Buffer.isBuffer(source) ? source.toString("latin1") : String(source);
  const head = raw.split(/\r?\n\r?\n/)[0] || "";
  const re = new RegExp("^" + name.replace(/[-]/g, "\\-") + ":\\s*([^\\r\\n]*)", "im");
  const m = re.exec(head);
  return m ? m[1].trim() : "";
}

// Looks like a bulk / marketing newsletter rather than a person writing to us?
function isBulk(source) {
  if (!source) return false;
  const raw = Buffer.isBuffer(source) ? source.toString("latin1") : String(source);
  const head = (raw.split(/\r?\n\r?\n/)[0] || "").toLowerCase();
  if (/\nlist-unsubscribe:/.test("\n" + head)) return true;
  if (/\nprecedence:\s*(bulk|list|junk)/.test("\n" + head)) return true;
  if (/\nx-(mailchimp|campaign|mailer|bulkmail|marketing)/.test("\n" + head)) return true;
  if (/\nfeedback-id:/.test("\n" + head)) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, { ok: false, message: "GET only" }, 405);
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const cronOk = sameSecret(bearer, process.env.CRON_SECRET);
  const keyOk = sameSecret(q.key, process.env.LEADS_PING_KEY) || sameSecret(q.key, process.env.DAILY_KEY) || sameSecret(q.key, process.env.CRON_SECRET) || brainAuth(req.headers["x-brain-key"]) === "ok";
  if (!cronOk && !keyOk) {
    if (q.run) return send(res, { ok: false, message: "not allowed" }, 401);
    return send(res, { ok: true, info: "Brain USWS lead alert. Watches info@usws.com.au and pings Telegram on new customer emails. Runs by cron." });
  }

  // Quick proof-of-life: /api/leads?test=1&key=... sends one Telegram line and returns.
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
    client = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Can this mailbox store custom keywords? (Axigen: yes — PERMANENTFLAGS carries "\*".)
      try { const pf = (client.mailbox && client.mailbox.permanentFlags) || []; keywordOk = pf.includes("\\*") || pf.includes(KEYWORD); } catch (e) { keywordOk = true; }

      const since = new Date(Date.now() - 2 * 86400000); // fetch only the last 2 days
      let uids = await client.search({ since }, { uid: true });
      uids = (uids || []).slice(-40);
      const toAlert = [];
      if (uids.length) {
        for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true, source: { start: 0, maxLength: 24000 } }, { uid: true })) {
          checked++;
          const flags = msg.flags || new Set();
          if (flags.has(KEYWORD)) continue;                       // already handled
          const when = msg.internalDate ? new Date(msg.internalDate).getTime() : 0;
          // Mark everything we see as handled so it is never reconsidered.
          const env = msg.envelope || {};
          const fromArr = (env.from || []).map(a => (a.name ? a.name + " <" + a.address + ">" : a.address));
          const from = fromArr.join(", ") || "(unknown)";
          const subject = env.subject || "(بدون موضوع)";
          const old = when && when < floor;
          const bulk = isBulk(msg.source);
          const skipSender = SKIP_SENDER.test(from);
          if (old) { seeded++; }                                  // backlog: seed silently
          else if (bulk || skipSender) { /* noise: mark handled, no alert */ }
          else { toAlert.push({ uid: msg.uid, from, subject, body: bodyText(msg.source) }); }
          // tag handled (works for alerted + skipped + seeded)
          if (keywordOk) { try { await client.messageFlagsAdd(msg.uid, [KEYWORD], { uid: true }); } catch (e) { keywordOk = false; } }
        }
      }
      // Send alerts (oldest first so the newest ends up last in the chat).
      toAlert.sort((a, b) => a.uid - b.uid);
      for (const m of toAlert.slice(0, max)) {
        const snippet = (m.body || "").slice(0, 240);
        const text =
          "🟢 ليد جديد ع الإيميل\n" +
          "📧 info@usws.com.au\n" +
          "من: " + m.from + "\n" +
          "الموضوع: " + m.subject +
          (snippet ? "\n\n" + snippet : "") +
          "\n\nردّ عليه من الويبميل: https://ventraip.email";
        const r = await sendToTelegram(text);
        if (r && r.ok) alerted++;
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    try { if (client) await client.logout(); } catch (e2) {}
    const detail = (e && (e.responseText || e.message)) ? String(e.responseText || e.message) : String(e);
    // Tell Ahmad once (throttle handled by the fact that a wrong password is a setup mistake he'll fix).
    const authFail = (e && e.authenticationFailed) || /AUTHENTICATIONFAILED|invalid cred|LOGIN failed|BadCred/i.test(detail);
    if (authFail) { try { await sendToTelegram("⚠️ تنبيهات الشغل: ما قدرت أدخل ع صندوق info@usws.com.au — تأكد إنو كلمة السر INFO_MAIL_PASSWORD مظبوطة بإعدادات Vercel."); } catch (x) {} }
    try { console.log("LEADS error " + detail.slice(0, 200)); } catch (x) {}
    return send(res, { ok: false, message: detail.slice(0, 200) }, 502);
  }

  try { console.log("LEADS " + JSON.stringify({ checked, alerted, seeded, keywordOk })); } catch (e) {}
  return send(res, { ok: true, checked, alerted, seeded, keywordOk });
}
