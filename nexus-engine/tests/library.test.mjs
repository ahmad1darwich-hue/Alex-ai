// Saved indicators library (brain-app/api/library.js + _brain/library.js).   node nexus-engine/tests/library.test.mjs
// No store configured: the in-memory fallback is used, so no network or keys are needed.
import assert from "node:assert/strict";
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
process.env.BRAIN_KEY = "owner-key-0123456789abcdefghij";
const { default: lib } = await import("../../brain-app/api/library.js");
const L = await import("../../brain-app/api/_brain/library.js");
const CODE = '//@version=6\nindicator("My EMA Cross", overlay = true)\nplot(ta.ema(close, 20))\n';
const call = (method, q, body, key = process.env.BRAIN_KEY) => lib(new Request("https://b.test/api/library" + (q || ""), { method, headers: { "x-brain-key": key, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", String(e.stack).split("\n").slice(0, 4).join("\n  ")); process.exitCode = 1; } };

await t("locked without the owner key", async () => {
  assert.equal((await call("GET", "", null, "wrong")).status, 401);
});
let id;
await t("save creates an item named from the declaration, list has no code", async () => {
  const j = await (await call("POST", "", { action: "save", code: CODE, file: "ema.pine", verified: true })).json();
  assert.equal(j.ok, true); id = j.id; assert.equal(j.item.name, "My EMA Cross"); assert.equal(j.item.versions, 0);
  const l = await (await call("GET")).json();
  assert.equal(l.items.length, 1); assert.equal(l.items[0].code, undefined);
});
await t("saving with the same id updates it and keeps the old code as a version", async () => {
  const code2 = CODE.replace("20", "50");
  const j = await (await call("POST", "", { action: "save", id, code: code2 })).json();
  assert.equal(j.id, id); assert.equal(j.item.versions, 1);
  const it = (await (await call("GET", "?id=" + id)).json()).item;
  assert.equal(it.code, code2); assert.equal(it.history[0].code, CODE);
  const r = await (await call("POST", "", { action: "restore", id, index: 0 })).json();
  assert.equal(r.ok, true);
  assert.equal((await (await call("GET", "?id=" + id)).json()).item.code, CODE);
});
await t("rename, reject non-Pine, delete", async () => {
  assert.equal((await (await call("POST", "", { action: "rename", id, name: "  Gold scalper " })).json()).item.name, "Gold scalper");
  assert.equal((await call("POST", "", { action: "save", code: "hello" })).status, 400);
  assert.equal((await (await call("POST", "", { action: "delete", id })).json()).ok, true);
  assert.equal((await call("GET", "?id=" + id)).status, 404);
  assert.equal((await call("GET", "?id=../x")).status, 400);
});
await t("versions are capped", async () => {
  const a = await L.saveItem({ code: CODE });
  for (let i = 0; i < 9; i++) await L.saveItem({ id: a.id, code: CODE + "// " + i + "\n" });
  assert.equal((await L.getItem(a.id)).history.length, L.MAX_VERSIONS);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
