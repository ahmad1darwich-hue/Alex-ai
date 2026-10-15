// Indicator bot memory: earlier requests stay in the prompt, owner preferences are kept (owner key only),
// conversations are saved by /api/chats.   node nexus-engine/tests/memory.test.mjs
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "k"; process.env.BRAIN_KEY = "owner-key-0123456789abcdefghij";
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
const GOOD = '//@version=6\nindicator("T", overlay = true)\nlenInput = input.int(20, "Length", minval = 1)\nshowInput = input.bool(true, "Show")\nplot(showInput ? ta.ema(close, lenInput) : na, "EMA")\n';
const kv = new Map(); const seen = [];
const reply = `<nexus><title>T</title><file>t.pine</file><base>NEW</base><code>\n${GOOD}</code><explain>ok</explain><remember>Ahmad trades gold on 5m</remember></nexus>`;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) {
    seen.push(JSON.parse(init.body)); const enc = new TextEncoder();
    const ev = (o) => "data: " + JSON.stringify(o) + "\n\n";
    return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(ev({ type: "content_block_delta", delta: { type: "text_delta", text: reply } }) + ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }))); c.close(); } }), { status: 200 });
  }
  if (u.startsWith("https://kv.test")) {
    const cmds = JSON.parse(init.body);
    return new Response(JSON.stringify(cmds.map(([op, k, a, b]) => {
      if (op === "GET") return { result: kv.has(k) ? kv.get(k) : null };
      if (op === "SET") { kv.set(k, a); return { result: "OK" }; }
      if (op === "INCR") { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return { result: n }; }
      return { result: 1 };
    })));
  }
  throw new Error("unexpected " + u);
};
const { handle } = await import("../../brain-app/api/_nexus/handler.js");
const post = async (body, owner) => { const r = await handle(new Request("https://b.test/api/indicator", { method: "POST", headers: { "content-type": "application/json", ...(owner ? { "x-brain-key": process.env.BRAIN_KEY } : {}) }, body: JSON.stringify(body) })); return r.text(); };
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
const history = [{ role: "user", content: "ابنيلي مؤشر EMA 20 مع تنبيه" }, { role: "assistant", content: "تم" }, { role: "user", content: "خلي الجدول تحت يسار" }, { role: "assistant", content: "تم" }, { role: "user", content: "زيد RSI" }];
await t("earlier requests are listed in the prompt", async () => {
  seen.length = 0; await post({ v: 2, mode: "build", lang: "ar", messages: history }, false);
  const txt = seen[0].messages.at(-1).content.at(-1).text;
  assert.match(txt, /EVERYTHING THE USER ASKED EARLIER/); assert.match(txt, /EMA 20 مع تنبيه/); assert.match(txt, /تحت يسار/);
});
await t("public visitors: no preference is stored or shown", async () => {
  const out = await post({ v: 2, mode: "build", lang: "en", messages: [{ role: "user", content: "ema" }] }, false);
  assert.ok(!kv.has("brain:ind:prefs")); assert.ok(!/remember/.test(out));
  const r = await handle(new Request("https://b.test/api/indicator", { method: "POST", body: JSON.stringify({ v: 2, mode: "prefs" }) })); assert.equal(r.status, 403);
});
await t("owner: the preference is stored and fed into the next request", async () => {
  await post({ v: 2, mode: "build", lang: "en", messages: [{ role: "user", content: "ema" }] }, true);
  assert.deepEqual(JSON.parse(kv.get("brain:ind:prefs")), ["Ahmad trades gold on 5m"]);
  seen.length = 0; await post({ v: 2, mode: "build", lang: "en", messages: [{ role: "user", content: "rsi" }] }, true);
  assert.match(seen[0].messages.at(-1).content.at(-1).text, /LASTING PREFERENCES[\s\S]*gold on 5m/);
  const p = JSON.parse(await post({ v: 2, mode: "prefs", remove: 0 }, true)); assert.deepEqual(p.prefs, []);
});
await t("the design director is part of the system prompt", async () => {
  assert.match(seen[0].system[0].text, /DESIGN DIRECTOR/); assert.match(seen[0].system[0].text, /Theme/);
});
delete process.env.KV_REST_API_URL;
const { default: chats } = await import("../../brain-app/api/chats.js");
const cc = (method, q, body, key = process.env.BRAIN_KEY) => chats(new Request("https://b.test/api/chats" + (q || ""), { method, headers: { "x-brain-key": key }, body: body ? JSON.stringify(body) : undefined })).then((r) => r.json().then((j) => ({ status: r.status, j })));
await t("conversations are saved, listed and reopened", async () => {
  assert.equal((await cc("GET", "", null, "bad")).status, 401);
  const data = { v: 2, msgs: [{ r: "u", text: "EMA cross" }], seq: 0, chatId: "abc123xyz" };
  assert.equal((await cc("POST", "", { action: "save", id: "abc123xyz", title: "EMA cross", data })).j.ok, true);
  const l = (await cc("GET")).j; assert.equal(l.chats.length, 1); assert.equal(l.chats[0].title, "EMA cross");
  assert.deepEqual((await cc("GET", "?id=abc123xyz")).j.chat.data, data);
  assert.equal((await cc("POST", "", { action: "delete", id: "abc123xyz" })).j.ok, true);
  assert.equal((await cc("GET")).j.chats.length, 0);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
