// The daily self-check (brain-app/api/daily.js) and its benchmark.   node nexus-engine/tests/daily.test.mjs
// (the model API, Telegram and the KV store are mocked; no network, no keys needed)
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.NEXUS_MODEL = "claude-sonnet-5-5";
process.env.CRON_SECRET = "cron-secret-0123456789abcdef";
process.env.DAILY_KEY = "daily-key-0123456789abcdef";
process.env.TELEGRAM_BOT_TOKEN = "123:abc";
process.env.TELEGRAM_CHAT_ID = "42";
process.env.KV_REST_API_URL = "https://kv.test";
process.env.KV_REST_API_TOKEN = "kv-token";
delete process.env.BRAIN_KEY;

const GOOD = '//@version=6\nindicator("Bench RSI", shorttitle = "B RSI", overlay = true)\nlenInput = input.int(14, "RSI length", minval = 1)\nemaInput = input.int(200, "EMA length", minval = 1)\nr = ta.rsi(close, lenInput)\ne = ta.ema(close, emaInput)\nbool up = ta.crossover(r, 30) and close > e\nbool dn = ta.crossunder(r, 70) and close < e\nplotshape(up, "Buy", shape.triangleup, location.belowbar, color.teal, size = size.small)\nplotshape(dn, "Sell", shape.triangledown, location.abovebar, color.red, size = size.small)\nalertcondition(up, "Buy", "Buy {{ticker}} {{interval}}")\nalertcondition(dn, "Sell", "Sell {{ticker}} {{interval}}")\n';
const reply = `<nexus><title>Bench RSI</title><file>bench_rsi.pine</file><base>NEW</base><code>\n${GOOD}</code><explain>ok</explain></nexus>`;

const sse = (text) => {
  const enc = new TextEncoder(); const chunks = [];
  chunks.push("data: " + JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10 } } }) + "\n\n");
  chunks.push("data: " + JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }) + "\n\n");
  chunks.push("data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 50 } }) + "\n\n");
  return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } }), { status: 200 });
};
const kv = new Map(); const calls = { model: 0, telegram: [], kv: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) { calls.model++; return sse(reply); }
  if (u.includes("api.telegram.org")) { calls.telegram.push(JSON.parse(init.body)); return new Response("{\"ok\":true}", { status: 200 }); }
  if (u.startsWith("https://kv.test")) {
    const cmds = JSON.parse(init.body); calls.kv.push(cmds);
    return new Response(JSON.stringify(cmds.map((c) => {
      const [op, k, v] = c;
      if (op === "SET") { kv.set(k, v); return { result: "OK" }; }
      if (op === "GET") return { result: kv.has(k) ? kv.get(k) : null };
      if (op === "INCR") { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return { result: n }; }
      if (op === "HGETALL") return { result: [] };
      if (op === "LRANGE") return { result: k === "nx:tverrors" ? [JSON.stringify({ at: new Date().toISOString(), error: "Undeclared identifier 'foo'", request: "ema cross" })] : [] };
      return { result: 1 };
    })), { status: 200 });
  }
  throw new Error("unexpected fetch " + u);
};

const { BENCH, casesFor, judge } = await import("../../brain-app/api/_nexus/bench.js");
const { default: daily, sydneyDay } = await import("../../brain-app/api/daily.js");
const get = (q, headers = {}) => daily(new Request("https://b.test/api/daily" + q, { headers }));

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", String(e.stack).split("\n").slice(0, 5).join("\n  ")); process.exitCode = 1; } };

