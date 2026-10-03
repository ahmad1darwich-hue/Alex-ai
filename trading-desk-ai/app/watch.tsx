"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Allan's channel — a live "watch" view.
 *
 * One symbol is pinned and re-read on an interval while the page is OPEN IN
 * YOUR BROWSER. This is not a background service: close the tab and it stops.
 * Nothing here can approve, execute, or place anything.
 */

interface WatchPayload {
  symbol: string;
  interval: string;
  lastPrice: number;
  changePct: number;
  rsi14: number | null;
  macdHist: number | null;
  atr14: number | null;
  volumeRatio: number | null;
  side: "LONG" | "SHORT" | "WAIT";
  confluence: number;
  bullets: string[];
  news: { title: string; url: string; source: string }[];
  status: "PENDING";
}

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"];

export default function Watch({
  lang,
  strings: s,
}: {
  lang: "ar" | "en";
  strings: Record<string, string>;
}) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [minutes, setMinutes] = useState(5);
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<WatchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function pull() {
      try {
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, lang, interval: "1h" }),
        });
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(j.error ?? "Request failed");
          return;
        }
        setError(null);
        setData(j as WatchPayload);
        setHistory((h) => [...h.slice(-119), j.lastPrice as number]);
        tick.current = 0;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      }
    }

    pull();
    const puller = setInterval(pull, minutes * 60_000);
    const ticker = setInterval(() => {
      tick.current += 1;
      setAge(tick.current);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(puller);
      clearInterval(ticker);
    };
  }, [enabled, symbol, minutes, lang]);

  useEffect(() => {
    setHistory([]);
    setData(null);
    tick.current = 0;
    setAge(0);
  }, [symbol]);

  const spark = useMemo(() => {
    if (history.length < 2) return null;
    const min = Math.min(...history);
    const max = Math.max(...history);
    const span = max - min || 1;
    const pts = history
      .map((v, i) => {
        const x = (i / (history.length - 1)) * 100;
        const y = 30 - ((v - min) / span) * 30;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return { pts, rising: history[history.length - 1] >= history[0] };
  }, [history]);

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const sideClass = data?.side === "LONG" ? "up" : data?.side === "SHORT" ? "down" : "flat";

  const summary = data
    ? [
        `Allan | ${data.symbol} (${data.interval})`,
        `Price: ${data.lastPrice}`,
        `Side: ${data.side}`,
        `RSI14: ${data.rsi14?.toFixed(2) ?? "n/a"}`,
        `MACD hist: ${data.macdHist?.toFixed(4) ?? "n/a"}`,
        "",
        ...data.bullets,
      ].join("\n")
    : "";

  return (
    <section className="card p-4 lg:col-span-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{s.watchTitle}</h2>
        <button
          onClick={() => setEnabled((v) => !v)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
            enabled ? "bg-rose-500/90 text-slate-900" : "bg-sky-500 text-slate-900"
          }`}
        >
          {enabled ? s.watchStop : s.watchStart}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          {s.symbol}
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          >
            {PAIRS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {s.watchEvery}
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          >
            {[1, 5, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} {s.minutes}
              </option>
            ))}
          </select>
        </label>
        {enabled && (
          <span className="text-xs text-slate-400">
            {s.watchLastRead} <span className="mono">{age}s</span> {s.ago}
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">{s.watchCaveat}</p>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!data && enabled && <p className="text-sm text-slate-500">{s.analyzing}</p>}

      {data && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <span className={`text-2xl font-semibold ${sideClass}`}>
              {s[data.side] ?? data.side}
            </span>
            <span className="mono text-xl">{data.lastPrice.toLocaleString("en-US")}</span>
            <span className={`mono ${data.changePct >= 0 ? "up" : "down"}`}>
              {data.changePct >= 0 ? "+" : ""}
              {data.changePct.toFixed(2)}%
            </span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs">
              {s[data.status] ?? data.status}
            </span>
          </div>

          {spark && (
            <div className="mb-3">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-16 w-full">
                <polyline
                  points={spark.pts}
                  fill="none"
                  strokeWidth="1.5"
                  stroke={spark.rising ? "#35d07f" : "#ff5c7a"}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <p className="text-[11px] text-slate-500">{s.watchSparkNote}</p>
            </div>
          )}

          <div className="mb-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            {[
              ["RSI14", data.rsi14?.toFixed(1) ?? "—"],
              ["MACD", data.macdHist?.toFixed(3) ?? "—"],
              ["ATR14", data.atr14?.toFixed(2) ?? "—"],
              [s.confluence, `${data.confluence}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-800 p-2">
                <div className="text-slate-500">{k}</div>
                <div className="mono text-sm text-slate-200">{v}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => copyText(summary, "summary")}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs"
          >
            {copied === "summary" ? s.copied : s.copySummary}
          </button>

          {data.news.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {data.news.slice(0, 4).map((n, i) => (
                <li key={i}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 underline decoration-slate-600"
                  >
                    {n.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
