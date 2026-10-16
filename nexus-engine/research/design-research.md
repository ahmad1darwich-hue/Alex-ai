# Indicator design research (ideas only — never copy code or names)

Updated by the daily run. Each entry: date · source · idea · where it went (knowledge.js / template / lesson).

## 2026-10-16 · first deep search
Sources: luxalgo.com SMC library page, mql5 "Order Block Zones" user guide, algoalpha.io "best indicators 2026",
AlgoAlpha supply & demand guide, traderspost Pine v6 visuals article, quantzee "best indicators 2026".

What traders value (all vendors converge on this):
- Everything automatic, drawn on history at load; non-repainting on closed bars (repainting is the top complaint).
- Layers that can each be toggled (structure internal/swing, OB, FVG, EQH/EQL, premium/discount, MTF levels) to declutter.
- Historical vs Present mode (full markup vs only the live state).
- Internal structure dashed + small labels, swing structure solid — visual hierarchy fast vs slow.
- Color mode switch (colored / monochrome) and optional candle coloring by state.
- A compact panel: counts, nearest supply above / demand below with distance, trend/bias per timeframe.
- Alerts that matter: fresh-zone touch, break of structure, signal; one alert per event.
- Confluence in one pane (several oscillators / filters agreeing) rather than many indicators.
- ATR-based adaptivity: thresholds, stops, trailing (SuperTrend style) scale with volatility.
- HTF zones overlaid with a dashed outline so they read differently from chart-timeframe zones.

How zones are found (ideas):
- Order block: last opposite candle before a displacement that closes beyond its high/low within N bars (default 3)
  and travels ≥ 1.0×ATR(14); zone = full candle incl. wicks. Newer overlapping same-side zone replaces older one.
- Supply/demand: impulse of 2–3 large-body candles leaving a 1–3 candle base; zone = base low wick → base high body
  (demand). Quality: fresh (untouched) > touched once > skip after 2–3 tests; fast departure (creates FVG or BOS);
  tight base. Prefer zones that also exist on a higher timeframe; trade with HTF trend.
- Life cycle: fresh → touched (fade, dashed) → broken when a candle CLOSES beyond the far side (remove/archive).
  Keep only the newest N per side. Stop buffer 0.5×ATR beyond the zone.
- FVG: 3-candle gap, filter tiny gaps with an auto threshold (ATR or average gap size); option to extend.
- Equal highs/lows: two pivots within a small ATR fraction → liquidity pool.
- Premium / discount: split the current swing range at 50% (equilibrium).

Settings by timeframe / market (starting points):
- EMA cross 9/21 on 5m–1h, 50/200 on daily/weekly. RSI 9 for 5–15m, RSI 14 for 4h/daily.
- SuperTrend 10 / 3.0 default; 7 / 2.0–2.5 for 5m index scalping. MACD weak below 15m (noise).
- Gold: session timing matters (London / New York opens). Crypto trades 24/7: no session reset by default.

## 2026-10-16 (run 2) · sessions, kill zones and gold intraday
Sources: TradingView script listings for "asian session" and "ICT killzone" (feature descriptions only), mql5 blog
"The XAUUSD trading day: Tokyo, London, New York", abctradinggroup "Sessions, timezones and DST", mql5 kill-zone products.

What traders want from a session tool:
- Kill zones in New York time with automatic DST (Asia 20:00-00:00, London 02:00-05:00, NY AM 07:00-10:00, NY PM optional).
- Session high/low kept as liquidity until taken; London sweeping Asia and NY sweeping London is the setup they look for;
  sweep = wick through + close back inside. Alerts on sweeps.
- A small panel: current session, Asia range, today's range vs ADR ("fuel gauge": <40% room to run, >100% stretched),
  distance to previous day high/low. Midline (50%) of each session box.
- Hide on higher timeframes (kill zones lose meaning above ~1h).
Complaints: sessions an hour off around DST changes (US/EU change on different dates; Tokyo never changes), hard-coded
offsets, broker-defined day boundaries on FX/CFD, clutter from boxes that never end.
Gold behaviour: Asia builds the range, London often takes one side of it, New York (08:30 data) frequently reverses or
extends; the London-NY overlap is the fastest period.

Where it went:
- knowledge.js: new "SESSIONS, KILL ZONES AND SESSION LIQUIDITY" rules.
- templates/sessions.pine: rebuilt as "Nexus Sessions & Kill Zones" (Theme input, kill-zone boxes with range + midline,
  liquidity lines until taken, SWEEP labels, ADR range-used dashboard, sweep alerts).
- lint.js: design glyphs (▲ ▼ ● ◆ • ✕ ■) are now allowed inside strings - the design rules asked for them while the
  checker flagged them as must-fix, which wasted repair rounds.
- bench.js: new case gold_killzones. Market report: gold's London/NY kill zones printed in Sydney time (computed, DST-aware).

## 2026-10-16 (run 3) · vendor library page (public text only)
Ideas: dashboards that prove themselves (track record of signals / how often a read held), trade overlays with risk
and reward boxes and R targets, MTF alignment shown as check rows, stale levels cleared automatically.
Where it went: knowledge.js DESIGN DIRECTOR rule 6b.
