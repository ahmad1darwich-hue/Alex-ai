# Nexus / Brain Indicators roadmap (read by every daily run)

## NEXT BIG FEATURE: live chart preview next to the chat (decided by Ahmad, 2026-10-16)

Goal: in Brain Indicators (and later the public Nexus site) the page shows a live chart beside the chat; every
script the bot builds is drawn on it at once, so Ahmad does not have to paste into TradingView to see it.
TradingView stays the final check.

Decision: OUR OWN engine (no AGPL code). Do NOT use PineTS / Vela (AGPL-3.0 or paid licence).

STATUS 2026-10-16: shipped (run 5: force_overlay drawings now go to the price pane) in Brain Indicators. `api/preview.js` (POST code+symbol+tf) -> `_brain/candles.js`
(Yahoo / Binance data mirror / Kraken, sample candles as last resort) -> `_nexus/preview-run.js` (our Pine runner on
the bundled parser: series, var, ta.*, user functions + types, arrays/maps, drawings with max counts, tables,
request.security HTF, time() sessions, strategy simulator) -> `ui/chart.js` (our own canvas chart, no library) shown
in every script card. Tests: tests/preview.test.mjs. All 9 templates preview with nothing unsupported.
NEXT: check the `PREVIEW` / `PREVIEW_CANDLES_FAIL` logs (are live candles arriving?), widen coverage from
`unsupported` lists in the logs, split view (chat beside the chart) on wide screens, then the public Nexus site.
- Chart: our own canvas renderer in nexus-engine/ui/chart.js (Lightweight Charts could not be downloaded here).
- Candles: a small server endpoint `api/candles.js` (Edge, cached ~60 s, rate limited) that fetches public OHLC:
  crypto from Binance klines, gold / forex / indices from a free source verified at build time. Symbols and
  timeframes: XAUUSD, BTCUSDT, EURUSD, US100 on 1m-1D.
- Runner: `nexus-engine/preview/runner.mjs`, evaluates Pine v6 on the browser over the candles, using the parser
  already bundled in `_nexus/pine-lint.mjs` (export it as PineParser). Bar-by-bar series semantics, var/varip,
  if/for/switch/ternary, user functions, UDTs and arrays, inputs at their defaults.

Phases (one per daily run, keep all tests green, add tests/preview.test.mjs):
1. Parser export + runner core (series, math, inputs, ta.sma/ema/rma/rsi/atr/tr/crossover/crossunder/highest/
   lowest/change/stdev) + plot / plotshape / hline / bgcolor / barcolor; chart panel with candles; the trend,
   scalper and RSI templates preview correctly.
2. Drawings: label / line / box (+ setters, delete, max counts), tables; ta.pivothigh/pivotlow; arrays + UDTs.
   SMC, S/R, sessions and signals templates preview.
3. request.security (higher timeframe from the candles endpoint, lookahead rules), time() sessions with time
   zones, strategy.* (entries/exits drawn, simple stats).
4. Every script the bot builds is previewed automatically; unsupported calls are listed honestly
   ("preview approximate: X not drawn"). Then the same panel on the public Nexus site.

## Template upgrades to the design system (one per run)
Done: sessions, rsi_divergence, trend, sr (2026-10-18: strength zones, role flips, first-retest signals), smc (2026-10-19:
displacement-scored OBs, breakers, FVG CE + IFVG, HTF bias + HTF FVGs, strong/weak swings, OB track record), signals
(2026-10-20: 5-check confluence + A/B grades, late-entry veto, clamped swing stop, BE after TP1, trail after TP2, R record),
scalper (2026-10-21: session VWAP + sigma bands, chop shield PB/REV/Quiet, kill zones, spread cushion, half at TP1 + BE, time stop),
mtf_dashboard (2026-10-22: auto TF ladder, closed-bar tuple rows with trend / power / RSI / structure, weighted alignment score,
Fading flag + streak, gauge, Full / Compact layouts).
Next: strategy (last one). After that: a second pass on zone quality across templates (HTF zones in sr / smc dashboards).
