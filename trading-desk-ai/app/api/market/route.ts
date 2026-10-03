import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot, fetchCandles } from "@/lib/market";
import { fetchNews } from "@/lib/news";
import { buildPlan, evaluate, toReasoning } from "@/lib/signal-engine";
import type { Lang, Signal } from "@/lib/types";

export const dynamic = "force-dynamic";

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
      fetchNews(`${symbol} crypto`, 6),
    ]);

    const snapshot = buildSnapshot(symbol, interval, candles);
    const result = evaluate(snapshot);
    const plan = buildPlan(snapshot, result.side);

    const signal: Signal = {
      id: `${symbol}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      symbol,
      interval,
      // Always PENDING. Only the user can change this, and only in the UI.
      status: "PENDING",
      plan,
      snapshot,
      reasoning: toReasoning(result, lang),
      news,
      note: "",
      editedByUser: false,
    };

    return NextResponse.json({ signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
