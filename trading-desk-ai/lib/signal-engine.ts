import type { IndicatorSnapshot, NewsItem, Reasoning, SignalSide, TradePlan } from "./types";

/**
 * The rule engine. It is deliberately transparent: every bullet it emits is a
 * stated condition, so the user can see exactly why a signal exists and edit it.
 *
 * It produces a PLAN ONLY. It never talks to an exchange, holds no keys, and
 * cannot place an order.
 */

interface RuleResult {
  side: SignalSide;
  bulletsAr: string[];
  bulletsEn: string[];
  confluence: number;
}

export function evaluate(snapshot: IndicatorSnapshot): RuleResult {
  const { sma, rsi14, macd, volumeRatio, lastPrice } = snapshot;
  const ar: string[] = [];
  const en: string[] = [];
  let score = 0;
  let checks = 0;

  const trendUp = sma.fast !== null && sma.slow !== null && sma.fast > sma.slow;
  const trendDown = sma.fast !== null && sma.slow !== null && sma.fast < sma.slow;

  checks++;
  if (trendUp) {
    score++;
    ar.push("المتوسط السريع (21) فوق المتوسط البطيء (55) — اتجاه صاعد");
    en.push("Fast SMA (21) above slow SMA (55) — uptrend");
  } else if (trendDown) {
    ar.push("المتوسط السريع (21) تحت المتوسط البطيء (55) — اتجاه هابط");
    en.push("Fast SMA (21) below slow SMA (55) — downtrend");
  } else {
    ar.push("المتوسطات متقاربة — لا اتجاه واضح");
    en.push("MAs are flat — no clear trend");
  }

  checks++;
  if (rsi14 !== null && rsi14 < 30) {
    score++;
    ar.push(`RSI عند ${rsi14.toFixed(1)} — تشبع بيعي`);
    en.push(`RSI at ${rsi14.toFixed(1)} — oversold`);
  } else if (rsi14 !== null && rsi14 > 70) {
    ar.push(`RSI عند ${rsi14.toFixed(1)} — تشبع شرائي`);
    en.push(`RSI at ${rsi14.toFixed(1)} — overbought`);
  } else if (rsi14 !== null) {
    score += 0.5;
    ar.push(`RSI عند ${rsi14.toFixed(1)} — منطقة محايدة`);
    en.push(`RSI at ${rsi14.toFixed(1)} — neutral zone`);
  }

  checks++;
  const macdBull = macd.hist !== null && macd.hist > 0;
  if (macdBull) {
    score++;
    ar.push("هيستوغرام MACD موجب — زخم صاعد");
    en.push("MACD histogram positive — bullish momentum");
  } else if (macd.hist !== null) {
    ar.push("هيستوغرام MACD سالب — زخم هابط");
    en.push("MACD histogram negative — bearish momentum");
  }

  checks++;
  if (volumeRatio !== null && volumeRatio > 1.3) {
    score++;
    ar.push(`حجم التداول ${volumeRatio.toFixed(2)}× المتوسط — مشاركة قوية`);
    en.push(`Volume at ${volumeRatio.toFixed(2)}× average — strong participation`);
  } else if (volumeRatio !== null) {
    ar.push(`حجم التداول ${volumeRatio.toFixed(2)}× المتوسط — مشاركة عادية`);
    en.push(`Volume at ${volumeRatio.toFixed(2)}× average — ordinary participation`);
  }

  const confluence = Math.round((score / Math.max(checks, 1)) * 100);

  let side: SignalSide;
  if (trendUp && macdBull && (rsi14 === null || rsi14 < 72)) side = "LONG";
  else if (trendDown && !macdBull && (rsi14 === null || rsi14 > 28)) side = "SHORT";
  else side = "WAIT";

  ar.push(
    side === "WAIT"
      ? "الإشارات متضاربة — الأفضل الانتظار"
      : `المحصلة: إشارة ${side === "LONG" ? "شراء" : "بيع"} معلّقة بانتظار مراجعتك`,
  );
  en.push(
    side === "WAIT"
      ? "Signals conflict — standing aside is the better call"
      : `Result: a ${side} signal, pending your review`,
  );

  ar.push(`آخر سعر: ${lastPrice.toLocaleString("en-US")}`);
  en.push(`Last price: ${lastPrice.toLocaleString("en-US")}`);

  return { side, bulletsAr: ar, bulletsEn: en, confluence };
}

/** Derive entry / stop / target from ATR. Always a proposal, never a placement. */
export function buildPlan(snapshot: IndicatorSnapshot, side: SignalSide): TradePlan {
  const price = snapshot.lastPrice;
  const a = snapshot.atr14 ?? price * 0.01;
  const dir = side === "SHORT" ? -1 : 1;

  const stop = price - dir * a * 1.5;
  const target = price + dir * a * 3;
  const risk = Math.abs(price - stop);
  const reward = Math.abs(target - price);
  const rr = risk > 0 ? reward / risk : 0;

  return {
    side,
    entry: round(price),
    stopLoss: round(stop),
    takeProfit: round(target),
    rr: Number(rr.toFixed(2)),
    riskHint:
      "Proposal only — size it yourself. A common reference is risking 1% of account equity per idea.",
  };
}

export function toReasoning(result: RuleResult, lang: "ar" | "en"): Reasoning {
  return {
    bullets: lang === "ar" ? result.bulletsAr : result.bulletsEn,
    confluence: result.confluence,
  };
}

export function newsToReasoning(news: NewsItem[]): string[] {
  return news.map((n) => n.title);
}

function round(n: number): number {
  if (n === 0) return 0;
  const mag = Math.abs(n);
  const decimals = mag >= 1000 ? 2 : mag >= 1 ? 4 : 8;
  return Number(n.toFixed(decimals));
}
