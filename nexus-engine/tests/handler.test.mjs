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
// Each test talks from its own address so the in-memory request allowance (used when no store is configured) does
// not carry over between tests.
let testIp = "203.0.113.1";
const post = (b, headers = {}) => handler(new Request("https://x.test/api/indicator", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": testIp, ...headers }, body: JSON.stringify(b) }));
const ndjson = async (res) => (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
let n = 0;
const t = async (name, fn) => { try { script = []; seen.length = 0; testIp = "203.0.113." + (n + 1); await fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", e.stack.split("\n").slice(0, 5).join("\n  ")); process.exitCode = 1; } };

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
await t("operator problems (key, credit, model) are not retried and reach visitors as a neutral message with a code", async () => {
  script = [{ status: 401, type: "authentication_error", message: "invalid x-api-key" }];
  let ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "trend indicator" }] }));
  let msg = ev.find((e) => e.t === "error").message;
  assert.match(msg, /paused.*code K2/); assert.doesNotMatch(msg, /key|anthropic|vercel/i); assert.equal(seen.length, 1);
  script = [{ status: 400, type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." }];
  ev = await ndjson(await post({ v: 2, messages: [{ role: "user", content: "بدي مؤشر اتجاه" }] }));
  msg = ev.find((e) => e.t === "error").message;
  assert.match(msg, /متوقفة مؤقتاً \(رمز C1\)/); assert.doesNotMatch(msg, /credit|anthropic|رصيد/i);
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

// ---------- cases from the pre-launch review ----------
await t("the report line says plainly when a script is not verified", async () => {
  const broken = `<nexus><base>NEW</base><code>\n${GOOD.replace("lenInput)", "lenInput +")}</code><explain>e</explain></nexus>`;
  script = [{ text: broken }, { text: "<nexus><base>NONE</base><explain>-</explain></nexus>" }, { text: "<nexus><base>NONE</base><explain>-</explain></nexus>" }];
  const fin = (await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "ema indicator" }] }))).find((e) => e.t === "final");
  assert.equal(fin.report.verified, false); assert.match(fin.line, /Not verified: \d+ error/); assert.ok(fin.report.errorCount >= 1);
});
await t("oversized bodies are refused before any work", async () => {
  const res = await post({ v: 2, mode: "lint", code: "x".repeat(4600000) });
  assert.equal(res.status, 413); assert.equal(seen.length, 0);
});
await t("upstream error text is not shown to users; an invalid request is not retried on other models", async () => {
  script = [{ status: 400, type: "invalid_request_error", message: "prompt is too long: 250000 tokens > 200000 maximum SECRET-DETAIL" }];
  const ev = await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "ema" }] }));
  const err = ev.find((e) => e.t === "error");
  assert.ok(err); assert.ok(!/SECRET-DETAIL|prompt is too long/.test(err.message), err.message); assert.equal(seen.length, 1);
});
await t("a model stream that ends without a stop reason is retried, then reported", async () => {
  const cut = () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n')); c.close(); } }), { status: 200 });
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return cut(); };
  try {
    const ev = await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "ema" }] }));
    assert.ok(ev.find((e) => e.t === "error")); assert.ok(!ev.find((e) => e.t === "final")); assert.ok(calls >= 2);
  } finally { globalThis.fetch = realFetch; }
});
await t("stopping the stream aborts the model call", async () => {
  const realFetch = globalThis.fetch; let upstream = null;
  globalThis.fetch = async (url, init) => { upstream = init.signal; return new Response(new ReadableStream({ start(c) { init.signal.addEventListener("abort", () => { try { c.error(Object.assign(new Error("aborted"), { name: "AbortError" })); } catch (e) {} }); } }), { status: 200 }); };
  try {
    const res = await post({ v: 2, lang: "en", messages: [{ role: "user", content: "ema" }] });
    const reader = res.body.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(upstream && upstream.aborted, "the upstream request was aborted");
  } finally { globalThis.fetch = realFetch; }
});
await t("without a store, a small in-memory allowance still limits each client", async () => {
  let refused = 0;
  for (let i = 0; i < 14; i++) {
    script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
    const ev = await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: "hi" }] }));
    if (ev[0] && ev[0].kind === "error" && /limit/i.test(ev[0].message)) refused++;
  }
  assert.equal(refused, 2);
});
await t("with a store: a refused client does not use up the shared allowance; lint has its own cap", async () => {
  process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t"; process.env.NEXUS_DAILY_PER_IP = "2"; process.env.NEXUS_DAILY_FREE_PER_IP = "3";
  const store = new Map(); const kvCalls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://kv.test")) {
      const cmds = JSON.parse(init.body); kvCalls.push(cmds);
      return new Response(JSON.stringify(cmds.map(([op, k, v]) => { if (op === "INCR") { store.set(k, (store.get(k) || 0) + 1); return { result: store.get(k) }; } if (op === "DECR") { store.set(k, (store.get(k) || 0) - 1); return { result: store.get(k) }; } if (op === "HINCRBY") return { result: 1 }; return { result: 1 }; })), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    const { handle } = await import("../../brain-app/api/_nexus/handler.js?store");
    const call = (b, ip) => handle(new Request("https://x.test/api/nexus", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(b) }));
    let served = 0, refused = 0;
    for (let i = 0; i < 5; i++) {
      script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
      const ev = await ndjson(await call({ v: 2, lang: "en", messages: [{ role: "user", content: "hi" }] }, "198.51.100.7"));
      if (ev.find((e) => e.t === "final")) served++; else refused++;
    }
    assert.equal(served, 2); assert.equal(refused, 3);
    const all = [...store.entries()].find(([k]) => /:all$/.test(k));
    assert.equal(all[1], 2, "refused requests are not counted against everyone");
    // IPv6 addresses of one /64 share a key.
    script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }, { text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }, { text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
    const v6 = [];
    for (const ip of ["2001:db8:1:2:aaaa::1", "2001:db8:1:2:bbbb::2", "2001:db8:1:2::3"]) v6.push((await ndjson(await call({ v: 2, lang: "en", messages: [{ role: "user", content: "hi" }] }, ip))).some((e) => e.t === "final"));
    assert.deepEqual(v6, [true, true, false]);
    let lintRefused = 0;
    for (let i = 0; i < 5; i++) { const r = await call({ v: 2, mode: "lint", code: GOOD }, "198.51.100.9"); if (r.status === 429) lintRefused++; }
    assert.equal(lintRefused, 2);
  } finally { globalThis.fetch = realFetch; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; delete process.env.NEXUS_DAILY_PER_IP; delete process.env.NEXUS_DAILY_FREE_PER_IP; }
});
await t("an allow-list of sites is enforced for browser calls", async () => {
  process.env.NEXUS_ALLOWED_ORIGINS = "https://nexus.example";
  try {
    const { handle } = await import("../../brain-app/api/_nexus/handler.js?origins");
    const call = (origin) => handle(new Request("https://x.test/api/nexus", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.20", ...(origin ? { origin } : {}) }, body: JSON.stringify({ v: 2, mode: "template", templateId: "trend" }) }));
    const evil = await call("https://evil.example");
    assert.equal(evil.status, 403); assert.equal(evil.headers.get("access-control-allow-origin"), "https://nexus.example");
    const mine = await call("https://nexus.example");
    assert.equal(mine.status, 200); assert.equal(mine.headers.get("access-control-allow-origin"), "https://nexus.example");
    assert.equal((await call("")).status, 200);
    // The operator's tools may call from any site: the preflight is answered and the admin request is readable there.
    const pre = await handle(new Request("https://x.test/api/nexus", { method: "OPTIONS", headers: { origin: "https://tools.example", "access-control-request-method": "POST" } }));
    assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "https://tools.example");
    const op = await handle(new Request("https://x.test/api/nexus", { method: "POST", headers: { "content-type": "application/json", origin: "https://tools.example" }, body: JSON.stringify({ v: 2, mode: "template", templateId: "trend", admin: ADMIN }) }));
    assert.equal(op.status, 200); assert.equal(op.headers.get("access-control-allow-origin"), "https://tools.example");
    const fake = await handle(new Request("https://x.test/api/nexus", { method: "POST", headers: { "content-type": "application/json", origin: "https://tools.example" }, body: JSON.stringify({ v: 2, mode: "template", templateId: "trend", admin: "not-the-admin-token-0123456" }) }));
    assert.equal(fake.status, 403); assert.equal(fake.headers.get("access-control-allow-origin"), "https://nexus.example");
  } finally { delete process.env.NEXUS_ALLOWED_ORIGINS; }
});
await t("an English request after a pasted script is kept as the request", async () => {
  script = [{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }];
  await ndjson(await post({ v: 2, lang: "en", messages: [{ role: "user", content: GOOD + "\nplease add an alert when price crosses the average" }] }));
  const sent = seen[0].messages.at(-1).content.at(-1).text;
  assert.match(sent, /USER REQUEST:\nplease add an alert when price crosses the average/);
  assert.ok(!/```pine[\s\S]*please add an alert[\s\S]*```/.test(sent), "the sentence is not inside the script block");
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
