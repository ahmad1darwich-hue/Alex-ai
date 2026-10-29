// Brain Indicators - saved indicators library (Vercel EDGE function). Needs the owner's key (see _brain/lock.js).
//   GET                 -> { ok, items: [meta...] }           (newest first, no code)
//   GET ?id=<id>        -> { ok, item: { ...meta, code, history: [{ at, code }] } }
//   POST { action: "save", id?, code, name?, file?, title?, request?, verified?, errors? } -> { ok, id, item }
//   POST { action: "rename", id, name } | { action: "delete", id } | { action: "restore", id, index }
//        | { action: "autoupdate", id, on }   (automatic daily update of this indicator on / off, default on)
//        | { action: "upgrade", id }          (apply the pending engine updates now; streamed: spaces, then one JSON line)
//   GET list items carry `pending` (an update is waiting for them); the list carries `upgrade` { rev, ar, en }.
import { brainAuth, lockedReply } from "./_brain/lock.js";
import { upgradeOne } from "./_brain/lib-upgrade.js";
import { pendingUpgrades, UPGRADES } from "./_brain/lib-upgrade-notes.js";
import { makeCaller } from "./_nexus/handler.js";
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
    if (!items) return unavailable();
    for (const it of items) it.pending = it.autoUpdate !== false && pendingUpgrades(it).length > 0 ? pendingUpgrades(it).map((u) => u.rev) : undefined;
    // The text of every update that some indicator is still waiting for (oldest first).
    const waiting = new Set(items.flatMap((it) => it.pending || []));
    const ups = UPGRADES.filter((u) => waiting.has(u.rev));
    const last = UPGRADES[UPGRADES.length - 1];
    const upgrade = ups.length ? { rev: ups[ups.length - 1].rev, ar: ups.map((u) => u.ar).join(" · "), en: ups.map((u) => u.en).join(" · ") } : last ? { rev: last.rev, ar: last.ar, en: last.en } : null;
    return json({ ok: true, items, upgrade }, 200, cors);
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
  else if (b.action === "upgrade") return upgradeNow(b.id, cors, req.signal);
  else return json({ ok: false, message: "unknown action" }, 400, cors);
  const status = out.ok ? 200 : out.message === "store unavailable" ? 503 : out.message === "not found" ? 404 : 400;
  return json(out, status, cors);
}

function sydneyDay() {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); }
}

// "Update now" from the library card: the same update the daily cron does, for one indicator, on demand. The model
// may need a minute or two, so the reply is streamed (spaces keep the connection open) and ends with one JSON line.
async function upgradeNow(id, cors, reqSignal) {
  if (!validId(id)) return json({ ok: false, message: "bad id" }, 400, cors);
  const meta = await getItem(id);
  if (meta === undefined) return json({ ok: false, message: "store unavailable" }, 503, cors);
  if (!meta) return json({ ok: false, message: "not found" }, 404, cors);
  const { code, history, ...m } = meta;
  if (!pendingUpgrades(m).length) return json({ ok: true, result: { id, name: m.name, status: "up_to_date", from: Number(m.ver) || (m.versions || 0) + 1 }, item: m }, 200, cors);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ ok: false, message: "no model key" }, 503, cors);
  const abort = new AbortController();
  if (reqSignal) reqSignal.addEventListener("abort", () => abort.abort(), { once: true });
  const deadline = Date.now() + 240000;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    cancel() { abort.abort(); },
    async start(controller) {
      let closed = false;
      const send = (t) => { if (closed) return; try { controller.enqueue(enc.encode(t)); } catch (e) { closed = true; } };
      const beat = setInterval(() => send(" "), 7000);
      send(" ");
      try {
        const result = await upgradeOne(m, { callModel: makeCaller(key, deadline, {}, abort.signal), deadline, signal: abort.signal, day: sydneyDay() });
        const after = await getItem(id);
        let item = null;
        if (after) { const { code: c2, history: h2, ...m2 } = after; item = m2; }
        send("\n" + JSON.stringify({ ok: true, result, item }) + "\n");
      } catch (e) {
        send("\n" + JSON.stringify({ ok: false, message: String((e && e.message) || "error").slice(0, 200) }) + "\n");
      } finally { clearInterval(beat); closed = true; try { controller.close(); } catch (e) {} }
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors } });
}
