// Chart preview: our Pine runner (brain-app/api/_nexus/preview-run.js), the candles module and /api/preview.
//   node nexus-engine/tests/preview.test.mjs   (no network: candle sources are mocked)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPreview } from "../../brain-app/api/_nexus/preview-run.js";
import { aggregate, sampleCandles } from "../../brain-app/api/_brain/candles.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
const GOLD = { tickerid: "OANDA:XAUUSD", ticker: "XAUUSD", mintick: 0.01, type: "cfd", timezone: "America/New_York", currency: "USD" };
const candles = sampleCandles(900, 700, 2400);

await t("every verified template runs and draws something", () => {
  for (const f of fs.readdirSync(path.join(here, "..", "templates")).filter((x) => x.endsWith(".pine"))) {
    const r = runPreview(fs.readFileSync(path.join(here, "..", "templates", f), "utf8"), candles, { tfSec: 900, symbol: GOLD });
    assert.ok(r.ok, f + ": " + r.error);
    const drawn = r.plots.length + r.shapes.length + r.labels.length + r.lines.length + r.boxes.length + r.tables.length + r.trades.length;
    assert.ok(drawn > 0, f + " drew nothing");
    assert.deepEqual(r.unsupported, [], f + " unsupported: " + r.unsupported.join(", "));
    assert.ok(r.ms < 2500, f + " too slow: " + r.ms + " ms");
  }
});

await t("series maths match hand-computed values (sma, ema, history, var in functions)", () => {
  const cs = []; for (let i = 0; i < 40; i++) { const c = 100 + i + (i % 3) * 2; cs.push({ t: Date.UTC(2026, 0, 1) + i * 3600e3, o: c - 1, h: c + 2, l: c - 2, c, v: 10 }); }
  const code = `//@version=6
indicator("t")
f(x) =>
    var int k = 0
    k += 1
    x * 2 + k
plot(ta.sma(close, 5))
plot(ta.ema(close, 5))
plot(close[1])
plot(f(close))
plot(ta.rsi(close, 14))`;
  const r = runPreview(code, cs, { tfSec: 3600 });
  assert.ok(r.ok, r.error);
  const C = cs.map((x) => x.c), sma = (k) => C.slice(k - 4, k + 1).reduce((a, b) => a + b, 0) / 5;
  let ema = sma(4); for (let k = 5; k <= 10; k++) ema = (2 / 6) * C[k] + (4 / 6) * ema;
  assert.equal(r.plots[0].values[10], sma(10));
  assert.ok(Math.abs(r.plots[1].values[10] - ema) < 1e-9);
  assert.equal(r.plots[2].values[4], C[3]);
  assert.equal(r.plots[3].values[4], C[4] * 2 + 5);
  assert.equal(r.plots[4].values[10], null);
  const rsi = r.plots[4].values[39]; assert.ok(rsi > 0 && rsi < 100);
});

