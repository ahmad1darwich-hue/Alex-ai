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

// ElevenLabs: one clean, natural take of the whole answer (mp3), reading the text in whatever dialect it is
// written. ELEVENLABS_API_KEY, ELEVEN_VOICE_ID (pick a voice whose accent Ahmad likes), ELEVEN_MODEL.
// Fish Audio (fish.audio): community and cloned voices, including Levantine Arabic ones. FISH_API_KEY, FISH_VOICE_ID
// (the voice's id, from its page fish.audio/m/<id>), FISH_MODEL (default s2.1-pro; s2.1-pro-free when there is no
// paid credit). Tried first because Ahmad can clone or pick a voice that speaks exactly his dialect.
async function speakFish(text) {
  const key = process.env.FISH_API_KEY;
  if (!key) return null;
  const body = { text, format: "mp3", mp3_bitrate: 128, latency: "normal", normalize: true };
  if (process.env.FISH_VOICE_ID) body.reference_id = process.env.FISH_VOICE_ID.trim();
  const models = [process.env.FISH_MODEL || "s2.1-pro", "s2.1-pro-free"].filter((m, i, a) => a.indexOf(m) === i);
  for (const model of models) {
    const r = await fetch("https://api.fish.audio/v1/tts", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json", model }, body: JSON.stringify(body) });
    if (r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength > 500) return buf; }
    const t = r.ok ? "empty audio" : await r.text().catch(() => "");
    console.log("VOICE_TTS fish " + model + " " + r.status + " " + t.slice(0, 160).replace(/\s+/g, " "));
    if (r.status === 401) break;
  }
  return null;
}

async function speakEleven(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const voice = process.env.ELEVEN_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const models = [process.env.ELEVEN_MODEL || "eleven_multilingual_v2", "eleven_flash_v2_5"].filter((m, i, a) => a.indexOf(m) === i);
  for (const model_id of models) {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voice) + "?output_format=mp3_44100_128", {
      method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
    });
    if (r.ok) return r.arrayBuffer();
    const t = await r.text().catch(() => "");
    console.log("VOICE_TTS eleven " + model_id + " " + r.status + " " + t.slice(0, 160).replace(/\s+/g, " "));
    if (r.status === 401 || r.status === 402 || /quota|unusual|voice_not_found/i.test(t)) break;
  }
  return null;
}

async function speak(text) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const ar = hasArabic(text);
  const body = { model: ar ? "canopylabs/orpheus-arabic-saudi" : "canopylabs/orpheus-v1-english", voice: ar ? (process.env.ORPHEUS_VOICE_AR || "Fahad") : (process.env.ORPHEUS_VOICE_EN || "Daniel"), input: text.slice(0, 200), response_format: "wav" };
  const r = await fetch("https://api.groq.com/openai/v1/audio/speech", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return r.arrayBuffer();
  console.log("VOICE_TTS groq " + body.model + " " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " "));
  return null;
}

export default async function handler(req) {
  const auth = brainAuth(req.headers.get("x-brain-key"));
  if (auth !== "ok") return json({ locked: true, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);
  if (req.method === "GET") return json({ ok: true, stt: !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY), tts: !!(process.env.GROQ_API_KEY || process.env.ELEVENLABS_API_KEY || process.env.FISH_API_KEY), full: !!(process.env.ELEVENLABS_API_KEY || process.env.FISH_API_KEY) });
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
    if (body.full) {
      // The whole answer in one natural take; the page falls back to short clips when this is not available.
      const all = speakable(body.tts, 1500);
      if (!all) return json({ error: "empty" }, 400);
      const mp3 = (await speakFish(all)) || (await speakEleven(all));
      if (!mp3) return json({ error: "no_full" }, 503);
      return new Response(mp3, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-tts": "full" } });
    }
    const text = speakable(body.tts, 200);
    if (!text) return json({ error: "empty" }, 400);
    const audio = await speak(text);
    if (!audio) return json({ error: "no_tts" }, 503);
    return new Response(audio, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
  } catch (e) {
    return json({ error: "failed" }, 500);
  }
}
