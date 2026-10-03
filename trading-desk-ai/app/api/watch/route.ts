import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot, fetchCandles } from "@/lib/market";
import { fetchNews } from "@/lib/news";
import { buildPlan, evaluate, toReasoning } from "@/lib/signal-engine";
import type { Lang } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The watch endpoint. Same live reads as /api/market, but it returns a flat
 * snapshot with NO identity and NO mutable state.
 *
 * It deliberately returns no signal id and no status, so there is nothing here
 * for anyone to 'approve' — this endpoint cannot advance anything toward an
 * action. It is a read, and only a read.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol: string = (body.symbol ?? "BTCUSDT").toUpperCase();
  const interval: string = body.interval ?? "1h";
  const lang: Lang = body.lang === "en" ? "en" : "ar";

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    const [candles, news] = await Promise.all([
      fetchCandles(symbol, interval),
      fetchNews(`${symbol} crypto`, 5),
    ]);
    const snapshot = buildSnapshot(symbol, interval, candles);
    const result = evaluate(snapshot);
    const plan = buildPlan(snapshot, result.side);
    const reasoning = toReasoning(result, lang);

    return NextResponse.json({
      symbol,
      interval,
      lastPrice: snapshot.lastPrice,
      changePct: snapshot.changePct24h,
      rsi14: snapshot.rsi14,
      smaFast: snapshot.sma.fast,
      smaSlow: snapshot.sma.slow,
      macdHist: snapshot.macd.hist,
      atr14: snapshot.atr14,
      volumeRatio: snapshot.volumeRatio,
      side: plan.side,
      confluence: reasoning.confluence,
      bullets: reasoning.bullets,
      news: news.map((n) => ({ title: n.title, url: n.url, source: n.source })),
      // Not a state machine — a label for this single read.
      status: "PENDING" as const,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