await t("drawings respect max counts and deletes; tables keep their cells", () => {
  const code = `//@version=6
indicator("d", overlay = true, max_labels_count = 5)
label.new(bar_index, high, "x")
var line ln = line.new(na, na, na, na)
if barstate.islast
    ln.set_xy1(bar_index - 10, low)
    ln.set_xy2(bar_index, high)
b = box.new(bar_index, high, bar_index + 1, low)
box.delete(b)
var table tb = table.new(position.top_right, 2, 1)
if barstate.islast
    tb.cell(0, 0, "A")
    table.cell(tb, 1, 0, str.tostring(close, format.mintick))`;
  const r = runPreview(code, candles.slice(0, 100), { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error);
  assert.equal(r.labels.length, 5); assert.equal(r.lines.length, 1); assert.equal(r.boxes.length, 0);
  assert.equal(r.tables[0].cells["0:0"].text, "A"); assert.match(r.tables[0].cells["1:0"].text, /^\d+\.\d{2}$/);
});

await t("request.security: previous day high from the daily chart, without lookahead into today", () => {
  const code = `//@version=6
indicator("pdh", overlay = true)
pdh = request.security(syminfo.tickerid, "1D", high[1], lookahead = barmerge.lookahead_on)
plot(pdh)`;
  const cs = sampleCandles(3600, 24 * 6, 2400); // 6 days of 1h candles
  const r = runPreview(code, cs, { tfSec: 3600, symbol: { ...GOLD, timezone: "Etc/UTC" } });
  assert.ok(r.ok, r.error);
  const day = (ms) => Math.floor(ms / 86400000);
  const last = cs.length - 1, d = day(cs[last].t);
  const prevHigh = Math.max(...cs.filter((c) => day(c.t) === d - 1).map((c) => c.h));
  assert.equal(r.plots[0].values[last], prevHigh);
});

await t("time() sessions follow the IANA time zone (New York 09:30 open)", () => {
  const code = `//@version=6
indicator("s", overlay = true)
inNy = not na(time(timeframe.period, "0930-1600", "America/New_York"))
plot(inNy ? 1 : 0)`;
  const cs = []; const t0 = Date.UTC(2026, 9, 14, 13, 0); // 13:00 UTC = 09:00 New York (EDT)
  for (let i = 0; i < 12; i++) cs.push({ t: t0 + i * 900e3, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 });
  const r = runPreview(code, cs, { tfSec: 900 });
  assert.deepEqual(r.plots[0].values.slice(0, 4), [0, 0, 1, 1]);
});

await t("strategy simulator fills entries and stop / target exits", () => {
  const code = `//@version=6
strategy("st", overlay = true)
if bar_index % 20 == 0
    strategy.entry("L", strategy.long)
strategy.exit("x", "L", stop = close - 5, limit = close + 5)`;
  const r = runPreview(code, candles.slice(0, 300), { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error); assert.ok(r.trades.some((x) => x.kind === "entry")); assert.ok(r.stats.closed >= 1);
});

await t("design kit: gradient cloud visible both ways, capped zones with mid line + price tag, alternating pills, gauge", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "design_kit.pine"), "utf8");
  const r = runPreview(code, sampleCandles(900, 800, 2400), { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
  const cloud = r.fills[0].colors.filter(Boolean);
  assert.ok(cloud.length > 100 && cloud.every((c) => !/,0\)$/.test(c)), "the cloud is drawn in both directions");
  assert.ok(r.boxes.length >= 1 && r.boxes.length <= 8, "zones capped per side");
  assert.equal(r.lines.length, r.boxes.length, "one dashed mid line per zone");
  const pills = r.labels.filter((l) => /^(▲ BUY|▼ SELL)$/.test(l.text));
  for (let i = 1; i < pills.length; i++) assert.notEqual(pills[i].text, pills[i - 1].text, "pills alternate");
  assert.ok(pills.every((p) => /Strength \d+%/.test(p.tooltip)), "details live in the tooltip");
  assert.match(r.tables[0].cells["1:2"].text, /^[■□]{10}$/, "text gauge");
});

await t("broken or unknown code is reported, never crashes", () => {
  const r1 = runPreview(`//@version=6\nindicator("x")\nplot(close +)`, candles.slice(0, 50), { tfSec: 900 });
  assert.equal(r1.ok, false); assert.match(r1.error, /syntax|parse/);
  const r2 = runPreview(`//@version=6\nindicator("x")\nplot(ta.someMadeUpThing(close))`, candles.slice(0, 50), { tfSec: 900 });
  assert.ok(r2.ok); assert.ok(r2.unsupported.includes("ta.someMadeUpThing"));
  const r3 = runPreview(`//@version=6\nindicator("x")\na = array.new_float(0)\nplot(a.get(3))`, candles.slice(0, 50), { tfSec: 900 });
  assert.equal(r3.ok, false); assert.match(r3.error, /out of bounds/);
  const r4 = runPreview(`//@version=6\nindicator("x")\nvar float s = 0\nwhile true\n    s += 1\nplot(s)`, candles.slice(0, 50), { tfSec: 900 });
  assert.equal(r4.ok, false);
});

await t("candles: 4h aggregation from 1h", () => {
  const h = []; for (let i = 0; i < 8; i++) h.push({ t: Date.UTC(2026, 0, 1, i), o: i, h: i + 1, l: i - 1, c: i + 0.5, v: 1 });
  const a = aggregate(h, 14400);
  assert.equal(a.length, 2); assert.deepEqual([a[0].o, a[0].h, a[0].l, a[0].c, a[0].v], [0, 4, -1, 3.5, 4]);
});

