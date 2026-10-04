// Brain's private endpoints: the owner key, and the WhatsApp webhooks.   node nexus-engine/tests/brain-lock.test.mjs
// (the model API and Meta are mocked; no network, no keys needed)
import assert from "node:assert/strict";
import crypto from "node:crypto";

const KEY = "test-owner-key-0123456789abcdefXYZ";
process.env.BRAIN_KEY = KEY;
process.env.ANTHROPIC_API_KEY = "test-key";
for (const k of ["WA_TOKEN", "WA_PHONE_ID", "WA_BIZ_TOKEN", "WA_BIZ_PHONE_ID", "WA_APP_SECRET", "WA_ALLOWED", "WA_OWNER"]) delete process.env[k];

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
  if (String(url).includes("api.anthropic.com")) {
    const b = JSON.parse(init.body);
    if (b.stream) {
      const enc = new TextEncoder();
      const data = 'data: ' + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "hello owner" } }) + "\n\n";
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(data)); c.close(); } }), { status: 200 });
    }
    return new Response(JSON.stringify({ content: [{ type: "text", text: "bot reply" }] }), { status: 200 });
  }
  return new Response("{}", { status: 200 });
};

let passed = 0;
const t = async (name, fn) => { try { calls.length = 0; await fn(); passed++; } catch (e) { console.error("FAIL", name, "\n ", String(e.stack).split("\n").slice(0, 5).join("\n  ")); process.exitCode = 1; } };

const { brainAuth, metaSignatureOk } = await import("../../brain-app/api/_brain/lock.js");
const { default: agent } = await import("../../brain-app/api/agent.js");
const { default: whatsapp } = await import("../../brain-app/api/whatsapp.js");
const { default: waCustomer } = await import("../../brain-app/api/wa-customer.js");

