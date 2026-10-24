// Sends text to Ahmad's own Telegram chat with the Brain bot (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
// Long text is split into parts under Telegram's 4096-character limit, on line breaks where possible.
// Plain text only (no parse_mode), so markdown in an answer can never make Telegram reject the message.

// "ابعتلي هالشي على تيليجرام" / "send it to telegram": a send verb AND the word Telegram.
export function wantsTelegram(text) {
  const s = String(text || "");
  return /(تيليجرام|تيليغرام|تيلجرام|تلغرام|تلجرام|تليجرام|تليغرام|تيلي ?غرام|telegram|\btg\b)/i.test(s)
    && /(ابعت|إبعت|بعت(?!قد)|ابعث|إبعث|بعث|ارسل|أرسل|إرسل|رسل|حط|حطّ|نزّل|نزل|send|forward|post|share)/i.test(s);
}

export function splitForTelegram(text, max = 3900) {
  const parts = [];
  let rest = String(text || "").trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// { ok, parts } or { ok: false, why: "unset" | "error" }
export async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, why: "unset" };
  const parts = splitForTelegram(text).slice(0, 12);
  if (!parts.length) return { ok: false, why: "error" };
  try {
    for (let i = 0; i < parts.length; i++) {
      const body = (parts.length > 1 ? `(${i + 1}/${parts.length})\n` : "") + parts[i];
      const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: body, disable_web_page_preview: true }) });
      if (!r.ok) { console.log("TG_SEND fail " + r.status); return { ok: false, why: "error" }; }
    }
    return { ok: true, parts: parts.length };
  } catch (e) { console.log("TG_SEND error " + String(e && e.message || e).slice(0, 120)); return { ok: false, why: "error" }; }
}