await t("/api/preview: live source first, sample candles when every source fails", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (String(url).includes("yahoo")) {
      const ts = Array.from({ length: 120 }, (_, k) => 1760000000 + k * 900);
      return new Response(JSON.stringify({ chart: { result: [{ timestamp: ts, indicators: { quote: [{ open: ts.map(() => 2400), high: ts.map(() => 2402), low: ts.map(() => 2398), close: ts.map(() => 2401), volume: ts.map(() => 5) }] } }] } }), { status: 200 });
    }
    return new Response("blocked", { status: 451 });
  };
  try {
    const { default: preview } = await import("../../brain-app/api/preview.js");
    const post = (b) => preview(new Request("https://b.test/api/preview", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify(b) }));
    const code = fs.readFileSync(path.join(here, "..", "templates", "trend.pine"), "utf8");
    const j = await (await post({ code, symbol: "XAUUSD", tf: "15" })).json();
    assert.equal(j.ok, true); assert.equal(j.source, "yahoo"); assert.equal(j.candles.length, 120); assert.equal(j.result.ok, true);
    const k = await (await post({ code, symbol: "BTCUSD", tf: "5" })).json();
    assert.equal(k.ok, true); assert.ok(k.source === "yahoo" || k.sample);
    globalThis.fetch = async () => new Response("down", { status: 500 });
    const s = await (await post({ code, symbol: "ETHUSD", tf: "60" })).json();
    assert.equal(s.sample, true); assert.ok(s.candles.length > 100);
    assert.equal((await post({ symbol: "XAUUSD" })).status, 400);
  } finally { globalThis.fetch = real; }
});

await t("force_overlay drawings of a pane script are flagged for the price chart (RSI divergence template)", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "rsi_divergence.pine"), "utf8");
  const r = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error);
  assert.equal(r.overlay, false);
  const onPrice = r.labels.filter((l) => l.fo);
  assert.ok(onPrice.length > 0, "divergences should also be marked on the price chart");
  assert.ok(onPrice.every((l) => /DIV/.test(l.text)));
  assert.ok(r.labels.some((l) => !l.fo), "pane markers stay in the pane");
  assert.ok(r.lines.some((l) => l.fo) && r.lines.some((l) => !l.fo));
  const cells = r.tables[0].cells;
  assert.match(cells["1:4"].text, /^\d+ \/ \d+ of \d+$/, "track record row");
});

await t("trend template: graded alternating signals, one trade plan, regime + whipsaw dashboard", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "trend.pine"), "utf8");
  const r = runPreview(code, sampleCandles(900, 1000, 2400), { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error);
  const sigs = r.labels.filter((l) => /^(▲ BUY|▼ SELL) • [AB]$/.test(l.text));
  assert.ok(sigs.length > 0, "signals are drawn");
  for (let i = 1; i < sigs.length; i++) assert.notEqual(sigs[i].text.slice(0, 1), sigs[i - 1].text.slice(0, 1), "signals alternate");
  assert.equal(r.labels.filter((l) => /^SL /.test(l.text)).length, 1, "only the last signal keeps a trade plan");
  assert.equal(r.boxes.length, 2, "risk and reward boxes of the last plan");
  const cells = r.tables[0].cells;
  assert.match(cells["1:2"].text, /^(Noisy|Stable) \d\.\d\d$/, "regime row");
  assert.match(cells["1:3"].text, /^(Stacked ▲|Stacked ▼|Knot) [\d.]+ ATR$/, "ribbon row");
  assert.match(cells["1:7"].text, /^\d+$/, "whipsaws blocked row");
});

await t("sr template: scored zones to the right edge, one retest per flip, nearest S/R dashboard", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "sr.pine"), "utf8");
  const cs = sampleCandles(900, 900, 2400);
  const r = runPreview(code, cs, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error);
  assert.ok(r.boxes.length > 0 && r.boxes.length <= 8, "live zones stay under the cap (Present mode): " + r.boxes.length);
  for (const b of r.boxes) {
    assert.match(b.text, /^[SR]( flip)?( • HTF)? • x\d+ • \d+$/, "zone text: " + b.text);
    assert.ok(b.top > b.bottom, "zone has height");
    assert.equal(b.right, cs.length - 1 + 20, "live zones run to the right edge");
  }
  const flips = r.boxes.filter((b) => / flip/.test(b.text));
  assert.ok(flips.every((b) => /dash/.test(String(b.bs))) && r.boxes.filter((b) => !/ flip/.test(b.text)).every((b) => /solid/.test(String(b.bs))), "flipped zones are dashed");
  assert.ok(r.labels.every((l) => /^(▲|▼) RETEST$/.test(l.text)), "only retest signals are labelled");
  const cells = r.tables[0].cells;
  assert.match(cells["1:1"].text, /^(-|[\d.]+ • [\d.]+ ATR)$/, "nearest resistance row");
  assert.match(cells["1:3"].text, /^\d+ S \/ \d+ R$/, "live zones row");
  assert.match(cells["1:6"].text, /^\d+ \/ \d+( • \d+%)?$/, "retest track record row");
});

