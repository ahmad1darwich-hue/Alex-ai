// Brain voice endpoint (brain-app/api/voice.js) and voice turns in agent.js.   node nexus-engine/tests/voice.test.mjs
import assert from "node:assert/strict";
process.env.BRAIN_KEY = "owner-key-0123456789abcdefghij"; process.env.GROQ_API_KEY = "g"; process.env.ANTHROPIC_API_KEY = "k";
const calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url); calls.push({ u, init });
  if (u.endsWith("/audio/transcriptions")) return new Response(JSON.stringify({ text: "شو سعر الذهب هلّق" }), { status: 200 });
  if (u.endsWith("/audio/speech")) return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
  if (u.includes("api.anthropic.com")) { calls[calls.length - 1].body = JSON.parse(init.body); return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n')); c.close(); } }), { status: 200 }); }
  return new Response("{}", { status: 200 });
};
const { default: voice, speakable } = await import("../../brain-app/api/voice.js");
const { default: agent } = await import("../../brain-app/api/agent.js");
const H = { "x-brain-key": process.env.BRAIN_KEY };
let n = 0; const t = async (name, fn) => { try { calls.length = 0; await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
await t("locked without the owner key", async () => {
  assert.equal((await voice(new Request("https://b.test/api/voice", { method: "POST", body: "x" }))).status, 401);
  assert.equal(calls.length, 0);
});
await t("status says both halves are on", async () => {
  const d = await (await voice(new Request("https://b.test/api/voice", { headers: H }))).json(); assert.deepEqual([d.stt, d.tts], [true, true]);
});
await t("audio -> text with Whisper turbo, the right file type and a vocabulary prompt", async () => {
  const r = await voice(new Request("https://b.test/api/voice", { method: "POST", headers: { ...H, "content-type": "audio/mp4" }, body: new Uint8Array(20000) }));
  assert.equal((await r.json()).text, "شو سعر الذهب هلّق");
  const fd = calls[0].init.body; assert.equal(fd.get("model"), "whisper-large-v3-turbo"); assert.equal(fd.get("file").name, "voice.m4a"); assert.match(fd.get("prompt"), /XAUUSD/);
});
await t("text -> Arabic voice, cleaned of links and markdown", async () => {
  const r = await voice(new Request("https://b.test/api/voice", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ tts: "**الذهب** طالع 🟢 https://x.test/a" }) }));
  assert.equal(r.headers.get("content-type"), "audio/wav");
  const b = JSON.parse(calls[0].init.body); assert.equal(b.model, "canopylabs/orpheus-arabic-saudi"); assert.equal(b.input, "الذهب طالع");
});
await t("speakable drops code, sources and the written-details part", async () => {
  assert.equal(speakable("جواب قصير\n———\n- تفاصيل طويلة"), "جواب قصير");
  assert.equal(speakable("hi\n```js\nx()\n```\n\n🔗 المصادر:\n• A — https://a.t"), "hi");
});
await t("a voice turn asks the model for a short spoken answer", async () => {
  await (await agent(new Request("https://b.test/api/agent", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ voice: true, messages: [{ role: "user", content: "شو سعر الذهب" }] }) }))).text();
  assert.match(calls.find((c) => c.body).body.system, /VOICE CONVERSATION/);
  calls.length = 0;
  await (await agent(new Request("https://b.test/api/agent", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }))).text();
  assert.doesNotMatch(calls.find((c) => c.body).body.system, /VOICE CONVERSATION/);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
