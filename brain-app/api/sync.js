// Brain Indicators - one conversation shared between the owner's devices (Vercel EDGE function).
// GET  -> { ok, rev, data }      POST { data } -> { ok, rev }      Both need the owner's key (see _brain/lock.js).
// The conversation (text and scripts, no images) is kept in the KV store; the newest write wins.
import { brainAuth, lockedReply } from "./_brain/lock.js";
export const config = { runtime: "edge" };

const KEY = "brain:indicators:convo";
const MAX = 800000; // characters
const mem = { value: null }; // used only when no store is configured (local development)

async function kv(cmd) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) {
    if (cmd[0] === "GET") return { result: mem.value };
    mem.value = cmd[2]; return { result: "OK" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url.replace(/\/$/, ""), { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(cmd), signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}
// The public Nexus page (another site of the owner) may use this too: it is still closed without the key.
const SITES = ["https://indicator-build.vercel.app"];
let cors = {};
const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors } });

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  cors = SITES.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type,x-brain-key", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-max-age": "600", vary: "origin" } : {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const auth = brainAuth(req.headers.get("x-brain-key"));
  if (auth !== "ok") return json({ ok: false, locked: true, auth, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);
  if (req.method !== "GET" && req.method !== "POST") return new Response("GET or POST", { status: 405 });
  const got = await kv(["GET", KEY]);
  if (!got) return json({ ok: false, message: "store unavailable" }, 503);
  let cur = null;
  try { cur = got.result ? JSON.parse(got.result) : null; } catch (e) {}
  const rev = cur && Number.isFinite(cur.rev) ? cur.rev : 0;
  if (req.method === "GET") return json({ ok: true, rev, data: cur ? cur.data : null });

  let raw = "";
  try { raw = await req.text(); } catch (e) {}
  if (raw.length > MAX) return json({ ok: false, message: "too large" }, 413);
  let body = null;
  try { body = JSON.parse(raw); } catch (e) {}
  const data = body && body.data;
  if (!data || typeof data !== "object" || data.v !== 2 || !Array.isArray(data.msgs) || data.msgs.length > 60) return json({ ok: false, message: "bad data" }, 400);
  const next = { rev: rev + 1, at: Date.now(), data };
  const put = await kv(["SET", KEY, JSON.stringify(next)]);
  if (!put) return json({ ok: false, message: "store unavailable" }, 503);
  return json({ ok: true, rev: next.rev });
}
