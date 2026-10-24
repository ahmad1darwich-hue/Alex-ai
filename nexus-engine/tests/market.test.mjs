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
  assert.match(txt, /^PRICE DATA/); assert.match(txt, /XAUUSD: last daily candle .* close 2424\.0/); assert.match(txt, /previous day high 2428\.0 \/ low 2408\.0/); assert.match(txt, /data trend up \(close \+0\.5 ADR from the 20-day average 2414\.5\); position in the 5-day range 79%/);
  assert.equal(L.trend, "up"); assert.equal(L.sma20, 2414.5);
  const dn = cs.map((x, i) => ({ ...x, c: 2500 - i * 3, h: 2505 - i * 3, l: 2490 - i * 3 })).concat(cs.slice(0, 6).map((x, i) => ({ ...x, c: 2440 - i * 3, h: 2445 - i * 3, l: 2430 - i * 3 })));
  assert.equal(levelsFromDaily(dn).trend, "down", "falling closes = down trend"); assert.doesNotMatch(txt, /NOPE/);
  assert.equal(await priceLevels(["NOPE"], async () => { throw new Error("down"); }), "", "no data = no block");
});
await t("weekly trend + daily/weekly alignment from the same daily candles", async () => {
  const { weeklyTrend, alignment, priceLevels } = await import("../../brain-app/api/_brain/market.js");
  const up = []; for (let i = 0; i < 120; i++) { const d = new Date(Date.UTC(2026, 5, 1 + i, 21)); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; const c = 2000 + i * 4; up.push({ t: d.getTime(), o: c - 2, h: c + 5, l: c - 5, c }); }
  const W = weeklyTrend(up); assert.equal(W.wtrend, "up"); assert.ok(W.wsma10 < up.at(-1).c);
  assert.equal(weeklyTrend(up.slice(-30)), null, "under 13 weeks = no weekly trend");
  assert.equal(weeklyTrend(up.map((x, i) => ({ ...x, c: 3000 - i * 4, h: 3005 - i * 4, l: 2995 - i * 4 }))).wtrend, "down");
  assert.equal(alignment("up", "up"), "aligned up"); assert.equal(alignment("down", "up"), "mixed"); assert.equal(alignment("range", "range"), "mixed"); assert.equal(alignment("up", undefined), "");
  const txt = await priceLevels(["XAUUSD (Gold)"], async () => ({ candles: up, source: "yahoo" }));
  const wk = weeklyTrend(up), wkC = weeklyTrend(up, true);
  assert.ok(wk.pwHigh > wk.pwLow && wkC.pwHigh > wk.pwHigh, "previous completed week: the week before the current one, or the last week on a weekend");
  assert.match(txt, /previous week high [\d.]+ \/ low [\d.]+; weekly trend up/);
  assert.match(txt, /weekly trend up \(10-week average [\d.]+\); daily \+ weekly aligned up \[yahoo\]/);
});
await t("dollar driver (DXY) from daily closes: tone for gold, empty without data", async () => {
  const { dollarDriver } = await import("../../brain-app/api/_brain/market.js");
  const up = await dollarDriver(async () => [100, 100.2, 100.1, 100.3, 100.4, 100.0, 100.5]);
  assert.match(up, /^DOLLAR DRIVER: DXY 100\.50 \(\+0\.50% on the day, \+0\.30% over 5 days\) - stronger dollar today = headwind for gold/);
  assert.match(await dollarDriver(async () => [99, 99, 99, 99, 99, 99.1, 99.05]), /dollar flat today/);
  assert.equal(await dollarDriver(async () => [1, 2]), "");
  assert.equal(await dollarDriver(async () => { throw new Error("down"); }), "");
});

await t("weekend: closed-market mornings become a week-ahead outlook with the Sydney reopen time", async () => {
  const { marketStatus, weekendNote } = await import("../../brain-app/api/_brain/market.js");
  assert.equal(marketStatus(Date.parse("2026-10-21T20:00:00Z")).open, true, "Thursday morning Sydney: open");
  assert.equal(marketStatus(Date.parse("2026-10-23T20:00:00Z")).open, true, "Saturday 07:00 Sydney = Friday 16:00 NY: still open");
  const sun = marketStatus(Date.parse("2026-10-24T20:00:00Z"));
  assert.equal(sun.open, false); assert.equal(sun.reopen, "الاثنين 09:00", "reopens Sunday 18:00 NY = Monday 09:00 Sydney (AEDT)");
  const mon = marketStatus(Date.parse("2026-10-25T20:00:00Z"));
  assert.equal(mon.open, false, "Monday 07:00 Sydney = Sunday 16:00 NY: closed");
  assert.equal(marketStatus(Date.parse("2026-07-19T20:00:00Z")).reopen, "الاثنين 08:00", "July: AEST + EDT");
  assert.match(weekendNote(Date.parse("2026-10-24T20:00:00Z")), /CLOSED[\s\S]*🔒 السوق مسكّر — بيفتح الاثنين 09:00/);
  assert.equal(weekendNote(Date.parse("2026-10-21T20:00:00Z")), "");
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
