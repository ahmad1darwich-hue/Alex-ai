import type { Candle } from "./types";

/** Simple moving average of the last `period` closes. Null when not enough data. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential moving average, seeded with an SMA of the first `period` values. */
export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI over `period` (default 14). Null when not enough data. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (12, 26, 9). Nulls when the series is too short. */
export function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  if (fast.length === 0 || slow.length === 0) {
    return { line: null, signal: null, hist: null };
  }
  const n = Math.min(fast.length, slow.length);
  const fastTail = fast.slice(-n);
  const slowTail = slow.slice(-n);
  const lineSeries = fastTail.map((v, i) => v - slowTail[i]);
  const signalSeries = ema(lineSeries, 9);
  const line = lineSeries[lineSeries.length - 1] ?? null;
  const signal = signalSeries.length ? signalSeries[signalSeries.length - 1] : null;
  const hist = line !== null && signal !== null ? line - signal : null;
  return { line, signal, hist };
}

/** Average True Range over `period` (default 14), Wilder smoothing. */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close),
      ),
    );
  }
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
  }
  return prev;
}

/** Volume of the last candle divided by the mean of the previous `lookback`. */
export function volumeRatio(candles: Candle[], lookback = 20): number | null {
  if (candles.length < lookback + 1) return null;
  const prev = candles.slice(-(lookback + 1), -1).map((c) => c.volume);
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (avg === 0) return null;
  return candles[candles.length - 1].volume / avg;
}
