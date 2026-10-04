// Brain on WhatsApp — Meta WhatsApp Cloud API webhook (Vercel EDGE function).
// GET  = webhook verification (Meta hub.challenge).
// POST = incoming WhatsApp message -> ask Claude (Brain) -> send reply back via Graph API.
//
// Required env vars (add in Vercel project settings):
//   ANTHROPIC_API_KEY   - your Anthropic key (already set for Brain)
//   WA_TOKEN            - permanent access token from Meta (WhatsApp > API setup)
//   WA_PHONE_ID         - the Phone number ID from Meta (NOT the phone number itself)
//   WA_VERIFY_TOKEN     - any secret string you invent; enter the SAME value in Meta's webhook config
// Optional:
//   WA_ALLOWED          - comma-separated phone numbers allowed to use the bot (digits only, with country code),
//                         e.g. "61434449997". If set, messages from other numbers are ignored.
//   BRAIN_MODEL         - overrides the model (default claude-sonnet-4-5)
//   WA_APP_SECRET       - the Meta app secret (required): calls that are not signed by Meta are ignored.
// Without WA_TOKEN, WA_PHONE_ID and WA_APP_SECRET the bot is off: nothing is sent to the model.
import { metaSignatureOk } from "./_brain/lock.js";
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";
const GRAPH = "https://graph.facebook.com/v21.0";

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad, replying to him over WhatsApp. You are his right hand: you get things done, you don't stall.

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

RULES (WhatsApp):
- LANGUAGE (critical): Mirror the user's language EXACTLY, every message. If their message is in English, reply ONLY in English. If it is in Arabic, reply in Levantine Arabic. Judge by the CURRENT message; if they switch, switch with them. Never mix the two in one reply.
- Keep it concise and chat-friendly — this is WhatsApp, not a document. Short paragraphs, no heavy markdown, no long code blocks unless explicitly asked. Lead with the answer.
- Be proactive: if a request is clear, just do it. Only ask when you truly cannot proceed.`;

function jsonResp(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } }); }

// ---- GET: webhook verification ----
function verify(req) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WA_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

async function askBrain(key, userText) {
  const r = await fetch(API, {
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

async function sendWA(to, body) {
  const token = process.env.WA_TOKEN, phoneId = process.env.WA_PHONE_ID;
  if (!token || !phoneId) return;
  // WhatsApp text body max is 4096 chars — split long replies into chunks.
  const chunks = [];
  let s = body;
  while (s.length > 3900) { chunks.push(s.slice(0, 3900)); s = s.slice(3900); }
  chunks.push(s);
  for (const c of chunks) {
    await fetch(GRAPH + "/" + phoneId + "/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + token },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "text", text: { preview_url: false, body: c } })
    });
  }
}

export default async function handler(req) {
  if (req.method === "GET") return verify(req);
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // Not configured: the bot cannot answer anyone, so no model call is made for whoever posts here.
  const secret = (process.env.WA_APP_SECRET || "").trim();
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_ID || !secret) return jsonResp({ ok: true, off: true });
  let raw = "";
  try { raw = await req.text(); } catch (e) {}
  if (raw.length > 200000 || !(await metaSignatureOk(raw, req.headers.get("x-hub-signature-256"), secret))) return jsonResp({ ok: true, ignored: "signature" });
  let body = {};
  try { body = JSON.parse(raw); } catch (e) {}
  if (!body || typeof body !== "object") body = {};

  // Acknowledge fast is good, but Edge freezes after the response returns, so we
  // process inline (short max_tokens keeps it well under the limit) then 200.
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    const entry = (body.entry && body.entry[0]) || {};
    const change = (entry.changes && entry.changes[0]) || {};
    const value = change.value || {};
    const msg = (value.messages && value.messages[0]) || null;

    if (msg && msg.type) {
      const from = msg.from;
      const allow = (process.env.WA_ALLOWED || "").split(",").map(x => x.replace(/\D/g, "")).filter(Boolean);
      if (allow.length && allow.indexOf((from || "").replace(/\D/g, "")) === -1) {
        return jsonResp({ ok: true, ignored: "not allowed" });
      }
      if (!key) { await sendWA(from, "🔌 Brain غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel."); return jsonResp({ ok: true }); }

      let userText = "";
      if (msg.type === "text") userText = (msg.text && msg.text.body) || "";
      else if (msg.type === "button") userText = (msg.button && msg.button.text) || "";
      else if (msg.type === "interactive") { const i = msg.interactive || {}; userText = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || ""; }
      else { await sendWA(from, "بعتلي رسالة نصّية 📝 — حالياً برد على النصوص بس (الصور والصوت بنضيفهم لاحقاً)."); return jsonResp({ ok: true }); }

      if (userText.trim()) {
        const reply = await askBrain(key, userText.trim());
        await sendWA(from, reply);
      }
    }
  } catch (e) {
    // swallow — always 200 so Meta doesn't spam retries
  }
  return jsonResp({ ok: true });
}