await t("the key check: only the exact key passes", async () => {
  assert.equal(brainAuth(KEY), "ok");
  for (const bad of ["", null, undefined, 42, KEY.slice(0, -1), KEY + "x", KEY.toUpperCase(), "x".repeat(KEY.length), KEY + KEY]) assert.equal(brainAuth(bad), "denied", String(bad));
});
await t("without a configured key everything is closed", async () => {
  for (const v of ["", "short"]) { process.env.BRAIN_KEY = v; assert.equal(brainAuth(v), "unset"); assert.equal(brainAuth(""), "unset"); }
  delete process.env.BRAIN_KEY; assert.equal(brainAuth(undefined), "unset");
  const res = await agent(new Request("https://b.test/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
  assert.equal(res.status, 503); assert.equal((await res.json()).locked, true); assert.equal(calls.length, 0);
  process.env.BRAIN_KEY = KEY;
});
await t("assistant: no key or a wrong key gets 401 and no model call", async () => {
  for (const headers of [{}, { "x-brain-key": "wrong-key-wrong-key-wrong-key-00" }]) {
    const res = await agent(new Request("https://b.test/api/agent", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ messages: [{ role: "user", content: "summarise my business" }] }) }));
    assert.equal(res.status, 401);
    const j = await res.json();
    assert.equal(j.locked, true); assert.match(j.reply, /not activated/);
  }
  assert.equal(calls.length, 0);
});
await t("assistant: the status call tells strangers nothing", async () => {
  const j = await (await agent(new Request("https://b.test/api/agent"))).json();
  assert.deepEqual(j, { ok: true, auth: "denied" });
  const mine = await (await agent(new Request("https://b.test/api/agent", { headers: { "x-brain-key": KEY } }))).json();
  assert.equal(mine.auth, "ok"); assert.equal(mine.hasKey, true);
});
await t("assistant: the owner's key is answered", async () => {
  const res = await agent(new Request("https://b.test/api/agent", { method: "POST", headers: { "content-type": "application/json", "x-brain-key": KEY }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
  assert.equal(res.status, 200); assert.equal(await res.text(), "hello owner"); assert.equal(calls.length, 1);
});

// The inbox endpoint needs the imapflow package (installed on Vercel); the check runs when it is available here.
let email = null;
try { ({ default: email } = await import("../../brain-app/api/email.js")); } catch (e) { console.log("skip  inbox endpoint (imapflow is not installed here)"); }
if (email) {
  const run = async (method, headers) => { const out = { headers: {} }; const res = { setHeader(k, v) { out.headers[k] = v; }, set statusCode(v) { out.status = v; }, get statusCode() { return out.status; }, end(b) { out.body = b; } }; await email({ method, headers }, res); return out; };
  await t("inbox: closed without the owner's key, before any mailbox or model access", async () => {
    process.env.GMAIL_USER = "someone@example.com"; process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    for (const headers of [{}, { "x-brain-key": "nope" }]) {
      const out = await run("POST", headers);
      assert.equal(out.status, 401); assert.equal(JSON.parse(out.body).locked, true);
    }
    const st = await run("GET", {});
    assert.deepEqual(JSON.parse(st.body), { ok: true, auth: "denied" });
    assert.equal(calls.length, 0);
    delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD;
    const mine = await run("POST", { "x-brain-key": KEY });
    assert.equal(mine.status, 200); assert.match(JSON.parse(mine.body).reply, /مش مربوط/);
  });
}

const waEvent = (text, from = "61400000000") => JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body: text } }] } }] }] });
const sign = (raw, secret) => "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
const waPost = (handler, raw, headers = {}) => handler(new Request("https://b.test/api/whatsapp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }));

await t("WhatsApp bots that are not configured never call the model", async () => {
  for (const h of [whatsapp, waCustomer]) { const j = await (await waPost(h, waEvent("write me an essay"))).json(); assert.equal(j.off, true); }
  assert.equal(calls.length, 0);
});
await t("signature check: Meta's HMAC is verified", async () => {
  const raw = waEvent("hello");
  assert.equal(await metaSignatureOk(raw, sign(raw, "app-secret"), "app-secret"), true);
  assert.equal(await metaSignatureOk(raw, sign(raw, "other-secret"), "app-secret"), false);
  assert.equal(await metaSignatureOk(raw + " ", sign(raw, "app-secret"), "app-secret"), false);
  assert.equal(await metaSignatureOk(raw, "", "app-secret"), false);
  assert.equal(await metaSignatureOk(raw, "sha256=zz", "app-secret"), false);
  assert.equal(await metaSignatureOk(raw, sign(raw, ""), ""), false); // no secret configured: nothing passes
});
await t("configured bot with an app secret: unsigned calls are ignored, signed calls are answered", async () => {
  process.env.WA_TOKEN = "wa-token"; process.env.WA_PHONE_ID = "12345"; process.env.WA_APP_SECRET = "app-secret";
  const raw = waEvent("hello brain");
  let j = await (await waPost(whatsapp, raw)).json();
  assert.equal(j.ignored, "signature"); assert.equal(calls.length, 0);
  j = await (await waPost(whatsapp, raw, { "x-hub-signature-256": sign(raw, "wrong") })).json();
  assert.equal(j.ignored, "signature"); assert.equal(calls.length, 0);
  j = await (await waPost(whatsapp, raw, { "x-hub-signature-256": sign(raw, "app-secret") })).json();
  assert.equal(j.ok, true); assert.equal(calls.length, 2);
  assert.match(calls[0].url, /anthropic/); assert.match(calls[1].url, /graph\.facebook\.com\/v[\d.]+\/12345\/messages/); assert.equal(calls[1].body.to, "61400000000"); assert.equal(calls[1].body.text.body, "bot reply");
  delete process.env.WA_APP_SECRET;
  calls.length = 0;
  j = await (await waPost(whatsapp, raw)).json(); // credentials without the app secret: the bot stays off
  assert.equal(j.off, true); assert.equal(calls.length, 0);
  delete process.env.WA_TOKEN; delete process.env.WA_PHONE_ID;
  process.env.BRAIN_KEY = KEY + "\n"; assert.equal(brainAuth(KEY), "ok"); // a stray newline in the setting is tolerated
  process.env.BRAIN_KEY = "has+bad/chars=has+bad/chars="; assert.equal(brainAuth("has+bad/chars=has+bad/chars="), "unset");
  process.env.BRAIN_KEY = KEY;
});
await t("customer bot: same rules, and the owner is notified", async () => {
  process.env.WA_BIZ_TOKEN = "biz-token"; process.env.WA_BIZ_PHONE_ID = "777"; process.env.WA_APP_SECRET = "app-secret"; process.env.WA_OWNER = "61434449997";
  const raw = waEvent("I need a retaining wall in Ryde");
  let j = await (await waPost(waCustomer, raw)).json();
  assert.equal(j.ignored, "signature"); assert.equal(calls.length, 0);
  j = await (await waPost(waCustomer, raw, { "x-hub-signature-256": sign(raw, "app-secret") })).json();
  assert.equal(j.ok, true); assert.equal(calls.length, 3); assert.equal(calls[2].body.to, "61434449997");
  for (const k of ["WA_BIZ_TOKEN", "WA_BIZ_PHONE_ID", "WA_APP_SECRET", "WA_OWNER"]) delete process.env[k];
});

if (!process.exitCode) console.log("ok - " + passed + " checks passed");
