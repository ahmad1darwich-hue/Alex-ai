// Brain Indicators - saved indicators library (Vercel EDGE function). Needs the owner's key (see _brain/lock.js).
//   GET                 -> { ok, items: [meta...] }           (newest first, no code)
//   GET ?id=<id>        -> { ok, item: { ...meta, code, history: [{ at, code }] } }
//   POST { action: "save", id?, code, name?, file?, title?, request?, verified?, errors? } -> { ok, id, item }
//   POST { action: "rename", id, name } | { action: "delete", id } | { action: "restore", id, index }
//        | { action: "autoupdate", id, on }   (automatic daily update of this indicator on / off, default on)
import { brainAuth, lockedReply } from "./_brain/lock.js";
import { listItems, getItem, saveItem, renameItem, deleteItem, restoreVersion, setAutoUpdate, validId, MAX_CODE } from "./_brain/library.js";
export const config = { runtime: "edge" };

const SITES = ["https://indicator-build.vercel.app"];
const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(cors || {}) } });

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const cors = SITES.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type,x-brain-key", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-max-age": "600", vary: "origin" } : {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const auth = brainAuth(req.headers.get("x-brain-key"));
  if (auth !== "ok") return json({ ok: false, locked: true, auth, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401, cors);
  const unavailable = () => json({ ok: false, message: "store unavailable" }, 503, cors);

  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      if (!validId(id)) return json({ ok: false, message: "bad id" }, 400, cors);
      const it = await getItem(id);
      if (it === undefined) return unavailable();
      return it ? json({ ok: true, item: it }, 200, cors) : json({ ok: false, message: "not found" }, 404, cors);
    }
    const items = await listItems();
    return items ? json({ ok: true, items }, 200, cors) : unavailable();
  }
  if (req.method !== "POST") return new Response("GET or POST", { status: 405, headers: cors });

  let raw = "";
  try { raw = await req.text(); } catch (e) {}
  if (raw.length > MAX_CODE * 2 + 20000) return json({ ok: false, message: "too large" }, 413, cors);
  let b = null;
  try { b = JSON.parse(raw); } catch (e) {}
  if (!b || typeof b !== "object") return json({ ok: false, message: "bad request" }, 400, cors);

  let out;
  if (b.action === "save") out = await saveItem({ id: b.id, code: b.code, name: b.name, file: b.file, title: b.title, request: b.request, verified: b.verified === true, errors: b.errors, source: "web" });
  else if (b.action === "rename") out = await renameItem(b.id, b.name);
  else if (b.action === "delete") out = await deleteItem(b.id);
  else if (b.action === "restore") out = await restoreVersion(b.id, b.index);
  else if (b.action === "autoupdate") out = await setAutoUpdate(b.id, b.on !== false);
  else return json({ ok: false, message: "unknown action" }, 400, cors);
  const status = out.ok ? 200 : out.message === "store unavailable" ? 503 : out.message === "not found" ? 404 : 400;
  return json(out, status, cors);
}