await t("smc template: capped scored zones to the right edge, life cycle kinds, bias + track record dashboard", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "smc.pine"), "utf8");
  const cs = sampleCandles(900, 900, 2400);
  const r = runPreview(code, cs, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
  const zones = r.boxes.filter((b) => !/^(Premium|Discount)$/.test(b.text));
  assert.ok(zones.length > 0, "zones are drawn");
  for (const b of zones) {
    assert.match(b.text, /^(OB|BRK|FVG|IFVG|HTF FVG)( • x\d+)? • \d+$/, "zone text: " + b.text);
    assert.equal(b.right, cs.length - 1 + 15, "live zones run to the right edge");
    if (/^(BRK|IFVG|HTF FVG)/.test(b.text) || / • x\d+/.test(b.text)) assert.match(String(b.bs), /dash/, "flipped / tested / HTF zones are dashed: " + b.text);
  }
  assert.ok(zones.filter((b) => /^(OB|BRK)/.test(b.text)).length <= 8, "order blocks capped (4 per side)");
  assert.ok(zones.filter((b) => /^(FVG|IFVG)/.test(b.text)).length <= 8, "chart-TF gaps capped (4 per side)");
  const labels = new Set(r.labels.map((l) => l.text));
  assert.ok([...labels].every((x) => /^(BOS|CHoCH|EQH|EQL|✕ Sweep|Strong High|Weak High|Strong Low|Weak Low)$/.test(x)), "only designed structure labels: " + [...labels].join(","));
  const cells = r.tables[0].cells;
  assert.match(cells["1:1"].text, /^(Bullish ▲|Bearish ▼|-)$/, "swing bias row");
  assert.match(cells["1:3"].text, /^(Bullish ▲|Bearish ▼|-|off)$/, "HTF bias row");
  assert.match(cells["1:4"].text, /^(-|(Premium|Discount) \d+%)$/, "premium / discount row");
  assert.match(cells["1:7"].text, /^\d+ OB \/ \d+ FVG$/, "live zones row");
  assert.match(cells["1:8"].text, /^\d+ \/ \d+( • \d+%)?$/, "order block track record row");
});

await t("signals template: graded confluence signals, one managed trade plan, R track record dashboard", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "signals.pine"), "utf8");
  for (const n of [1000, 600]) {
    const r = runPreview(code, sampleCandles(900, n, 2400), { tfSec: 900, symbol: GOLD });
    assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
    const sigs = r.labels.filter((l) => /^(▲ BUY|▼ SELL) • [AB]$/.test(l.text));
    assert.ok(sigs.length > 0, "signals are drawn");
    const other = r.labels.filter((l) => !/^(▲ BUY|▼ SELL) • [AB]$/.test(l.text));
    assert.ok(other.every((l) => /^(Entry |SL |BE |TRAIL |TP[123] [\d.]+R |◆ TP[123]$|■ BE$|■ TRAIL$|✕ SL$|• EXIT$)/.test(l.text)), "only designed plan labels: " + other.map((l) => l.text).join(","));
    assert.equal(r.labels.filter((l) => /^(SL|BE|TRAIL) \d/.test(l.text)).length, 1, "only the last signal keeps a trade plan");
    assert.equal(r.boxes.length, 2, "risk and reward boxes of the last plan");
    const cells = r.tables[0].cells;
    assert.match(cells["1:1"].text, /^(LONG • [AB]|SHORT • [AB]|FLAT)$/, "position row");
    assert.match(cells["1:2"].text, /^[0-5]\/5 (▲|▼)$/, "confluence row");
    assert.match(cells["1:6"].text, /^(-|Initial|Break-even|Trailing)$/, "stop mode row");
    assert.match(cells["1:7"].text, /^\d+( • \d+%)?$/, "trades / win row");
    assert.match(cells["1:8"].text, /^(-|[+-][\d.]+ • avg -?[\d.]+)$/, "total R row");
  }
});

