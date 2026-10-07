// Brain on Telegram — Vercel EDGE function.
// POST  = incoming Telegram update -> ask Claude (Brain) -> reply via Telegram Bot API.
// GET ?setup=1  = one-time: registers this URL as the bot webhook, returns the bot's
//                 @username, and sends Ahmad a hello message (so he can just reply).
//
// Env vars (read at runtime):
//   ANTHROPIC_API_KEY    - Anthropic key (already set for Brain)
//   TELEGRAM_BOT_TOKEN   - bot token from @BotFather (already set)
// Optional:
//   TELEGRAM_CHAT_ID     - if set, the hello on ?setup is sent here; and if
//                          TG_LOCK=1, the bot ONLY answers this chat.
//   TG_LOCK              - "1" to restrict the bot to TELEGRAM_CHAT_ID only.
//   BRAIN_MODEL          - overrides the model (default claude-sonnet-4-5).
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad, replying to him over Telegram. You are his right hand: you get things done, you don't stall.

ABOUT AHMAD'S BUSINESS (answer as an insider; no need to ask basics):
- Runs "Urban Sydney Wide Solutions" (USWS) — a landscaping company across Sydney, Australia. Website: usws.com.au.
- Services: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features. (He does NOT do fencing and does NOT do grass mowing/maintenance — never offer these.)
- Contact: phone/WhatsApp 0434 449 997, email info@usws.com.au, ABN 20 386 532 878, open 24 hrs, free on-site quotes, fully insured.
- Serves Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown.
- Ahmad also trades (forex / SMC — smart money concepts) and builds small web tools and projects.

WHAT YOU DO:
- Reply to customers: professional, warm, ready-to-send messages and quote wording. Always include a clear next step.
- Trading: analysis, SMC checklists, trade plans (entry/stop/target + R:R), risk rules. You are NOT a licensed financial advisor — give frameworks and education, not guaranteed calls. Never claim to place real trades.
- Help with anything else: drafts, plans, ideas, quick answers.

RULES (Telegram):
- LANGUAGE (critical): Mirror the user's language EXACTLY, every message. If their message is in English, reply ONLY in English. If it is in Arabic, reply in Levantine Arabic. Judge by the CURRENT message; if they switch, switch with them. Never mix the two in one reply.
- Keep it concise and chat-friendly — this is a chat app, not a document. Short paragraphs, no heavy markdown, no long code blocks unless explicitly asked. Lead with the answer.
- Be proactive: if a request is clear, just do it. Only ask when you truly cannot proceed.`;

function jsonResp(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), { status: status || 200, headers: { "content-type": "application/json" } });
}

function tgApi(token, method) { return "https://api.telegram.org/bot" + token + "/" + method; }

async function askBrain(key, userText) {
  const r = await fetch(ANTHROPIC, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: userText }] })
  });
  if (!r.ok) {
    let t = ""; try { t = await r.text(); } catch (e) {}
    if (/401|invalid x-api-key|authentication/i.test(t)) return "⚠️ Brain: API key issue.";
    if (/credit|billing|quota|insufficient|402/i.test(t)) return "⚠️ Brain: الرصيد خلص — اشحن حساب Anthropic.";
    if (/429|rate|overloaded|529/i.test(t)) return "⚠️ ضغط مؤقت، جرّب بعد شوي.";
    return "⚠️ Brain error " + r.status;
  }
  const j = await r.json();
  const txt = (j && j.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
  return txt || "…";
}

async function sendTG(token, chatId, text) {
  if (!token || !chatId) return;
  // Telegram text max is 4096 chars — split long replies.
  let s = String(text || "");
  const chunks = [];
  while (s.length > 3900) { chunks.push(s.slice(0, 3900)); s = s.slice(3900); }
  chunks.push(s);
  for (const c of chunks) {
    await fetch(tgApi(token, "sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: c, disable_web_page_preview: true })
    });
  }
}

export default async function handler(req) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = new URL(req.url);

  // ---- GET: one-time setup / health ----
  if (req.method === "GET") {
    if (url.searchParams.get("setup") !== "1") {
      return jsonResp({ ok: true, info: "Brain Telegram webhook. Visit ?setup=1 once to activate." });
    }
    if (!token) return jsonResp({ ok: false, error: "TELEGRAM_BOT_TOKEN missing in Vercel env" }, 500);

    const hook = url.origin + "/api/telegram";
    const out = {};
    // who am I
    try { const me = await (await fetch(tgApi(token, "getMe"))).json(); out.bot = me.result ? ("@" + me.result.username) : me; out.open = me.result ? ("https://t.me/" + me.result.username) : null; } catch (e) { out.getMe_error = String(e); }
    // register webhook
    try {
      const sw = await (await fetch(tgApi(token, "setWebhook"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: hook, allowed_updates: ["message"], drop_pending_updates: true })
      })).json();
      out.setWebhook = sw;
    } catch (e) { out.setWebhook_error = String(e); }
    // say hi so Ahmad can just reply (only works if he has pressed Start before)
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      try { await sendTG(token, chatId, "👋 أهلاً أحمد، أنا Brain — صرت على Telegram. احكيني أي شي (عربي أو إنجليزي) وبردّ عليك فوراً. ✅"); out.hello_sent_to = chatId; } catch (e) { out.hello_error = String(e); }
    }
    return jsonResp(out);
  }

  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // ---- POST: incoming update ----
  try {
    let update = {};
    try { update = await req.json(); } catch (e) {}
    const msg = update.message || update.edited_message || null;
    if (!msg) return jsonResp({ ok: true });

    const chatId = msg.chat && msg.chat.id;
    const text = (msg.text || msg.caption || "").trim();

    // optional lock to a single chat
    if (process.env.TG_LOCK === "1" && process.env.TELEGRAM_CHAT_ID && String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
      return jsonResp({ ok: true, ignored: "locked" });
    }
    if (!token || !chatId) return jsonResp({ ok: true });

    // non-text content (voice note, audio, photo, etc.) — not supported yet
    const hasMedia = msg.voice || msg.audio || msg.video_note || msg.photo || msg.video || msg.document || msg.sticker;
    if (!text && hasMedia) {
      await sendTG(token, chatId, "🎤 لساتني ما بسمع الرسائل الصوتية ولا بشوف الصور — اكتبلي نص وبجاوبك فوراً على أي شي. (الصوت بنضيفه قريباً.)");
      return jsonResp({ ok: true });
    }
    // /start and empty
    if (!text || text === "/start") {
      await sendTG(token, chatId, "👋 أهلاً، أنا Brain. احكيني أي شي بالنص وبردّ عليك — بالعربي أو الإنجليزي. (تداول، رسائل زبائن، أفكار، أي سؤال.)");
      return jsonResp({ ok: true });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { await sendTG(token, chatId, "🔌 Brain غير مفعّل — ناقص ANTHROPIC_API_KEY."); return jsonResp({ ok: true }); }

    const reply = await askBrain(key, text);
    await sendTG(token, chatId, reply);
  } catch (e) {
    // always 200 so Telegram doesn't hammer retries
  }
  return jsonResp({ ok: true });
}
