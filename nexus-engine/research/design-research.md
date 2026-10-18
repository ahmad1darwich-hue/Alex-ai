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

## 2026-10-16 (run 4) · Ahmad's screenshots (vendor library + AI chart app)
Seen: SMC chart with live zones extended to the right edge, strong contrasting supply/demand hues, thin structure
lines with tiny CHoCH/BOS labels; an AI chat docked next to a live chart (build -> see it on the chart at once).
Where it went: knowledge.js rule 6c. The chat-next-to-chart preview is the next big feature (needs a Pine runtime;
the open-source one is AGPL-3.0 - licence decision with Ahmad).

## 2026-10-16 (run 5) · oscillators and divergence
Sources: luxalgo.com library pages (RSI divergences, realtime divergence for any indicator, divergence detector),
prorealcode "Multiple divergences - a confluence counter across ten oscillators", TradingView open-source RSI
divergence script descriptions and release notes (feature text only).
What traders want / complain about:
- Divergence only on CONFIRMED pivots (right bars closed); a divergence drawn on a forming pivot vanishes = top complaint.
  The honest cost is lag of "pivot length" bars - say it, never hide it with offset.
- Pair the two most recent oscillator pivots with price's extreme of the same swing; bad pairing = phantom divergences.
- Filters that cut noise: min / max bars between pivots (common 5 / 60), a minimum oscillator difference, toggles per
  type (regular = reversal, hidden = continuation); several oscillators agreeing ("count x3") = stronger.
- Mark it on the PRICE chart too, not only in the oscillator pane; colors per type, regular solid / hidden dashed.
- Alerts fired more than once per divergence were a recurring bug: tie each alert to the confirmation bar.
- Confirm before acting (structure break, reversal candle, trigger-level cross) - divergence is timing, not a signal alone.
Where it went:
- knowledge.js: new "DIVERGENCE AND OSCILLATOR ENGINE RULES"; design rule 8 sharpened (hline colors cannot come from
  the theme function - the checker rejects series colors there - theme colors go in fills of hidden level plots).
- templates/rsi_divergence.pine rebuilt on the design system: theme, gradient RSI with glow, OB/OS heat fills, auto
  lengths per timeframe, price extreme within one bar of the RSI pivot, minimum RSI difference, marks on the price
  chart with force_overlay, track record (hit = 1 ATR its way first) + hit rate in a dashboard.
- Chart preview: drawings with force_overlay = true are now drawn on the price pane (they were drawn in the oscillator pane).
- bench.js: new case stoch_hidden_div; tests/preview.test.mjs: force_overlay + track-record check.

## 2026-10-17 · trend tools, ribbons and chop filters
Sources: luxalgo.com library "Trend Ribbon" and "Moving Average Ribbon" pages, TradingView script descriptions
"Trend Stability Ribbon" (efficiency + ATR-normalised slope, four states stable/noisy up/down) and "SuperTrend Engine"
(efficiency-adaptive factor, whipsaw shield, graded flips, settled markers, R trade plan), strategyquant
"Efficiency SuperTrend" (trail freezes below ER 0.30), prorealcode forum thread "Filters - what works for you?".
What traders want / complain about:
- Direction alone is not enough: they want to know HOW WELL price trends. Chop = the #1 complaint about SuperTrend /
  trail tools (rapid flips). ADX > 30 filters were dropped by forum users for entering "super late"; efficiency
  ratio (net move / path) and rising-volatility gates are reported as more useful.
- Freeze, don't flip: in a low-efficiency stretch the trail holds its level (consolidation is visible) instead of
  ratcheting into price; a flip needs a close beyond the trail plus a volatility margin. Honest cost: later flips.
- Ribbons are read as one band: stack order = trend, spread = momentum, tangled knot = range/transition
  (setup for breakout traders, not a signal). Close through the whole ribbon = strong warning.
- Proof: graded signals (A/B), counts of blocked whipsaws, hit-rate per symbol, R plan (stop, 1R, 2R) drawn
  for the open signal only.
Where it went:
- knowledge.js: new "TREND ENGINE RULES" (efficiency regime, whipsaw shield, ribbon reading, grading, track record).
- templates/trend.pine rebuilt as "Nexus Trend - Adaptive Ribbon & Trail" on the design system: theme, auto
  lengths per timeframe, 4-EMA ribbon with spread-strength fill, ER-frozen ATR trail with glow and shield, graded
  alternating BUY/SELL labels, one live trade plan with risk/reward boxes, regime + track-record dashboard, alerts.
- bench.js: new case trend_chop_filter (Arabic, gold 15m). tests/preview.test.mjs: trend template checks.

## 2026-10-18 · support / resistance zones, role reversal and retests
Sources: luxalgo.com library "Role Reversal" and "Retest" concept pages, "Strong Retest Zones" and "Support and
Resistance Retest/Breakout Signals" pages, TradingView open-source "Dynamic Support & Resistance Zones" description
(feature text only), nexusfi / mql5 forum threads on automatic S/R indicators.
What traders want / complain about:
- Too many lines is the #1 complaint about auto S/R: old and weak levels never go away. Wanted: a cap, merging of
  nearby levels, weakest dropped, only "real" levels (2+ separate visits) and a freshness decay.
- A level is a band, not a price: outer edge at the wick extreme, inner edge at the body; keep the height sane in ATR
  (very wide zones are context, not entries).
- Strength they trust: touches counted as independent visits (not one choppy episode), freshness, confluence
  (higher-timeframe swing, round number, volume shelf) - shown as a score, with bolder fills for stronger zones.
- Breaks: a full-bodied close beyond the zone, never a wick probe. Role flip only for levels with history; the FIRST
  retest carries the most interest; a flip broken back = failed flip (a signal in itself) - remove the level.
- Panel: nearest support / resistance with distance, live zone counts; alerts on entry, break and retest.
Where it went:
- knowledge.js ZONE ENGINE RULES: two new S/R lines (wick-to-body construction, separate-visit touches, strength
  score, full-body breaks, flip only with history, first-retest signal, failed flip removal).
- templates/sr.pine rebuilt as "Nexus S/R - Strength Zones & Role Flips" on the design system (theme, auto pivot
  length, strength-graded fills, zones to the right edge, dashed flipped zones, ▲/▼ RETEST with stop 0.5 ATR beyond,
  retest track record, failed flips, Present / Historical mode, HTF confluence tag, nearest S/R dashboard).
- bench.js: new case sr_flip_retest. tests/preview.test.mjs: S/R template checks.
- Market report: support / resistance and prices now come from real daily candles (previous day high/low, 5-day
  range, pivot, ADR) fed into the prompt, not from the model's memory.