await t("scalper template: chop-shielded PB / REV scalps, one managed plan, regime + kill zone + R dashboard", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "scalper.pine"), "utf8");
  let total = 0;
  for (const [tf, n] of [[60, 1500], [300, 1000], [900, 600]]) {
    const r = runPreview(code, sampleCandles(tf, n, 2400), { tfSec: tf, symbol: GOLD });
    assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
    const sigRe = /^(▲|▼) (PB|REV) • [AB]$/;
    const sigs = r.labels.filter((l) => sigRe.test(l.text));
    total += sigs.length;
    const other = r.labels.filter((l) => !sigRe.test(l.text));
    assert.ok(other.every((l) => /^(Entry |SL |BE |TP[12] [\d.]+R |◆ TP[12]$|■ BE$|■ TIME$|✕ SL$|• EXIT$)/.test(l.text)), "only designed plan labels: " + other.map((l) => l.text).join(","));
    if (sigs.length) {
      assert.equal(r.labels.filter((l) => /^(SL|BE) \d/.test(l.text)).length, 1, "only the last signal keeps a trade plan");
      assert.equal(r.boxes.length, 2, "risk and reward boxes of the last plan");
    }
    const cells = r.tables[0].cells;
    assert.equal(cells["1:0"].text, "Scalper");
    assert.match(cells["1:1"].text, /^(Trend (▲|▼)|Chop|Quiet) • \d\.\d\d$/, "regime row");
    assert.match(cells["1:2"].text, /^(Above|Below) [+-]\d+\.\d sd$/, "VWAP distance row");
    assert.match(cells["1:4"].text, /^(London ●|New York ●|Off)$/, "kill zone row");
    assert.match(cells["1:5"].text, /^(LONG (PB|REV) • [AB]|SHORT (PB|REV) • [AB]|FLAT)$/, "position row");
    assert.match(cells["1:7"].text, /^\d+( • \d+%)?$/, "trades / win row");
    assert.match(cells["1:9"].text, /^\d+$/, "shielded row");
    assert.ok(r.plots.some((p) => p.title === "VWAP"), "session VWAP drawn");
  }
  assert.ok(total > 0, "scalps are drawn on sample candles");
});

await t("mtf template: auto ladder, closed-bar matrix rows, weighted score + verdict, designed labels only", () => {
  const code = fs.readFileSync(path.join(here, "..", "templates", "mtf_dashboard.pine"), "utf8");
  const ladders = { 60: ["1m", "5m", "15m", "1H", "4H"], 900: ["15m", "1H", "4H", "1D", "1W"], 3600: ["1H", "4H", "1D", "1W", "1M"] };
  for (const [tf, n] of [[60, 1500], [900, 900], [3600, 800]]) {
    const r = runPreview(code, sampleCandles(tf, n, 2400), { tfSec: tf, symbol: GOLD });
    assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
    assert.ok(r.labels.every((l) => /^(▲|▼) ALIGNED [1-5]\/[1-5]$|^◇ fading$/.test(l.text)), "only designed labels: " + r.labels.map((l) => l.text).join(","));
    assert.ok(r.labels.filter((l) => /ALIGNED/.test(l.text)).every((l) => +l.text.split("/")[1] >= 3), "no verdict from fewer than 3 rows with data");
    const c = r.tables[0].cells;
    assert.equal(c["0:0"].text, "NEXUS • MTF");
    assert.deepEqual([2, 3, 4, 5, 6].map((k) => c["0:" + k].text), ladders[tf], "auto ladder for " + tf);
    for (const k of [2, 3, 4, 5, 6]) {
      assert.match(c["1:" + k].text, /^(▲ Up|▼ Down|● Flat|\.\.\.|below chart)$/, "trend cell");
      assert.match(c["2:" + k].text, /^(●●●|●●○|●○○|-)$/, "power cell");
      assert.match(c["4:" + k].text, /^(BOS ▲|BOS ▼|-)$/, "structure cell");
    }
    assert.match(c["0:7"].text, /^[+-]\d+%$/, "score");
    assert.match(c["1:7"].text, /^[■□]{10}$/, "gauge");
    assert.match(c["0:8"].text, /^(Aligned up|Aligned down|Up • fading|Down • fading|Mixed)$/, "verdict");
    assert.ok(r.plots.some((p) => p.title === "Fast EMA") && r.plots.some((p) => p.title === "Top-row high"), "ribbon + top-row levels drawn");
  }
});

