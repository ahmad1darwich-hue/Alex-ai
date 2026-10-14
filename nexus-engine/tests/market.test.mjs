// Daily market report (brain-app/api/market.js).   node nexus-engine/tests/market.test.mjs  (model, KV, Telegram mocked)
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "k"; process.env.CRON_SECRET = "cron-secret-0123456789abcdef"; process.env.DAILY_KEY = "daily-key-0123456789abcdef";
process.env.TELEGRAM_BOT_TOKEN = "1:a"; process.env.TELEGRAM_CHAT_ID = "42"; process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
delete process.env.WA_TOKEN; delete process.env.BRAIN_KEY;
const kv = new Map(), sent = []; let modelCalls = 0, lastBody = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) { modelCalls++; lastBody = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: "web_search_tool_result", content: [{ url: "https://news.test/a", title: "Gold rises" }] }, { type: "text", text: "📊 تقرير الأسواق\n🟢 XAUUSD · ثقة متوسطة\nتحليل تعليمي مش نصيحة مالية. قرار الصفقة إلك." }] }), { status: 200 }); }
  if (u.includes("api.telegram.org")) { sent.push(JSON.parse(init.body)); return new Response("{\"ok\":true}"); }
  if (u.startsWith("https://kv.test")) { const cmds = JSON.parse(init.body); return new Response(JSON.stringify(cmds.map(([op, k, v]) => (op === "SET" ? (kv.set(k, v), { result: "OK" }) : { result: kv.get(k) ?? null })))); }
  throw new Error("unexpected " + u);
};
const { default: market } = await import("../../brain-app/api/market.js");
function call(q, headers = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b) }); } };
    market({ method: "GET", url: "/api/market" + q, query: Object.fromEntries(new URLSearchParams(q.replace(/^\?/, ""))), headers }, res);
  });
}
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
await t("public info only without a key", async () => {
  const r = await call(""); assert.equal(r.body.ok, true); assert.ok(r.body.markets.length >= 4); assert.equal(modelCalls, 0);
  assert.equal((await call("?run=1&key=wrong-wrong-wrong-wrong")).status, 401);
});
await t("cron builds with web search, stores and sends to Telegram with sources", async () => {
  const r = await call("", { authorization: "Bearer " + process.env.CRON_SECRET });
  assert.equal(r.status, 200); assert.equal(r.body.sent.telegram, "sent"); assert.equal(r.body.sent.whatsapp, "not configured");
  assert.equal(lastBody.tools[0].type, "web_search_20250305");
  assert.ok(kv.has("brain:market:latest"));
  assert.match(sent[0].text, /تقرير الأسواق/); assert.match(sent[0].text, /news\.test/);
});
await t("stored report readable with the daily key", async () => {
  const r = await call("?report=1&key=" + process.env.DAILY_KEY); assert.equal(r.body.ok, true); assert.match(r.body.report.text, /XAUUSD/);
});
await t("calendar clock: Sydney offsets with daylight saving; report guards", async () => {
  const { tzOffset, sessionClock, finishText, DISCLAIMER } = await import("../../brain-app/api/_brain/market.js");
  const oct = Date.UTC(2026, 9, 14, 12), jul = Date.UTC(2026, 6, 14, 12);
  assert.equal(tzOffset("Australia/Sydney", oct), 11); assert.equal(tzOffset("Australia/Sydney", jul), 10);
  assert.equal(tzOffset("America/New_York", oct), -4);
  assert.match(sessionClock(oct), /08:30 New York = 23:30/); assert.match(sessionClock(jul), /08:30 New York = 22:30/);
  assert.match(lastBody.messages[0].content, /Conversions to Sydney time/);
  assert.match(finishText("report", []), /مش مأكد/); assert.ok(finishText("report", [{ url: "u" }]).endsWith(DISCLAIMER));
  assert.equal(finishText("x\n" + DISCLAIMER, [{ url: "u" }]).split(DISCLAIMER).length, 2);
});
await t("short report on gold, oil and the US indices only, with the news effect on gold", async () => {
  const { MARKETS } = await import("../../brain-app/api/_brain/market.js");
  assert.deepEqual(MARKETS.map((m) => m.split(" ")[0]), ["XAUUSD", "USOIL", "US100", "US30"]);
  const p = lastBody.messages[0].content;
  assert.match(p, /عالذهب/); assert.match(p, /under 1200 characters/); assert.doesNotMatch(p, /EURUSD|BTCUSD/);
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
