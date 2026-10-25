// Chart preview for Brain Indicators (Vercel EDGE function).
//   POST { code, symbol, tf, timeline? } -> { ok, symbol, tf, source, candles: [{t,o,h,l,c,v}], result }
// With timeline: true every label / line / box also carries born / moved / died bar indexes (clip maker replay).
// `result` is what the Pine script draws (plots, shapes, labels, lines, boxes, tables, trades), computed by our own
// runner (_nexus/preview-run.js) over live public candles (_brain/candles.js). Educational preview only: it is an
// approximation of TradingView and never places trades.
import { runPreview } from "./_nexus/preview-run.js";
import { getCandles, sampleCandles, SYMBOLS, TIMEFRAMES } from "./_brain/candles.js";
export const config = { runtime: "edge" };

const MAX_CODE = 400000; // characters of Pine code (big pro scripts with many drawings can pass 120k)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = hits.get(ip) || [];
  const recent = w.filter((t) => now - t < 60000); recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 40;
}
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async function handler(req) {
  if (req.method === "GET") {
    // GET ?symbol=XAUUSD&tf=15 checks the candle sources (used by the daily self-check and for diagnosis).
    const q = new URL(req.url).searchParams, ps = q.get("symbol");
    if (ps && SYMBOLS[ps]) {
      const tfq = TIMEFRAMES[q.get("tf")] ? q.get("tf") : "15";
      try { const r = await getCandles(ps, TIMEFRAMES[tfq], 700); const c = r.candles[r.candles.length - 1]; return json({ ok: true, symbol: ps, tf: tfq, source: r.source, count: r.candles.length, last: c }); }
      catch (e) { return json({ ok: false, symbol: ps, tf: tfq, message: String(e && e.message || e).slice(0, 300) }); }
    }
    return json({ ok: true, symbols: Object.fromEntries(Object.entries(SYMBOLS).map(([k, v]) => [k, v.label])), timeframes: Object.keys(TIMEFRAMES) });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "x";
  if (limited(ip)) return json({ ok: false, message: "too many previews, wait a minute" }, 429);
  let b = null;
  try { const raw = await req.text(); if (raw.length > MAX_CODE + 4000) return json({ ok: false, message: "script too large for the preview (max " + MAX_CODE + " characters)" }, 413); b = JSON.parse(raw); } catch (e) {}
  if (!b || typeof b.code !== "string" || !b.code.trim()) return json({ ok: false, message: "code missing" }, 400);
  const symbol = SYMBOLS[b.symbol] ? b.symbol : "XAUUSD";
  const tf = TIMEFRAMES[b.tf] ? String(b.tf) : "15";
  const tfSec = TIMEFRAMES[tf];
  let candles, source, sample = false;
  try { const r = await getCandles(symbol, tfSec, 700); candles = r.candles; source = r.source; }
  catch (e) {
    console.log("PREVIEW_CANDLES_FAIL", symbol, tf, String(e && e.message || e).slice(0, 300));
    candles = sampleCandles(tfSec, 600, symbol === "BTCUSD" ? 80000 : symbol === "EURUSD" ? 1.1 : symbol === "US100" ? 20000 : 2400); source = "sample"; sample = true;
  }
  const S = SYMBOLS[symbol];
  let result;
  // timeline: the clip maker replays the last bars one by one and needs to know when each drawing was born / died.
  const timeline = b.timeline === true;
  try { result = runPreview(b.code, candles, { tfSec, symbol: S, maxMs: 7000, maxSteps: 1.6e7, timeline, timelineFrom: timeline ? Math.max(0, candles.length - 240) : undefined }); } // big pro scripts need more than the default 2.5 s
  catch (e) { result = { ok: false, error: "preview failed: " + String(e && e.message || e).slice(0, 200) }; }
  console.log("PREVIEW", JSON.stringify({ symbol, tf, source, bars: candles.length, ok: result.ok, ms: result.ms, err: result.error ? String(result.error).slice(0, 120) : undefined, unsupported: result.unsupported }));
  return json({ ok: true, symbol, label: S.label, tf, source, sample, mintick: S.mintick, candles, result });
}