await t("/api/preview accepts big scripts (150k characters) and refuses only past the limit", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 500 });
  try {
    const { default: preview } = await import("../../brain-app/api/preview.js");
    const post = (b) => preview(new Request("https://b.test/api/preview", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(b) }));
    const base = fs.readFileSync(path.join(here, "..", "templates", "sr.pine"), "utf8");
    const big = base + "\n" + ("// padding line to make a large pro script " + "x".repeat(60) + "\n").repeat(1400);
    assert.ok(big.length > 150000);
    const r = await post({ code: big, symbol: "XAUUSD", tf: "15" });
    assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.ok, true); assert.equal(j.result.ok, true);
    const huge = await post({ code: "x".repeat(420000), symbol: "XAUUSD", tf: "15" });
    assert.equal(huge.status, 413); assert.match((await huge.json()).message, /too large for the preview/);
  } finally { globalThis.fetch = real; }
});

await t("break / continue inside an if block stop or skip the loop (were read as unknown identifiers)", () => {
  const code = "//@version=6\nindicator(\"b\", overlay = true)\nfloat x = 0.0\nfor i = 0 to 10\n    if i > 3\n        break\n    x += 1\nint k = 0\nfor j = 0 to 5\n    if j == 2\n        continue\n    k += 1\nplot(x)\nplot(k)\n";
  const r = runPreview(code, sampleCandles(900, 30, 100), { tfSec: 900 });
  assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
  assert.equal(r.plots[0].values.at(-1), 4); assert.equal(r.plots[1].values.at(-1), 5);
});

await t("request.security_lower_tf: chart bars stand in for intrabars (arrays, tuples), noted as approximate", () => {
  const code = `//@version=6
indicator("ltf", overlay = true)
vols = request.security_lower_tf(syminfo.tickerid, "1", volume)
[hs, ls] = request.security_lower_tf(syminfo.tickerid, "1", [high, low])
plot(array.sum(vols))
plot(array.size(hs) > 0 ? array.max(hs) - array.min(ls) : na)`;
  const r = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error);
  const last = (p) => p.values.filter((x) => x !== null && !Number.isNaN(x)).at(-1);
  assert.equal(last(r.plots[0]), candles.at(-1).v);
  assert.ok(Math.abs(last(r.plots[1]) - (candles.at(-1).h - candles.at(-1).l)) < 1e-6);
  assert.ok(r.unsupported.some((u) => /security_lower_tf/.test(u)));
});

await t("timeline for the clip maker: born / moved / died per drawing, deleted ones kept inside the window", () => {
  const code = `//@version=6
indicator("tl", overlay = true, max_labels_count = 5)
var line ln = line.new(na, na, na, na)
if bar_index % 10 == 0
    label.new(bar_index, high, "x")
var box b = na
if bar_index == last_bar_index - 30
    b := box.new(bar_index, high, bar_index + 5, low)
if bar_index == last_bar_index - 10
    b.delete()
if barstate.islast
    ln.set_xy1(bar_index - 20, close)
    ln.set_xy2(bar_index, close)
plot(close)`;
  const r = runPreview(code, candles, { tfSec: 900, symbol: GOLD, timeline: true, timelineFrom: candles.length - 120 });
  assert.ok(r.ok, r.error);
  const last = candles.length - 1;
  assert.equal(r.timelineFrom, candles.length - 120);
  const bx = r.boxes.find((b) => b.born === last - 30);
  assert.ok(bx && bx.died === last - 10, "deleted box kept with its life span: " + JSON.stringify(r.boxes.map((b) => [b.born, b.died])));
  assert.ok(r.labels.some((l) => l.died != null), "labels pushed out by max_labels_count are kept with died");
  assert.ok(r.labels.filter((l) => l.died == null).length <= 5);
  const ln = r.lines[0]; assert.equal(ln.born, 0); assert.equal(ln.moved, last, "set_xy on the last bar = moved there");
  const plain = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(plain.boxes.length === 0 && plain.labels.every((l) => l.born === undefined), "without timeline the output is unchanged");
});

