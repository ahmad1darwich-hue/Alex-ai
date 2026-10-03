"use client";

import { useEffect, useMemo, useState } from "react";
import { strings } from "@/lib/i18n";
import type { Lang, Signal } from "@/lib/types";

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const INTERVALS = ["15m", "1h", "4h", "1d"];

export default function Home() {
  const [lang, setLang] = useState<Lang>("ar");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const s = strings[lang];
  const rtl = lang === "ar";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
  }, [lang, rtl]);

  async function analyze() {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, interval, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setSignal(data.signal as Signal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  /** The only way a signal leaves PENDING. Triggered by a click, never by code. */
  function setStatus(status: Signal["status"]) {
    setSignal((prev) => (prev ? { ...prev, status } : prev));
  }

  function editPrice(field: "entry" | "stopLoss" | "takeProfit", value: string) {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setSignal((prev) => {
      if (!prev) return prev;
      const plan = { ...prev.plan, [field]: n };
      const risk = Math.abs(plan.entry - plan.stopLoss);
      const reward = Math.abs(plan.takeProfit - plan.entry);
      plan.rr = risk > 0 ? Number((reward / risk).toFixed(2)) : 0;
      return { ...prev, plan, editedByUser: true };
    });
  }

  async function sendAsk() {
    if (!ask.trim() || !signal) return;
    const prompt = [
      `Symbol: ${signal.symbol} (${signal.interval})`,
      `Last price: ${signal.snapshot.lastPrice}`,
      `Rule engine side: ${signal.plan.side}`,
      `RSI14: ${signal.snapshot.rsi14?.toFixed(2) ?? "n/a"}`,
      `MACD hist: ${signal.snapshot.macd.hist?.toFixed(4) ?? "n/a"}`,
      `Headlines: ${signal.news.map((n) => n.title).join(" | ") || "none"}`,
      `Question: ${ask}`,
    ].join("\n");

    setAnswer("...");
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    setAiConfigured(data.configured);
    setAnswer(data.text ?? (data.configured ? "—" : s.aiOff));
    setAsk("");
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const videoKit = useMemo(() => {
    if (!signal) return null;
    const lines = signal.reasoning.bullets;
    const title = rtl
      ? `تحديث ${signal.symbol}: قراءة فنية سريعة`
      : `${signal.symbol} update: a quick technical read`;
    const description = rtl
      ? `قراءة فنية على ${signal.symbol}.\n\n${lines.join("\n")}\n\nمحتوى تعليمي وليس نصيحة استثمارية.`
      : `A technical read on ${signal.symbol}.\n\n${lines.join("\n")}\n\nEducational content, not investment advice.`;
    const tags = [signal.symbol, "crypto", "technical analysis", "تحليل فني", "تداول"];
    return { title, description, tags: tags.join(", ") };
  }, [signal, rtl]);

  const pill =
    signal?.plan.side === "LONG" ? "up" : signal?.plan.side === "SHORT" ? "down" : "flat";

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{s.appName}</h1>
          <p className="text-sm text-slate-400">{s.tagline}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLang("ar")}
            className={`rounded-lg px-3 py-1.5 text-sm ${rtl ? "bg-slate-100 text-slate-900" : "border border-slate-700"}`}
          >
            العربية
          </button>
          <button
            onClick={() => setLang("en")}
            className={`rounded-lg px-3 py-1.5 text-sm ${!rtl ? "bg-slate-100 text-slate-900" : "border border-slate-700"}`}
          >
            English
          </button>
        </div>
      </header>

      <section className="card mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
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
          <label className="flex flex-col gap-1 text-sm">
            {s.interval}
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            >
              {INTERVALS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <button
            onClick={analyze}
            disabled={loading}
            className="rounded-lg bg-emerald-500 px-5 py-2 font-medium text-slate-900 disabled:opacity-50"
          >
            {loading ? s.analyzing : s.analyze}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </section>

      {!signal && !loading && (
        <p className="text-slate-500">{s.tagline}</p>
      )}

      {signal && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card lg:col-span-2 p-4">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <span className={`text-3xl font-semibold ${pill}`}>
                {s[signal.plan.side]}
              </span>
              <span className="mono text-2xl">
                {signal.snapshot.lastPrice.toLocaleString("en-US")}
              </span>
              <span className={`mono ${signal.snapshot.changePct24h >= 0 ? "up" : "down"}`}>
                {signal.snapshot.changePct24h >= 0 ? "+" : ""}
                {signal.snapshot.changePct24h.toFixed(2)}%
              </span>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs">
                {s[signal.status]}
              </span>
              {signal.editedByUser && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-300">
                  {s.edited}
                </span>
              )}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["entry", "stopLoss", "takeProfit"] as const).map((f) => (
                <label key={f} className="flex flex-col gap-1 text-xs text-slate-400">
                  {f === "entry" ? s.entry : f === "stopLoss" ? s.stop : s.target}
                  <input
                    className="mono rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                    value={signal.plan[f]}
                    onChange={(e) => editPrice(f, e.target.value)}
                  />
                </label>
              ))}
              <div className="flex flex-col gap-1 text-xs text-slate-400">
                {s.rr}
                <span className="mono py-1.5 text-sm">{signal.plan.rr}</span>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setStatus("APPROVED")}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900"
              >
                {s.approve}
              </button>
              <button
                onClick={() => setStatus("REJECTED")}
                className="rounded-lg bg-rose-500/90 px-4 py-2 text-sm font-medium text-slate-900"
              >
                {s.reject}
              </button>
              <button
                onClick={() => setStatus("PENDING")}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
              >
                {s.reset}
              </button>
            </div>

            <label className="flex flex-col gap-1 text-xs text-slate-400">
              {s.note}
              <textarea
                rows={2}
                value={signal.note}
                placeholder={s.notePlaceholder}
                onChange={(e) =>
                  setSignal({ ...signal, note: e.target.value, editedByUser: true })
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            <p className="mt-4 text-xs text-slate-500">{s.notAdvice}</p>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-medium">{s.reasoning}</h2>
            <ul className="space-y-2 text-sm">
              {signal.reasoning.bullets.map((b, i) => (
                <li key={i} className="border-s-2 border-slate-700 ps-3 text-slate-300">
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>{s.confluence}</span>
                <span className="mono">{signal.reasoning.confluence}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${signal.reasoning.confluence}%` }}
                />
              </div>
            </div>
          </section>

          <section className="card lg:col-span-2 p-4">
            <h2 className="mb-3 font-medium">{s.news}</h2>
            {signal.news.length === 0 ? (
              <p className="text-sm text-slate-500">{s.noNews}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {signal.news.map((n, i) => (
                  <li key={i}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-200 underline decoration-slate-600 hover:decoration-slate-300"
                    >
                      {n.title}
                    </a>
                    <span className="ms-2 text-xs text-slate-500">{n.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-medium">{s.chat}</h2>
            {aiConfigured === false && (
              <p className="mb-3 rounded-lg bg-slate-800/60 p-2 text-xs text-slate-400">
                {s.aiOff}
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendAsk()}
                placeholder={s.chatPlaceholder}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              />
              <button
                onClick={sendAsk}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
              >
                {s.send}
              </button>
            </div>
            {answer && (
              <p className="mono mt-3 whitespace-pre-wrap text-sm text-slate-300">{answer}</p>
            )}
          </section>

          {videoKit && (
            <section className="card lg:col-span-3 p-4">
              <h2 className="mb-3 font-medium">{s.videoKit}</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {(
                  [
                    ["title", s.videoTitle, videoKit.title],
                    ["desc", s.videoDesc, videoKit.description],
                    ["tags", s.videoTags, videoKit.tags],
                  ] as const
                ).map(([key, label, value]) => (
                  <div key={key} className="flex flex-col gap-1 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      <button
                        onClick={() => copy(value, key)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[11px]"
                      >
                        {copied === key ? s.copied : s.copy}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={key === "desc" ? 6 : 3}
                      value={value}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
