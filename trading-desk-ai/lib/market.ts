import type { Candle, IndicatorSnapshot } from "./types";
import { atr, macd, rsi, sma, volumeRatio } from "./indicators";

const BINANCE = "https://api.binance.com/api/v3";

interface RawKline {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

/**
 * Fetch live candles from Binance's public REST API.
 * No API key, no account, no order capability — this endpoint is read-only by nature.
 */
export async function fetchCandles(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const url = `${BINANCE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Binance klines ${res.status}`);
  }
  const raw = (await res.json()) as RawKline[];
  return raw.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

/** Build the full indicator snapshot from a candle series. */
export function buildSnapshot(symbol: string, interval: string, candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const lastPrice = closes[closes.length - 1] ?? 0;
  const ref = closes.length > 24 ? closes[closes.length - 25] : closes[0];
  const changePct24h = ref ? ((lastPrice - ref) / ref) * 100 : 0;

  return {
    symbol,
    interval,
    lastPrice,
    changePct24h,
    sma: { fast: sma(closes, 21), slow: sma(closes, 55) },
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    atr14: atr(candles, 14),
    volumeRatio: volumeRatio(candles, 20),
    candles: candles.slice(-120),
  };
}
