// Brain voice (Vercel EDGE): speech -> text and text -> speech for the Brain page. Private (owner key, _brain/lock.js).
//
//   POST audio/* body                      -> { text }   (Whisper large v3 turbo on Groq, or OpenAI whisper-1)
//   POST { tts: "<text>" } (JSON)          -> audio/wav  (Groq Orpheus: Arabic or English voice by the text)
//   GET                                    -> { stt, tts } which halves are available (owner only)
//
// Env: GROQ_API_KEY (both halves; same key as the Telegram voice notes), OPENAI_API_KEY (speech -> text fallback),
// ORPHEUS_VOICE_AR / ORPHEUS_VOICE_EN (voices). When a half is missing the page falls back to the browser's own
// speech recognition / speech synthesis.
import { brainAuth, lockedReply } from "./_brain/lock.js";
export const config = { runtime: "edge" };

const MAX_AUDIO = 4 * 1024 * 1024; // ~4 minutes of opus; Vercel's request limit is 4.5 MB
// Words Whisper should spell right (it uses the prompt as a vocabulary hint, not as an instruction).
const VOCAB = "Brain, USWS, Urban Sydney Wide Solutions, XAUUSD, US100, US30, Nasdaq, TradingView, Pine Script, order block, FVG, liquidity, turf, pavers, retaining wall, decking, concreting. حكي شامي: شو، هلّق، بدّي، منيح، تمام، الذهب، المؤشر، عرض سعر.";

function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
export const hasArabic = (s) => /[؀-ۿ]/.test(String(s || ""));

// Text that reads well aloud: no code, links, markdown marks, emoji or the sources list.
export function speakable(text, max = 900) {
  let s = String(text || "").split(/\n?———/)[0]; // the part after the line is shown, not read
  s = s.replace(/```[\s\S]*?```/g, " ").replace(/\n+🔗[^\n]*(?:\n•[^\n]*)*/g, " ");
  s = s.replace(/https?:\/\/\S+/g, " ").replace(/[*_#>`|~]+/g, " ").replace(/^\s*[-•]\s+/gm, "، ");
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ").replace(/\s+/g, " ").trim();
  if (s.length > max) { const cut = Math.max(s.lastIndexOf(". ", max), s.lastIndexOf("، ", max), s.lastIndexOf("؟ ", max)); s = s.slice(0, cut > max * 0.5 ? cut + 1 : max).trim(); }
  return s;
}

function extFor(type) {
  if (/mp4|m4a|aac/i.test(type)) return "m4a";
  if (/ogg/i.test(type)) return "ogg";
  if (/wav/i.test(type)) return "wav";
  if (/mpeg|mp3/i.test(type)) return "mp3";
  return "webm";
}

async function transcribe(buf, type) {
  const groq = process.env.GROQ_API_KEY, oai = process.env.OPENAI_API_KEY;
  if (!groq && !oai) return { error: "no_stt" };
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: type || "audio/webm" }), "voice." + extFor(type));
  fd.append("model", groq ? "whisper-large-v3-turbo" : "whisper-1");
  fd.append("prompt", VOCAB);
  fd.append("temperature", "0");
  const r = await fetch(groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + (groq || oai) }, body: fd });
  if (!r.ok) return { error: "stt_" + r.status };
  const j = await r.json().catch(() => ({}));
  let text = String((j && j.text) || "").trim();
  if (text === VOCAB || /^(شكرا|thank you|thanks)[.!]?$/i.test(text) && buf.byteLength < 12000) text = ""; // silence hallucinations
  return { text };
}

async function speak(text) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const ar = hasArabic(text);
  const body = { model: ar ? "canopylabs/orpheus-arabic-saudi" : "canopylabs/orpheus-v1-english", voice: ar ? (process.env.ORPHEUS_VOICE_AR || "Fahad") : (process.env.ORPHEUS_VOICE_EN || "Daniel"), input: text.slice(0, 200), response_format: "wav" };
  const r = await fetch("https://api.groq.com/openai/v1/audio/speech", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.ok ? r.arrayBuffer() : null;
}

export default async function handler(req) {
  const auth = brainAuth(req.headers.get("x-brain-key"));
  if (auth !== "ok") return json({ locked: true, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);
  if (req.method === "GET") return json({ ok: true, stt: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY), tts: !!process.env.GROQ_API_KEY });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const type = req.headers.get("content-type") || "";
  try {
    if (/^audio\/|^video\/|octet-stream/i.test(type)) {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ text: "" });
      if (buf.byteLength > MAX_AUDIO) return json({ error: "too_long" }, 413);
      return json(await transcribe(buf, type.split(";")[0]));
    }
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const text = speakable(body.tts, 200);
    if (!text) return json({ error: "empty" }, 400);
    const audio = await speak(text);
    if (!audio) return json({ error: "no_tts" }, 503);
    return new Response(audio, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}
