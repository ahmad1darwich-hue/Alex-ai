// Main Brain assistant (brain-app/api/agent.js): modes, tools, thinking, fallbacks.   node nexus-engine/tests/agent.test.mjs
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "k"; process.env.BRAIN_KEY = "owner-key-0123456789abcdefghij"; delete process.env.BRAIN_MODEL;
const bodies = []; let failFirst = "";
const sse = (text) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode("data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } }) + "\n\n")); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) {
    const b = JSON.parse(init.body); bodies.push(b);
    if (failFirst && bodies.length === 1) return new Response(failFirst, { status: 400 });
    return sse("ok");
  }
  if (u.startsWith("http://usws.com.au")) return new Response("", { status: 308, headers: { location: "https://usws.com.au/" } });
  if (u.startsWith("https://usws.com.au")) return new Response("<html></html>", { status: 200, headers: { "x-content-type-options": "nosniff", server: "Vercel" } });
  return new Response("{}", { status: 200 });
};
const { default: agent } = await import("../../brain-app/api/agent.js");
const post = (body) => agent(new Request("https://b.test/api/agent", { method: "POST", headers: { "x-brain-key": process.env.BRAIN_KEY, "content-type": "application/json" }, body: JSON.stringify(body) }));
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
await t("locked without the key", async () => {
  const r = await agent(new Request("https://b.test/api/agent", { method: "POST", body: "{}" })); assert.equal(r.status, 401);
});
await t("normal chat: new model, adaptive thinking, search + fetch tools", async () => {
  bodies.length = 0; const r = await post({ messages: [{ role: "user", content: "hello" }] }); assert.equal(await r.text(), "ok");
  const b = bodies[0]; assert.equal(b.model, "claude-sonnet-5-5"); assert.equal(b.thinking.type, "adaptive");
  assert.deepEqual(b.tools.map((x) => x.name), ["web_search", "web_fetch"]); assert.ok(!/MODE:/.test(b.system));
});
await t("deep research mode: many searches, high effort, its instructions", async () => {
  bodies.length = 0; await (await post({ mode: "deep", messages: [{ role: "user", content: "best turf types for Sydney shade" }] })).text();
  const b = bodies[0]; assert.match(b.system, /DEEP RESEARCH/); assert.equal(b.tools[0].max_uses, 25); assert.equal(b.output_config.effort, "high");
});
await t("plan mode is inferred from the words; file mode from an attachment", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "حلّل هالمخطط واحسب المساحة" }] })).text();
  assert.match(bodies[0].system, /PLANS, MAPS/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: [{ type: "text", text: "محتوى الملف \"a.csv\":\n1,2" }, { type: "text", text: "شو فيه" }] }] })).text();
  assert.match(bodies[0].system, /FILE INSPECTION/);
});
await t("security mode runs one passive check of the site", async () => {
  bodies.length = 0; await (await post({ mode: "security", messages: [{ role: "user", content: "check usws.com.au" }] })).text();
  const s = bodies[0].system; assert.match(s, /SECURITY CHECK/); assert.match(s, /redirects to HTTPS: good/); assert.match(s, /strict-transport-security: MISSING/); assert.match(s, /server: Vercel/);
});
await t("falls back to fewer tools when web_fetch is refused", async () => {
  bodies.length = 0; failFirst = JSON.stringify({ error: { message: "web_fetch is not supported" } });
  assert.equal(await (await post({ messages: [{ role: "user", content: "hi" }] })).text(), "ok");
  assert.equal(bodies[1].tools.length, 1); failFirst = "";
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
