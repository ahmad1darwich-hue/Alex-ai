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
await t("automatic update of saved indicators: version N -> N+1 with the date, old code kept, untouched when not concerned, Telegram text", async () => {
  L._resetMemory();
  const U = await import("../../brain-app/api/_brain/lib-upgrade.js");
  const N = await import("../../brain-app/api/_brain/lib-upgrade-notes.js");
  const ZONE = '//@version=6\nindicator("Gold Zones", overlay = true, max_boxes_count = 50)\nlenInput = input.int(10, "Length")\nvar box zb = na\nif ta.change(ta.highest(high, lenInput)) != 0\n    zb := box.new(bar_index - 1, high, bar_index, low)\nplot(ta.ema(close, lenInput), "EMA", color.teal)\n';
  const NEWZ = ZONE.replace('lenInput = input.int(10, "Length")', 'lenInput = input.int(10, "Length")\nlocInput = input.string("Deep (25%)", "Location filter", options = ["Deep (25%)", "Half (50%)", "Off"])').replace("var box zb = na\n", "var box zb = na\nfloat slow = ta.sma(close, 100)\n").replace("!= 0\n", "!= 0 and (locInput == \"Off\" or close < slow)\n");
  // saved before the update system existed (no upgradeRev), a script without zones, and one saved today
  const z = await L.saveItem({ code: ZONE, source: "web" }); const zid = z.id;
  const meta = (await L.listItems()).find((x) => x.id === zid); assert.equal(meta.ver, 1); assert.equal(meta.upgradeRev, N.LATEST_UPGRADE, "saved now = built with today's rules");
  await L.markUpgradeChecked(zid, "", ""); // pretend it is old
  const p = await L.saveItem({ code: CODE, source: "web" }); await L.markUpgradeChecked(p.id, "", "");
  await L.saveItem({ code: CODE.replace("20", "30"), source: "web" });
  const picks = U.pickCandidates(await L.listItems(), 9);
  assert.deepEqual(picks.map((x) => x.id).sort(), [zid, p.id].sort(), "only items with pending updates");
  let calls = 0;
  const cm = async () => { calls++; return { text: "<title>Gold Zones</title>\n<file>gold_zones.pine</file>\n<base>CURRENT</base>\n<code>\n" + NEWZ + "</code>\n<explain>ضفت فلتر مكان المنطقة بالرينج.</explain>", stopReason: "end_turn", usage: { input: 1, output: 1 }, model: "mock" }; };
  const run = await U.runLibraryUpgrades({ callModel: cm, deadline: Date.now() + 60000, day: "2026-10-30" });
  const byId = Object.fromEntries(run.results.map((r) => [r.id, r]));
  assert.equal(byId[p.id].status, "not_concerned"); assert.equal(calls >= 1, true);
  assert.equal(byId[zid].status, "updated", JSON.stringify(byId[zid])); assert.equal(byId[zid].from, 1); assert.equal(byId[zid].to, 2);
  const it = await L.getItem(zid);
  assert.equal(it.code.trim(), NEWZ.trim()); assert.equal(it.history[0].code, ZONE, "old version kept");
  assert.equal(it.upgradeRev, N.LATEST_UPGRADE); assert.equal(it.lastUpgrade.day, "2026-10-30"); assert.equal(it.ver, 2); assert.equal(it.source, "web");
  assert.equal(U.pickCandidates(await L.listItems(), 9).length, 0, "nothing pending after the run");
  const txt = U.upgradeText(run, N.UPGRADES);
  assert.match(txt, /📅 تحديث المؤشرات المحفوظة · 2026-10-30/); assert.match(txt, /Gold Zones: النسخة 1 ← صارت النسخة 2/); assert.match(txt, /مناطق الدخول/);
  assert.match(txt, /ما احتاج تغيير/);
  assert.equal(U.upgradeText({ day: "x", results: [] }, N.UPGRADES), "", "no message when nothing happened");
  // a broken edit is never saved; automatic updates can be turned off per indicator
  await L.markUpgradeChecked(zid, "", "");
  const bad = async () => ({ text: "<base>CURRENT</base>\n<code>\n//@version=6\nindicator(\"Gold Zones\")\nplot(close +)\n</code>\n<explain>x</explain>", stopReason: "end_turn", usage: {}, model: "mock" });
  const r2 = await U.runLibraryUpgrades({ callModel: bad, deadline: Date.now() + 60000, day: "2026-10-31" });
  assert.equal(r2.results.find((r) => r.id === zid).status, "rejected"); assert.equal((await L.getItem(zid)).code.trim(), NEWZ.trim());
  assert.equal((await (await call("POST", "", { action: "autoupdate", id: zid, on: false })).json()).item.autoUpdate, false);
  assert.equal(U.pickCandidates(await L.listItems(), 9).length, 0);
});
await t("library card: pending flag + the update text in the list, 'update now' action streams one JSON line", async () => {
  L._resetMemory();
  const N = await import("../../brain-app/api/_brain/lib-upgrade-notes.js");
  const a = await L.saveItem({ code: CODE }); await L.markUpgradeChecked(a.id, "", "");
  const b = await L.saveItem({ code: CODE.replace("20", "40") });
  const l = await (await call("GET")).json();
  assert.equal(l.upgrade.rev, N.LATEST_UPGRADE); assert.match(l.upgrade.ar, /مناطق الدخول/);
  assert.deepEqual(l.items.find((x) => x.id === a.id).pending, N.UPGRADES.map((u) => u.rev)); assert.equal(l.items.find((x) => x.id === b.id).pending, undefined);
  const up = await (await call("POST", "", { action: "upgrade", id: b.id })).json();
  assert.equal(up.result.status, "up_to_date");
  process.env.ANTHROPIC_API_KEY = "test-key";
  const res = await call("POST", "", { action: "upgrade", id: a.id });
  const txt = await res.text(); const j = JSON.parse(txt.trim().split("\n").pop());
  assert.equal(j.ok, true); assert.equal(j.result.status, "not_concerned", "no zones = no model call, marked checked"); assert.equal(j.item.upgradeRev, N.LATEST_UPGRADE);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await (await call("GET")).json()).items.every((x) => !x.pending), true);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
