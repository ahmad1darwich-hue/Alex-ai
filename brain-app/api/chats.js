// Brain Indicators - saved conversations (Vercel EDGE function). Needs the owner's key (see _brain/lock.js).
//   GET               -> { ok, chats: [{ id, title, updated, count }] }   newest first
//   GET ?id=<id>      -> { ok, chat: { id, title, updated, data } }
//   POST { action: "save", id, title, data } | { action: "delete", id }
// Every conversation of the indicators page is kept (up to MAX), so an older one can be reopened on any device.
import { brainAuth, lockedReply } from "./_brain/lock.js";
export const config = { runtime: "edge" };

const META = "brain:ind:chats:meta", DATA = "brain:ind:chats:data";
const MAX = 60, MAX_DATA = 400000;
const mem = { meta: new Map(), data: new Map() };
const validId = (id) => typeof id === "string" && /^[a-z0-9]{6,24}$/.test(id);

async function kv(cmds) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return cmds.map(([op, key, field, value]) => {
    const m = key === META ? mem.meta : mem.data;
    if (op === "HGET") return m.has(field) ? m.get(field) : null;
    if (op === "HSET") { m.set(field, value); return 1; }
    if (op === "HDEL") return m.delete(field) ? 1 : 0;
    if (op === "HGETALL") { const o = []; for (const [k, v] of m) o.push(k, v); return o; }
    return null;
  });
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(cmds) });
    return r.ok ? (await r.json()).map((x) => (x && "result" in x ? x.result : null)) : null;
  } catch (e) { return null; }
}
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
async function list() {
  const res = await kv([["HGETALL", META]]);
  if (!res) return null;
  const flat = res[0], out = [];
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) { const it = parse(flat[i + 1]); if (it && it.id) out.push(it); }
  else if (flat && typeof flat === "object") for (const k in flat) { const it = parse(flat[k]); if (it && it.id) out.push(it); }
  return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async function handler(req) {
  const auth = brainAuth(req.headers.get("x-brain-key"));
  if (auth !== "ok") return json({ ok: false, locked: true, auth, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      if (!validId(id)) return json({ ok: false, message: "bad id" }, 400);
      const res = await kv([["HGET", META, id], ["HGET", DATA, id]]);
      if (!res) return json({ ok: false, message: "store unavailable" }, 503);
      const meta = parse(res[0]), data = parse(res[1]);
      return meta && data ? json({ ok: true, chat: { ...meta, data } }) : json({ ok: false, message: "not found" }, 404);
    }
    const chats = await list();
    return chats ? json({ ok: true, chats }) : json({ ok: false, message: "store unavailable" }, 503);
  }
  if (req.method !== "POST") return new Response("GET or POST", { status: 405 });
  let raw = ""; try { raw = await req.text(); } catch (e) {}
  if (raw.length > MAX_DATA + 5000) return json({ ok: false, message: "too large" }, 413);
  const b = parse(raw);
  if (!b || !validId(b.id)) return json({ ok: false, message: "bad request" }, 400);
  if (b.action === "delete") { const r = await kv([["HDEL", META, b.id], ["HDEL", DATA, b.id]]); return r ? json({ ok: true }) : json({ ok: false, message: "store unavailable" }, 503); }
  if (b.action !== "save") return json({ ok: false, message: "unknown action" }, 400);
  const d = b.data;
  if (!d || typeof d !== "object" || d.v !== 2 || !Array.isArray(d.msgs) || !d.msgs.length || d.msgs.length > 60) return json({ ok: false, message: "bad data" }, 400);
  const all = await list();
  if (!all) return json({ ok: false, message: "store unavailable" }, 503);
  const prev = all.find((c) => c.id === b.id);
  if (!prev && all.length >= MAX) { const old = all.slice(MAX - 1); await kv(old.flatMap((o) => [["HDEL", META, o.id], ["HDEL", DATA, o.id]])); }
  const meta = { id: b.id, title: String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 90) || "محادثة", updated: Date.now(), created: prev ? prev.created : Date.now(), count: d.msgs.length };
  const ok = await kv([["HSET", META, b.id, JSON.stringify(meta)], ["HSET", DATA, b.id, JSON.stringify(d)]]);
  return ok ? json({ ok: true, chat: meta }) : json({ ok: false, message: "store unavailable" }, 503);
}
