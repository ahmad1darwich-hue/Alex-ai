// Public OHLC candles for the chart preview (no API key). Every symbol has several free sources, tried in order:
// Yahoo Finance chart API (gold / FX / index futures, crypto backup), Binance market-data mirror and Kraken (crypto).
// Results are kept in memory for 30 s per symbol and timeframe.

export const SYMBOLS = {
  XAUUSD: { label: "Gold", tickerid: "OANDA:XAUUSD", ticker: "XAUUSD", mintick: 0.01, type: "cfd", timezone: "America/New_York", currency: "USD", yahoo: "GC=F", binance: "PAXGUSDT", kraken: "PAXGUSD" },
  BTCUSD: { label: "Bitcoin", tickerid: "BINANCE:BTCUSDT", ticker: "BTCUSDT", mintick: 0.01, type: "crypto", timezone: "Etc/UTC", currency: "USD", binance: "BTCUSDT", kraken: "XBTUSD", yahoo: "BTC-USD" },
  ETHUSD: { label: "Ethereum", tickerid: "BINANCE:ETHUSDT", ticker: "ETHUSDT", mintick: 0.01, type: "crypto", timezone: "Etc/UTC", currency: "USD", binance: "ETHUSDT", kraken: "ETHUSD", yahoo: "ETH-USD" },
  EURUSD: { label: "EUR/USD", tickerid: "OANDA:EURUSD", ticker: "EURUSD", mintick: 0.00001, type: "forex", timezone: "America/New_York", currency: "USD", yahoo: "EURUSD=X" },
  US100: { label: "Nasdaq 100", tickerid: "CAPITALCOM:US100", ticker: "US100", mintick: 0.25, type: "cfd", timezone: "America/New_York", currency: "USD", yahoo: "NQ=F" },
  US30: { label: "Dow Jones", tickerid: "CAPITALCOM:US30", ticker: "US30", mintick: 1, type: "cfd", timezone: "America/New_York", currency: "USD", yahoo: "YM=F" },
};
// Chart timeframe (TradingView style) -> seconds.
export const TIMEFRAMES = { "1": 60, "5": 300, "15": 900, "60": 3600, "240": 14400, "1D": 86400 };

const cache = new Map();
const UA = { "user-agent": "Mozilla/5.0 (compatible; BrainPreview/1.0)", accept: "application/json" };

async function getJson(url, ms = 6000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: ac.signal }); if (!r.ok) throw new Error(url.split("/")[2] + " " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const clean = (list) => list.filter((c) => [c.t, c.o, c.h, c.l, c.c].every((x) => typeof x === "number" && isFinite(x)) && c.h >= c.l).sort((a, b) => a.t - b.t);

// Groups candles into a larger timeframe (used for 4h from 1h data).
export function aggregate(list, sec) {
  const out = []; let cur = null;
  for (const c of list) {
    const b = Math.floor(c.t / 1000 / sec);
    if (!cur || cur.b !== b) { cur = { b, t: b * sec * 1000, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v || 0 }; out.push(cur); }
    else { cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; cur.v += c.v || 0; }
  }
  return out.map(({ b, ...c }) => c);
}

async function yahoo(sym, tfSec) {
  const map = { 60: ["1m", "5d"], 300: ["5m", "5d"], 900: ["15m", "1mo"], 3600: ["60m", "3mo"], 14400: ["60m", "6mo"], 86400: ["1d", "5y"] }[tfSec];
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${map[0]}&range=${map[1]}&includePrePost=false`);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error("yahoo empty");
  const q = r.indicators.quote[0];
  let list = clean(r.timestamp.map((ts, k) => ({ t: ts * 1000, o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k], v: q.volume[k] || 0 })));
  if (tfSec === 14400) list = aggregate(list, 14400);
  return list;
}
async function binance(sym, tfSec) {
  const iv = { 60: "1m", 300: "5m", 900: "15m", 3600: "1h", 14400: "4h", 86400: "1d" }[tfSec];
  const j = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv}&limit=1000`);
  if (!Array.isArray(j) || !j.length) throw new Error("binance empty");
  return clean(j.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })));
}
async function kraken(sym, tfSec) {
  const iv = { 60: 1, 300: 5, 900: 15, 3600: 60, 14400: 240, 86400: 1440 }[tfSec];
  const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=${sym}&interval=${iv}`);
  const res = j && j.result; const key = res && Object.keys(res).find((k) => k !== "last");
  if (!key) throw new Error("kraken empty");
  return clean(res[key].map((k) => ({ t: k[0] * 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[6] })));
}

// Returns { candles, source } with at most `max` of the newest candles, or throws when every source failed.
export async function getCandles(symbol, tfSec, max = 700) {
  const S = SYMBOLS[symbol];
  if (!S) throw new Error("unknown symbol");
  const key = symbol + ":" + tfSec;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.v;
  const tries = [];
  if (S.type === "crypto") { tries.push(["binance", () => binance(S.binance, tfSec)], ["kraken", () => kraken(S.kraken, tfSec)], ["yahoo", () => yahoo(S.yahoo, tfSec)]); }
  else { if (S.yahoo) tries.push(["yahoo", () => yahoo(S.yahoo, tfSec)]); if (S.kraken) tries.push(["kraken", () => kraken(S.kraken, tfSec)]); if (S.binance) tries.push(["binance", () => binance(S.binance, tfSec)]); }
  const errors = [];
  for (const [name, fn] of tries) {
    try {
      const list = await fn();
      if (list.length >= 50) { const v = { candles: list.slice(-max), source: name }; cache.set(key, { at: Date.now(), v }); return v; }
      errors.push(name + ": only " + list.length);
    } catch (e) { errors.push(name + ": " + String(e && e.message || e).slice(0, 80)); }
  }
  throw new Error("no candle source answered (" + errors.join("; ") + ")");
}

// Deterministic sample candles, used only when every live source failed (the page labels them as sample data).
export function sampleCandles(tfSec, n = 600, start = 2400) {
  let x = 12345; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const out = []; let p = start; const t0 = Math.floor(Date.now() / 1000 / tfSec) * tfSec * 1000 - (n - 1) * tfSec * 1000;
  for (let i = 0; i < n; i++) {
    const o = p, c = o + (rnd() - 0.5) * start * 0.003 + Math.sin(i / 35) * start * 0.0006;
    out.push({ t: t0 + i * tfSec * 1000, o, h: Math.max(o, c) + rnd() * start * 0.0012, l: Math.min(o, c) - rnd() * start * 0.0012, c, v: 100 + rnd() * 900 });
    p = c;
  }
  return out;
}
