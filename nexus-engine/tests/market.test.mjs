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
await t("gold kill zones in Sydney time are added before the disclaimer (DST-aware)", async () => {
  const { killZoneLine, addKillZones, DISCLAIMER } = await import("../../brain-app/api/_brain/market.js");
  const oct = Date.UTC(2026, 9, 14, 12), jul = Date.UTC(2026, 6, 14, 12);
  assert.match(killZoneLine(oct), /لندن 17:00–20:00 · نيويورك 22:00–01:00/);
  assert.match(killZoneLine(jul), /لندن 16:00–19:00 · نيويورك 21:00–00:00/);
  const out = addKillZones("report\n\n" + DISCLAIMER, oct);
  assert.ok(out.endsWith(DISCLAIMER)); assert.ok(out.indexOf("⏰") < out.indexOf(DISCLAIMER));
  assert.equal(addKillZones(out, oct), out);
  const r = await call("?report=1&key=" + process.env.DAILY_KEY); assert.match(r.body.report.text, /⏰/);
});
await t("price levels from daily candles feed the prompt (support / resistance from data)", async () => {
  const { levelsFromDaily, priceLevels } = await import("../../brain-app/api/_brain/market.js");
  const cs = []; for (let i = 0; i < 20; i++) cs.push({ t: Date.UTC(2026, 9, 1 + i, 21), o: 2400 + i, h: 2410 + i, l: 2390 + i, c: 2405 + i });
  const L = levelsFromDaily(cs);
  assert.equal(L.close, 2424); assert.equal(L.prevHigh, 2428); assert.equal(L.prevLow, 2408); assert.equal(L.wkHigh, 2429); assert.equal(L.wkLow, 2405); assert.equal(L.adr, 20);
  assert.equal(levelsFromDaily(cs.slice(0, 5)), null, "too few candles");
  const txt = await priceLevels(["XAUUSD (Gold)", "NOPE (x)"], async (sym) => { if (sym !== "XAUUSD") throw new Error("down"); return { candles: cs, source: "yahoo" }; });
  assert.match(txt, /^PRICE DATA/); assert.match(txt, /XAUUSD: last daily candle .* close 2424\.0/); assert.match(txt, /previous day high 2428\.0 \/ low 2408\.0/); assert.doesNotMatch(txt, /NOPE/);
  assert.equal(await priceLevels(["NOPE"], async () => { throw new Error("down"); }), "", "no data = no block");
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
