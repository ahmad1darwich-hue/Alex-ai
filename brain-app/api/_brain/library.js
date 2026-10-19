// Brain Indicators library: every indicator the bot builds is kept here so it can be opened and edited later.
// Shared by the web page (api/library.js) and the Telegram bot (api/telegram.js). Lives in the KV store:
//   brain:ind:lib:meta  hash  id -> { id, name, file, title, verified, errors, lines, source, created, updated, versions }
//   brain:ind:lib:code  hash  id -> { code, history: [{ at, code }] }   (last MAX_VERSIONS earlier versions)
// Without a store (local development) an in-memory map is used.

export const MAX_ITEMS = 300;
export const MAX_VERSIONS = 5;
export const MAX_CODE = 400000;
const META = "brain:ind:lib:meta", CODE = "brain:ind:lib:code";
const mem = { meta: new Map(), code: new Map() };

async function kv(cmds) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return memExec(cmds);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(cmds), signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json()).map((x) => (x && "result" in x ? x.result : null));
  } catch (e) { return null; } finally { clearTimeout(timer); }
}
function memExec(cmds) {
  return cmds.map(([op, key, field, value]) => {
    const m = key === META ? mem.meta : mem.code;
    if (op === "HGET") return m.has(field) ? m.get(field) : null;
    if (op === "HSET") { m.set(field, value); return 1; }
    if (op === "HDEL") return m.delete(field) ? 1 : 0;
    if (op === "HGETALL") { const out = []; for (const [k, v] of m) out.push(k, v); return out; }
    return null;
  });
}
export function _resetMemory() { mem.meta.clear(); mem.code.clear(); }

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const safeFile = (f) => { let s = String(f || "").replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[._]+/, "").slice(0, 80) || "nexus_indicator"; if (!/\.pine$/i.test(s)) s += ".pine"; return s; };
export const validId = (id) => typeof id === "string" && /^[a-z0-9]{6,24}$/.test(id);

// Name a script from its declaration when no title was given: indicator("My Name", ...) -> My Name.
export function nameFromCode(code) {
  const m = /^\s*(?:indicator|strategy)\(\s*(["'])(.*?)\1/m.exec(String(code || ""));
  return m ? m[2].slice(0, 80) : "";
}

export async function listItems() {
  const res = await kv([["HGETALL", META]]);
  if (!res) return null;
  const flat = res[0];
  const items = [];
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) { const it = parse(flat[i + 1]); if (it && it.id) items.push(it); }
  else if (flat && typeof flat === "object") for (const k in flat) { const it = parse(flat[k]); if (it && it.id) items.push(it); }
  return items.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function getItem(id) {
  if (!validId(id)) return null;
  const res = await kv([["HGET", META, id], ["HGET", CODE, id]]);
  if (!res) return undefined; // store unavailable
  const meta = parse(res[0]), body = parse(res[1]);
  if (!meta || !body) return null;
  return { ...meta, code: body.code || "", history: Array.isArray(body.history) ? body.history : [] };
}

/**
 * Saves a script. With an existing `id` the item is updated and the previous code becomes a version; otherwise a new
 * item is created. Returns { ok, id, item } or { ok: false, message }.
 */
export async function saveItem(input) {
  const code = String((input && input.code) || "");
  if (!code.trim() || !/\/\/@version=\d/.test(code)) return { ok: false, message: "no script" };
  if (code.length > MAX_CODE) return { ok: false, message: "too large" };
  const now = Date.now();
  let prev = null;
  if (input.id && validId(input.id)) { prev = await getItem(input.id); if (prev === undefined) return { ok: false, message: "store unavailable" }; }
  if (!prev) {
    const all = await listItems();
    if (all === null) return { ok: false, message: "store unavailable" };
    // Full: the oldest item makes room (the library is a working set, not an archive).
    if (all.length >= MAX_ITEMS) { const old = all.slice(MAX_ITEMS - 1); await kv(old.flatMap((o) => [["HDEL", META, o.id], ["HDEL", CODE, o.id]])); }
  }
  const id = prev ? prev.id : newId();
  let history = prev ? prev.history.slice() : [];
  if (prev && prev.code && prev.code !== code) history = [{ at: prev.updated || now, code: prev.code }].concat(history).slice(0, MAX_VERSIONS);
  const errors = Array.isArray(input.errors) ? input.errors.slice(0, 3).map((e) => clean(typeof e === "string" ? e : (e && e.message) || "", 200)).filter(Boolean) : [];
  const meta = {
    id,
    name: clean(input.name, 80) || (prev && prev.name) || clean(input.title, 80) || nameFromCode(code) || "Indicator",
    file: safeFile(input.file || (prev && prev.file)),
    title: clean(input.title, 120) || (prev && prev.title) || "",
    request: clean(input.request, 300) || (prev && prev.request) || "",
    verified: input.verified === true,
    errors,
    lines: code.replace(/\n$/, "").split("\n").length,
    source: ["web", "telegram", "manual"].includes(input.source) ? input.source : "web",
    created: prev ? prev.created : now,
    updated: now,
    versions: history.length,
  };
  const ok = await kv([["HSET", META, id, JSON.stringify(meta)], ["HSET", CODE, id, JSON.stringify({ code, history })]]);
  if (!ok) return { ok: false, message: "store unavailable" };
  return { ok: true, id, item: meta };
}

export async function renameItem(id, name) {
  const it = await getItem(id);
  if (!it) return { ok: false, message: it === undefined ? "store unavailable" : "not found" };
  const n = clean(name, 80);
  if (!n) return { ok: false, message: "empty name" };
  const { code, history, ...meta } = it;
  meta.name = n;
  const ok = await kv([["HSET", META, id, JSON.stringify(meta)]]);
  return ok ? { ok: true, item: meta } : { ok: false, message: "store unavailable" };
}

export async function deleteItem(id) {
  if (!validId(id)) return { ok: false, message: "bad id" };
  const ok = await kv([["HDEL", META, id], ["HDEL", CODE, id]]);
  return ok ? { ok: true } : { ok: false, message: "store unavailable" };
}

// Puts an earlier version back as the current code (the current code becomes a version itself).
export async function restoreVersion(id, index) {
  const it = await getItem(id);
  if (!it) return { ok: false, message: it === undefined ? "store unavailable" : "not found" };
  const v = it.history[Number(index)];
  if (!v) return { ok: false, message: "no such version" };
  return saveItem({ id, code: v.code, name: it.name, file: it.file, title: it.title, request: it.request, verified: false, source: it.source });
}
