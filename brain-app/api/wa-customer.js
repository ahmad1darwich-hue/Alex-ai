// USWS customer reception bot — WhatsApp Cloud API webhook (Vercel EDGE).
// This is the CUSTOMER-FACING bot for the business number. It greets customers,
// answers common questions, collects job details and arranges a free quote.
// It never quotes firm prices — Ahmad confirms those.
//
// Separate env vars from the personal Brain bot so both can run independently:
//   ANTHROPIC_API_KEY   - Anthropic key (already set)
//   WA_BIZ_TOKEN        - access token for the business WhatsApp (Meta)
//   WA_BIZ_PHONE_ID     - the business number's Phone number ID (Meta)
//   WA_BIZ_VERIFY_TOKEN - any secret string; enter the SAME value in Meta's webhook config
// Optional:
//   BRAIN_MODEL         - overrides the model (default claude-sonnet-4-5)
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-4-5";
const API = "https://api.anthropic.com/v1/messages";
const GRAPH = "https://graph.facebook.com/v21.0";

const SYSTEM = `You are the friendly WhatsApp assistant for "Urban Sydney Wide Solutions" (USWS), a landscaping company in Sydney, Australia. You are replying to CUSTOMERS on the business WhatsApp line. Think of yourself as a warm, professional receptionist who makes a great first impression and never loses a lead.

THE BUSINESS:
- USWS — landscaping & outdoor construction across Sydney. Website: usws.com.au.
- Services we DO: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features.
- Services we DO NOT do (politely say we don't offer these, don't try to book them): fencing, and grass mowing / lawn-maintenance.
- Free on-site quotes. Fully insured. ABN 20 386 532 878. Open 24 hrs for enquiries.
- We serve Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown. If a customer is clearly outside these areas, politely let them know we may not cover their area and offer to check.
- Direct phone / urgent: 0434 449 997. Email: info@usws.com.au.

YOUR ONE JOB: BOOK A FREE ON-SITE QUOTE APPOINTMENT. Nothing else. You are a booking assistant, not a salesperson or an estimator. Every chat should move, politely and efficiently, toward capturing a booking.

To book, collect these details (ask for the missing ones, one or two at a time, don't interrogate):
1. Name.
2. Suburb (and street/address if they'll give it) — check it's within our service regions above.
3. Which service they need + a short description of the job (photos welcome).
4. Preferred day and time window for the free on-site visit (e.g. "Tuesday morning").
5. Best contact number if different from this chat.
Once you have these, warmly confirm the booking back to them in a short summary ("Great — so that's [service] at [suburb], [day/time]. The team will confirm shortly."), thank them, and stop asking.

HARD RULES:
- NEVER give a price, a quote figure, a rough estimate, a range, or an "it depends but around..." — NONE. Pricing only happens at the free on-site visit. If pushed for a price, warmly say every job is different so we give an accurate free quote on site, and steer straight back to booking the visit.
- Don't answer off-topic questions, give advice, or do anything other than booking the appointment. If asked something unrelated, gently say you're here to book their free quote and ask for the next detail. For anything else, give the phone number 0434 449 997.
- Don't promise an exact confirmed time yourself — say the team will confirm the appointment.
- Don't invent details. If unsure, say the team will clarify or give 0434 449 997.
- Keep replies short, warm and WhatsApp-friendly — a couple of lines, no markdown, no code. One or two clear questions at a time.
- LANGUAGE: reply in the SAME language the customer writes in. English → English, Arabic → Arabic. Never mix.
- Be honest you're the USWS assistant; if they want a person, give 0434 449 997.`;

function jsonResp(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } }); }

function verify(req) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WA_BIZ_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

async function askBot(key, userText) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, system: SYSTEM, messages: [{ role: "user", content: userText }] })
  });
  if (!r.ok) return "Thanks for messaging USWS! For a quick response please call us on 0434 449 997.";
  const j = await r.json();
  const txt = (j && j.content || []).filter(b => b && b.type === "text").map(b => b.text).join("\n").trim();
  return txt || "Thanks for messaging USWS! How can we help with your landscaping project?";
}

async function sendWA(to, body) {
  const token = process.env.WA_BIZ_TOKEN, phoneId = process.env.WA_BIZ_PHONE_ID;
  if (!token || !phoneId) return;
  const chunks = []; let s = body;
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

  let body = {};
  try { body = await req.json(); } catch (e) {}
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    const entry = (body.entry && body.entry[0]) || {};
    const change = (entry.changes && entry.changes[0]) || {};
    const value = change.value || {};
    const msg = (value.messages && value.messages[0]) || null;

    if (msg && msg.type && key) {
      const from = msg.from;
      let userText = "";
      if (msg.type === "text") userText = (msg.text && msg.text.body) || "";
      else if (msg.type === "button") userText = (msg.button && msg.button.text) || "";
      else if (msg.type === "interactive") { const i = msg.interactive || {}; userText = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || ""; }
      else if (msg.type === "image" || msg.type === "document") {
        await sendWA(from, "Thanks, we've received your photo/file 📸 — could you also tell us your suburb and what work you'd like done? We'll arrange a free on-site quote.");
        return jsonResp({ ok: true });
      } else {
        await sendWA(from, "Thanks for contacting USWS! Please send us a message describing what you need, or call 0434 449 997.");
        return jsonResp({ ok: true });
      }

      if (userText.trim()) {
        const reply = await askBot(key, userText.trim());
        await sendWA(from, reply);
      }
    }
  } catch (e) { /* always 200 so Meta doesn't retry-spam */ }
  return jsonResp({ ok: true });
}
