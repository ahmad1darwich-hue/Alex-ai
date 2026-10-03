/**
 * Shared types for the trading desk.
 *
 * The central invariant of this app lives here: nothing is ever `executed`.
 * The only states a signal can hold are the three below, and only the user
 * can move a signal out of PENDING.
 */

export type SignalSide = "LONG" | "SHORT" | "WAIT";

/** A signal can only ever be one of these. There is no "EXECUTED". */
export type SignalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IndicatorSnapshot {
  symbol: string;
  interval: string;
  lastPrice: number;
  changePct24h: number;
  /** Simple moving averages over the close series. */
  sma: { fast: number | null; slow: number | null };
  /** Wilder RSI over 14 periods. */
  rsi14: number | null;
  /** MACD line, signal line, histogram. */
  macd: { line: number | null; signal: number | null; hist: number | null };
  atr14: number | null;
  /** Volume of the most recent candle vs. the 20-candle average. */
  volumeRatio: number | null;
  candles: Candle[];
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

export interface Reasoning {
  /** One line per rule, in the language the user selected. */
  bullets: string[];
  /** 0-100. How much of the rule set agreed. Not a probability of profit. */
  confluence: number;
}

export interface TradePlan {
  side: SignalSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** Reward / risk, computed from the three prices above. */
  rr: number;
  /** ATR-derived sizing hint: what fraction of account to risk (never auto-applied). */
  riskHint: string;
}

export interface Signal {
  id: string;
  createdAt: string;
  symbol: string;
  interval: string;
  status: SignalStatus;
  plan: TradePlan;
  snapshot: IndicatorSnapshot;
  reasoning: Reasoning;
  news: NewsItem[];
  /** Free-text note the user can attach when editing before approving. */
  note: string;
  /** True only if the user changed at least one price on the plan. */
  editedByUser: boolean;
}

export type Lang = "ar" | "en";