await t("squeeze rules reference (knowledge VOLATILITY SQUEEZE rules) is clean in the checker and previews coils + releases", async () => {
  const { checkPine } = await import("../../brain-app/api/_nexus/lint.js");
  const { SYSTEM_PROMPT } = await import("../../brain-app/api/_nexus/knowledge.js");
  assert.match(SYSTEM_PROMPT, /# VOLATILITY SQUEEZE \/ COMPRESSION RULES/);
  assert.match(SYSTEM_PROMPT, /a tuple - never assign it to one variable/);
  const code = fs.readFileSync(path.join(here, "fixtures", "squeeze_rules.pine"), "utf8");
  const c = checkPine(code); assert.ok(c.ok && c.clean, JSON.stringify(c.errors.concat(c.mustFix, c.shouldFix)));
  const r = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
  assert.ok(r.boxes.length > 0, "coil boxes drawn"); assert.equal(r.tables.length, 1); assert.ok(r.plots.length >= 2);
});

await t("anchored VWAP rules reference (knowledge ANCHORED VWAP rules) is clean in the checker and previews the line, bands and back-fill", async () => {
  const { checkPine } = await import("../../brain-app/api/_nexus/lint.js");
  const { SYSTEM_PROMPT } = await import("../../brain-app/api/_nexus/knowledge.js");
  assert.match(SYSTEM_PROMPT, /# ANCHORED VWAP RULES/);
  assert.match(SYSTEM_PROMPT, /rebuild the sums from the pivot bar forward/);
  const code = fs.readFileSync(path.join(here, "fixtures", "avwap_rules.pine"), "utf8");
  const c = checkPine(code); assert.ok(c.ok && c.clean, JSON.stringify(c.errors.concat(c.mustFix, c.shouldFix)));
  const r = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(r.ok, r.error); assert.deepEqual(r.unsupported, []);
  assert.ok(r.lines.length > 0, "back-filled AVWAP pieces from the pivot bar"); assert.equal(r.tables.length, 1);
  const av = r.plots.find((p) => p.title === "AVWAP") || r.plots[1];
  assert.ok(av && av.values.filter((v) => v != null && isFinite(v)).length > 100, "AVWAP plotted");
});

await t("zones stay fixed (lesson L019, Ahmad 2026-10-29: boxes moved with price); the withdrawn entry-zone rule is gone", async () => {
  const { SYSTEM_PROMPT } = await import("../../brain-app/api/_nexus/knowledge.js");
  const { LESSONS } = await import("../../brain-app/api/_nexus/lessons.js");
  assert.ok(LESSONS.some((l) => l.id === "L019" && /FIXED price areas/.test(l.text)));
  assert.doesNotMatch(SYSTEM_PROMPT, /ENTRY ZONES THAT HOLD UP|ENTRY ZONES - WHAT HELD UP/);
  const { UPGRADES } = await import("../../brain-app/api/_brain/lib-upgrade-notes.js");
  assert.equal(UPGRADES.filter((u) => /^2026-10-2[89]$/.test(u.rev)).length, 0, "withdrawn saved-indicator updates never come back");
});

await t("liquidity_areas template: fixed boxes (top / bottom never move as new bars arrive), plan levels, two tables", async () => {
  const { TEMPLATE_BY_ID } = await import("../../brain-app/api/_nexus/templates.js");
  const code = TEMPLATE_BY_ID.get("liquidity_areas").code;
  const A = runPreview(code, candles.slice(0, -40), { tfSec: 900, symbol: GOLD });
  const B = runPreview(code, candles, { tfSec: 900, symbol: GOLD });
  assert.ok(A.ok && B.ok, A.error || B.error); assert.deepEqual(B.unsupported, []);
  assert.equal(B.tables.length, 2);
  // Areas sit in one column next to the last candle; their PRICES never change while they live.
  const areasOf = (r) => r.boxes.filter((b) => /strength|Corrective|قوة|تصحيحي/.test(b.text || ""));
  const lastA = A.lastBar ?? (candles.length - 41), live = areasOf(B);
  assert.ok(live.length > 0 && live.length <= 4, "at most 2 areas per side");
  for (const b of live) assert.ok(b.top > b.bottom);
  const older = areasOf(A).filter((a) => live.some((b) => Math.abs(b.top - a.top) < 1e-9 || Math.abs(b.bottom - a.bottom) < 1e-9));
  for (const a of older) assert.ok(live.some((b) => b.top === a.top && b.bottom === a.bottom), "an area that still lives kept its exact price range");
  assert.ok(B.labels.some((l) => /^(TP|SL)$/.test(l.text || "")) || B.labels.some((l) => /^(Sell|Buy)$/.test(l.text || "")), "signals / hits marked");
});

console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
