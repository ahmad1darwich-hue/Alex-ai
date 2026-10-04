// Run: node nexus-engine/tests/handler.test.mjs   (the Anthropic API is mocked; no network, no key needed)
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.NEXUS_MODEL = "claude-sonnet-5-5";
process.env.NEXUS_FALLBACK_MODELS = "claude-sonnet-4-5";
process.env.NEXUS_ADMIN_TOKEN = "test-admin-token-0123456789";
const ADMIN = process.env.NEXUS_ADMIN_TOKEN;
delete process.env.KV_REST_API_URL;

const GOOD = '//@version=6\nindicator("Test EMA", shorttitle = "T EMA", overlay = true)\nlenInput = input.int(20, "Length", minval = 1)\nema = ta.ema(close, lenInput)\nplot(ema, "EMA", color = color.teal)\n';
const sse = (text, stop = "end_turn") => {
  const enc = new TextEncoder(); const chunks = [];
  chunks.push('event: message_start\ndata: ' + JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 12, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 } } }) + "\n\n");
  chunks.push('event: content_block_delta\ndata: ' + JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }) + "\n\n");
  for (let i = 0; i < text.length; i += 23) chunks.push('event: content_block_delta\ndata: ' + JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(i, i + 23) } }) + "\n\n");
  chunks.push('event: message_delta\ndata: ' + JSON.stringify({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 321 } }) + "\n\n");
  return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
};
let script = []; const seen = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body); seen.push(body);
  const next = script.shift();
  if (!next) throw new Error("unexpected model call");
  if (next.status) return new Response(JSON.stringify({ type: "error", error: { type: next.type, message: next.message } }), { status: next.status });
  return sse(next.text, next.stop);
};
// api/nexus.js and api/indicator.js are entry points for the same handler.
const { default: handler } = await import("../../brain-app/api/nexus.js");
const post = (b) => handler(new Request("https://x.test/api/indicator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));
const ndjson = async (res) => (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
let n = 0;
const t = async (name, fn) => { try { script = []; seen.length = 0; await fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", e.stack.split("\n").slice(0, 5).join("\n  ")); process.exitCode = 1; } };

await t("GET reports engine 2 and the template list", async () => {
  const j = await (await handler(new Request("https://x.test/api/indicator"))).json();
  assert.equal(j.engine, 2); assert.equal(j.hasKey, true); assert.ok(j.templates.length >= 9); assert.ok(j.templates[0].title.ar);
});
await t("template mode returns a verified script without calling the model", async () => {
  const j = await (await post({ v: 2, mode: "template", templateId: "smc", lang: "ar" })).json();
  assert.equal(j.kind, "script"); assert.equal(j.report.verified, true); assert.match(j.code, /^\/\/@version=6/); assert.match(j.explain, /BOS/); assert.equal(seen.length, 0);
});
await t("lint mode checks pasted code", async () => {
  const j = await (await post({ v: 2, mode: "lint", code: GOOD.replace("lenInput)", "lenInput") })).json();
  assert.equal(j.kind, "lint"); assert.equal(j.report.ok, false); assert.match(j.report.errors[0].message, /parenthesis/);
});
await t("v2 build streams stages, code and a verified final", async () => {
  script = [{ text: `<nexus>\n<title>Test EMA</title>\n<file>test_ema.pine</file>\n<base>NEW</base>\n<code>\n${GOOD}</code>\n<explain>\nشرح قصير\n</explain>\n</nexus>` }];
  const res = await post({ v: 2, mode: "build", messages: [{ role: "user", content: "بدي مؤشر EMA" }] });
  assert.match(res.headers.get("content-type"), /ndjson/);
  const ev = await ndjson(res);
  const fin = ev.find((e) => e.t === "final");
  assert.ok(fin, "final event"); assert.equal(fin.kind, "script"); assert.equal(fin.code, GOOD); assert.equal(fin.report.verified, true); assert.equal(fin.file, "test_ema.pine"); assert.match(fin.line, /0 أخطاء/);
  assert.equal(ev.filter((e) => e.t === "code").map((e) => e.d).join("").trim(), GOOD.trim());
  assert.equal(seen[0].model, "claude-sonnet-5-5"); assert.deepEqual(seen[0].thinking, { type: "adaptive" }); assert.equal(seen[0].output_config.effort, "medium"); assert.equal(seen[0].system[0].cache_control.type, "ephemeral");
  assert.match(seen[0].messages.at(-1).content.at(-1).text, /Levantine Arabic/);
});
await t("v2 build repairs a broken script before delivering it", async () => {
  script = [{ text: `<nexus><base>NEW</base><code>\n${GOOD.replace("lenInput)", "lenInput")}</code><explain>e</explain></nexus>` }, { text: "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nema = ta.ema(close, lenInput\n=======\nema = ta.ema(close, lenInput)\n>>>>>>> END\n</edits><explain></explain></nexus>" }];
  const ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "ema indicator" }] }));
  const fin = ev.find((e) => e.t === "final");
  assert.equal(fin.report.verified, true); assert.equal(fin.report.rounds, 1); assert.ok(ev.some((e) => e.t === "stage" && e.id === "fix")); assert.match(fin.line, /0 errors/);
});
await t("unknown model falls back to the next one", async () => {
  script = [{ status: 404, type: "not_found_error", message: "model: claude-sonnet-5-5" }, { text: "<nexus><base>TEMPLATE:trend</base><edits></edits><explain>ok</explain></nexus>" }];
  const ev = await ndjson(await post({ v: 2, debug: true, admin: ADMIN, messages: [{ role: "user", content: "trend indicator" }] }));
  const fin = ev.find((e) => e.t === "final");
  assert.equal(fin.kind, "script"); assert.equal(fin.model, "claude-sonnet-4-5"); assert.ok(fin.usage.calls >= 1); assert.equal(seen[1].thinking, undefined); assert.equal(seen[1].output_config, undefined);
});
await t("a 400 on the adaptive shape retries the same model without thinking fields", async () => {
  script = [{ status: 400, type: "invalid_request_error", message: "output_config: unexpected field" }, { text: "<nexus><base>NONE</base><explain>hello</explain></nexus>" }];
  const ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "hi" }] }));
  assert.equal(ev.find((e) => e.t === "final").kind, "text"); assert.equal(seen[1].model, "claude-sonnet-5-5"); assert.equal(seen[1].thinking, undefined);
});
await t("auth failure gives a clear message and is not retried", async () => {
  script = [{ status: 401, type: "authentication_error", message: "invalid x-api-key" }];
  const ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "trend indicator" }] }));
  assert.match(ev.find((e) => e.t === "error").message, /key/i); assert.equal(seen.length, 1);
});
await t("legacy clients get a fenced script with a FILE line and the check result", async () => {
  script = [{ text: `<nexus><title>T</title><file>t.pine</file><base>NEW</base><code>\n${GOOD}</code><explain>explanation</explain></nexus>` }];
  const res = await post({ messages: [{ role: "user", content: "ema indicator" }] });
  assert.match(res.headers.get("content-type"), /text\/plain/);
  const txt = await res.text();
  assert.match(txt, /```pine\n\/\/ FILE: t\.pine\n\/\/@version=6/); assert.match(txt, /explanation/); assert.match(txt, /0 errors/);
});
await t("legacy follow-up edits the script found in the previous assistant message", async () => {
  script = [{ text: '<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, "EMA", color = color.teal)\n=======\nplot(ema, "EMA", color = color.red)\n>>>>>>> END\n</edits><explain>red now</explain></nexus>' }];
  const txt = await (await post({ messages: [{ role: "user", content: "ema" }, { role: "assistant", content: "```pine\n// FILE: t.pine\n" + GOOD + "```\nok" }, { role: "user", content: "make it red" }] })).text();
  assert.match(txt, /color = color\.red/); assert.match(seen[0].messages.at(-1).content.at(-1).text, /CURRENT SCRIPT/); assert.ok(!JSON.stringify(seen[0].messages.slice(0, -1)).includes("indicator("), "old code blocks are stripped from history");
});
await t("empty request is rejected without a model call", async () => {
  const j = await (await post({ v: 2, messages: [] })).json();
  assert.equal(j.kind, "error"); assert.equal(seen.length, 0);
});
await t("the page language decides the answer language when the request has no Arabic", async () => {
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  await ndjson(await post({ v: 2, lang: "ar", messages: [{ role: "user", content: "RSI divergence with alerts" }] }));
  assert.match(seen[0].messages.at(-1).content.at(-1).text, /Levantine Arabic/);
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "بدي مؤشر RSI" }] }));
  assert.match(seen[1].messages.at(-1).content.at(-1).text, /Levantine Arabic/);
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "RSI divergence" }] }));
  assert.match(seen[2].messages.at(-1).content.at(-1).text, /in English/);
});
await t("a script pasted inside the message becomes the current script and its findings are listed", async () => {
  const broken = GOOD.replace("lenInput)", "lenInput");
  script = [{ text: "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nema = ta.ema(close, lenInput\n=======\nema = ta.ema(close, lenInput)\n>>>>>>> END\n</edits><explain>fixed</explain></nexus>" }];
  const ev = await ndjson(await post({ v: 2, lang: "ar", messages: [{ role: "user", content: "صلّحلي هالكود:\n" + broken + "\nوشكراً" }] }));
  const fin = ev.find((e) => e.t === "final");
  assert.equal(fin.kind, "script"); assert.equal(fin.base, "edit"); assert.equal(fin.report.verified, true); assert.equal(fin.code, GOOD);
  const sent = seen[0].messages.at(-1).content.at(-1).text;
  assert.match(sent, /CURRENT SCRIPT/); assert.match(sent, /AUTOMATIC CHECKER FINDINGS/); assert.match(sent, /USER REQUEST:\nصلّحلي هالكود:\nوشكراً/);
});
await t("thinking is announced once as a stage", async () => {
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  const ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "hello" }] }));
  assert.equal(ev.filter((e) => e.t === "stage" && e.id === "think").length, 1);
});
await t("internal details stay on the server and an edit keeps the file name", async () => {
  script = [{ text: '<nexus><title>Other</title><file>other_name.pine</file><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, "EMA", color = color.teal)\n=======\nplot(ema, "EMA", color = color.red)\n>>>>>>> END\n</edits><explain>red</explain></nexus>' }];
  const ev = await ndjson(await post({ v: 2, lang: "en", code: GOOD, file: "my_ema.pine", messages: [{ role: "user", content: "make it red" }] }));
  const fin = ev.find((e) => e.t === "final");
  assert.equal(fin.file, "my_ema.pine"); assert.equal(fin.model, undefined); assert.equal(fin.usage, undefined); assert.equal(fin.report.history, undefined); assert.equal(fin.report.verified, true);
  const g = await (await handler(new Request("https://x.test/api/indicator"))).json();
  assert.equal(g.model, undefined);
});
await t("debug output, model override and stats need the operator token", async () => {
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  let ev = await ndjson(await post({ v: 2, debug: true, model: "claude-opus-5-5", admin: "wrong-token-000000000000000", messages: [{ role: "user", content: "hi" }] }));
  assert.equal(ev.find((e) => e.t === "final").usage, undefined); assert.equal(seen[0].model, "claude-sonnet-5-5");
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  ev = await ndjson(await post({ v: 2, debug: true, model: "claude-opus-5-5", effort: "high", admin: ADMIN, messages: [{ role: "user", content: "hi" }] }));
  assert.equal(ev.find((e) => e.t === "final").model, "claude-opus-5-5"); assert.equal(seen[1].model, "claude-opus-5-5"); assert.equal(seen[1].output_config.effort, "high");
  const denied = await post({ v: 2, mode: "stats" });
  assert.equal(denied.status, 403);
  const st = await (await post({ v: 2, mode: "stats", admin: ADMIN })).json();
  assert.equal(st.ok, false, "no KV configured in tests");
});
await t("fix mode sends the TradingView error and uses the given script", async () => {
  script = [{ text: '<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, "EMA", color = color.teal)\n=======\nplot(ema, "EMA", color = color.red)\n>>>>>>> END\n</edits><explain>fixed</explain></nexus>' }];
  const ev = await ndjson(await post({ v: 2, mode: "fix", lang: "ar", code: GOOD, tvError: "Error at 5:1 Something odd", messages: [{ role: "user", content: "صلّح الخطأ" }] }));
  const fin = ev.find((e) => e.t === "final");
  assert.equal(fin.kind, "script"); assert.match(fin.code, /color\.red/);
  const sent = seen[0].messages.at(-1).content.at(-1).text;
  assert.match(sent, /TRADINGVIEW REPORTED/); assert.match(sent, /Error at 5:1 Something odd/); assert.match(sent, /TASK: fix the CURRENT SCRIPT/);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