await t("the benchmark pool is balanced and rotates", () => {
  assert.ok(BENCH.length >= 10);
  assert.ok(BENCH.every((c) => c.id && c.text && Array.isArray(c.expect) && c.expect.length && (c.lang === "ar" || c.lang === "en")));
  assert.equal(new Set(BENCH.map((c) => c.id)).size, BENCH.length);
  const a = casesFor(0).map((c) => c.id), b = casesFor(1).map((c) => c.id);
  assert.equal(a.length, 3); assert.notDeepEqual(a, b);
  const seen = new Set(); for (let i = 0; i < 8; i++) casesFor(i).forEach((c) => seen.add(c.id));
  assert.equal(seen.size, BENCH.length, "every case runs within a week");
});
await t("judge: verified plus the expected building blocks", () => {
  const c = BENCH.find((x) => x.id === "rsi_ema_alert");
  const ok = judge(c, { kind: "script", code: GOOD, report: { verified: true } });
  assert.equal(ok.pass, true); assert.deepEqual(ok.expectFailed, []); assert.ok(ok.inputs >= 2);
  const bad = judge(c, { kind: "script", code: GOOD.replace(/alertcondition/g, "alert"), report: { verified: true } });
  assert.equal(bad.pass, false); assert.ok(bad.expectFailed.some((x) => /alertcondition/.test(x)));
  const unverified = judge(c, { kind: "script", code: GOOD, report: { verified: false } });
  assert.equal(unverified.pass, false); assert.equal(unverified.verified, false);
  const pane = judge(BENCH.find((x) => x.id === "macd_divergence"), { kind: "script", code: GOOD, report: { verified: true } });
  assert.ok(pane.expectFailed.includes("overlay = false"));
});
await t("sydneyDay is a date", () => {
  assert.match(sydneyDay(Date.UTC(2026, 9, 14, 17, 30)), /^2026-10-15$/);
  assert.match(sydneyDay(Date.UTC(2026, 5, 1, 12, 0)), /^2026-06-01$/);
});
await t("without a key only the info is public", async () => {
  const info = await (await get("")).json();
  assert.equal(info.ok, true); assert.ok(info.engineRev > 0); assert.equal(info.bench, BENCH.length);
  assert.equal((await get("?report=1")).status, 401);
  assert.equal((await get("?run=1&key=wrong-key-wrong-key-wrong")).status, 401);
  assert.equal(calls.model, 0);
});
await t("a cron call runs the benchmark, stores the report, logs it and sends Telegram", async () => {
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(" "));
  let res, text;
  try { res = await get("", { authorization: "Bearer " + process.env.CRON_SECRET }); text = await res.text(); } finally { console.log = orig; }
  assert.equal(res.status, 200);
  const r = JSON.parse(text.trim().split("\n").pop());
  assert.equal(r.ok, true); assert.equal(r.trigger, "cron"); assert.equal(r.bench.total, 3); assert.equal(calls.model, 3);
  assert.ok(r.bench.cases.every((c) => c.verified === true), JSON.stringify(r.bench.cases));
  // Which cases run depends on the day (rotation), so only the bookkeeping is checked here; judge() is tested above.
  assert.equal(r.bench.passed, r.bench.cases.filter((c) => c.pass).length);
  assert.equal(r.samples.tvErrors.length, 1); assert.match(r.samples.tvErrors[0].error, /Undeclared/);
  assert.ok(kv.has("nx:daily:latest") && kv.has("nx:daily:" + r.day));
  assert.ok(logs.some((l) => l.startsWith("DAILY_REPORT {")));
  assert.equal(calls.telegram.length, 1); assert.match(calls.telegram[0].text, /تقرير Brain اليومي/); assert.equal(calls.telegram[0].chat_id, "42");
  assert.equal(r.telegram, true);
});
await t("the stored report is readable with the daily key, and on-demand runs are capped", async () => {
  const r = await (await get("?report=1&key=" + process.env.DAILY_KEY)).json();
  assert.equal(r.ok, true); assert.equal(r.bench.total, 3);
  const before = calls.model;
  const run = await get("?run=1&key=" + process.env.DAILY_KEY);
  assert.equal(run.status, 200); await run.text();
  assert.equal(calls.model, before + 3);
  kv.set("nx:daily:runs:" + new Date().toISOString().slice(0, 10), "3");
  assert.equal((await get("?run=1&key=" + process.env.DAILY_KEY)).status, 429);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
