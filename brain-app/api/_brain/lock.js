// Brain's private endpoints (the assistant and the work inbox) answer only callers that hold the owner's key.
//
// BRAIN_KEY is a long random secret set in the Vercel project. A device receives it once, through the activation
// link  https://<brain site>/#key=<BRAIN_KEY>  (the page stores it and removes it from the address bar), and then
// sends it with every request in the "x-brain-key" header. Without BRAIN_KEY the endpoints stay closed.

// "ok" | "denied" | "unset". The comparison takes the same time whatever the given value is.
export function brainAuth(given) {
  const key = String(process.env.BRAIN_KEY || "").trim();
  if (!/^[A-Za-z0-9_-]{24,200}$/.test(key)) return "unset";
  const g = typeof given === "string" ? given : "";
  let diff = g.length ^ key.length;
  for (let i = 0; i < key.length; i++) diff |= (g.length ? g.charCodeAt(i % g.length) : 0) ^ key.charCodeAt(i);
  return diff === 0 ? "ok" : "denied";
}

// The sentence shown in the Brain page when a request is refused.
export function lockedReply(state) {
  if (state === "unset") return "🔒 Brain مقفول: المفتاح BRAIN_KEY مش مضبوط بإعدادات Vercel.\nBrain is locked: BRAIN_KEY is not set in the Vercel project.";
  return "🔒 هالجهاز مش مفعّل لـ Brain. افتح رابط التفعيل مرّة وحدة على هالجهاز، أو الصق المفتاح هون.\nThis device is not activated for Brain. Open the activation link once on this device, or paste the key here.";
}

// Meta signs every webhook call with the app secret ("x-hub-signature-256: sha256=<hex>"). A call without a valid
// signature is ignored, and a bot without its app secret stays off: otherwise anyone could post fake messages.
export async function metaSignatureOk(rawBody, header, secret) {
  if (!secret) return false;
  const given = String(header || "").replace(/^sha256=/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  let hex = "";
  for (const b of sig) hex += b.toString(16).padStart(2, "0");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
