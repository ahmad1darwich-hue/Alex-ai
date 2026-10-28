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
strategy (2026-10-23: Breakout / EMA engine + ER regime + closed-bar auto HTF, risk sizing with cap, TP1 partial + BE, R ledger,
in-sample vs out-of-sample verdict, result boxes). ALL 9 templates are now on the design system.
2026-10-24 run 2: VOLUME PROFILE RULES in the knowledge pack + session_volume_profile bench case (no template yet - add a
verified volume_profile template only after the bench case passes for a few days).
Next: a second pass on zone quality across templates (HTF zones in sr / smc dashboards), then a monthly R grid option for the
strategy template and a "cost stress" note (re-run with 2x costs) in the bot's <explain> for strategies.

## Understanding the user the first time (Ahmad, 2026-10-23: "I have to ask 20 times")
Shipped: <asks> contract written before the code (every element / color / size / place / text, from words or a chart picture);
final review round on every clean build that sees a DRY RUN summary of the chart (design.js chartSummary: plot colors by name,
labels, zones, lines, table cells, tints) and ticks each ask ✓ / fixes ✗ (shown under the explanation, undelivered asks said
honestly); repeated asks detected (word overlap) and the model told to make the change visible. Main Brain: DESIGN STUDIO mode
(understand-first brief, exact format sizes, premium rules, USWS palette, rendered SVG/HTML in the chat) + "get it right the
first time" rule. ROLLED BACK 2026-10-24 (Ahmad: code quality got worse after the design updates of that day - premium-finish checks, signals
location check, review with the chart picture). Then, at Ahmad's request, the whole indicator engine went back to commit 3e473d9 (before the 2026-10-23 daily run:
strategy template rebuild, NX_STRATEGY_ALERTCONDITION, preview strategy simulator changes are undone too); render.js stays in the repo
unused. Re-add ONE change at a time, only with a real TradingView compile test, and ask Ahmad for the errors he saw first.
Was: the reviewer SEES the chart - _nexus/render.js draws the dry run (candles, plots, fills, tints, zones, lines,
labels with a pixel font, table) into a PNG (own rasterizer + CompressionStream) and every new build gets a final review with
that picture. NEXT: render the user's real symbol / timeframe candles instead of sample gold; learn design preferences from repeated
corrections into <remember> automatically.

## Clip maker for TikTok (Ahmad 2026-10-25: renting the indicators, marketing on TikTok, customers via Telegram)
Shipped: 🎬 button on every script card (Brain Indicators only): /api/preview timeline:true (born / moved / died per drawing) ->
chart.renderFrame(f) bar-by-bar replay (nothing past the bar, drawings only while they existed) -> 1080x1920 canvas (hook, chart,
progress, title, market, handle, educational note, end card with the dashboard + CTA) -> MediaRecorder (H.264 MP4 where supported,
else WebM) -> download / share. Labelled "Brain replay". NEXT: batch "clips for all my indicators", Arabic/English caption +
hashtags text next to the video, optional music-free voice-over line, real-time scheduling via a social tool if Ahmad connects one.

## New verified templates (Ahmad 2026-10-25: "add all of them" before the TikTok launch)
volume_profile, liquidity, supply_demand, fib_pivots - on the design system, clean in our checker and the preview on 15m / 1h / 4h,
visually checked through the clip maker. NOT yet pasted into TradingView: Ahmad's first paste is the real compile check - fix any
error he sends first. Then: a bench case each, and tune S&D defaults on real gold data (sample candles give few impulses).

## Alerts + automation (2026-10-25 run 2)
Shipped: knowledge rule 8b (verified alert facts), lint NX_ALERT_PLACEHOLDER / NX_STRATEGY_ALERTCONDITION, bench alert_webhook_json,
Brain /api/tv-alert (TradingView webhook -> Ahmad's Telegram; needs TV_ALERT_KEY set in Vercel), market report calendar feed
(CALENDAR DATA in Sydney time; check MARKET_REPORT output that events appear - if the feed is blocked from Vercel, nothing changes).
NEXT: forward alerts to a customer Telegram channel per rented indicator (Ahmad's renting plan), a "copy webhook JSON" button on
script cards, and an alert-presets block in the verified templates (one Any-alert mode) - one template at a time with a TV compile test.

## Opening range / Initial Balance (2026-10-26 run)
Shipped: OPENING RANGE / INITIAL BALANCE RULES in the knowledge pack, lint NX_SESSION_NO_TZ, bench orb_us100_retest, US cash open +
first hour in Sydney time on the market report's ⏰ line. NEXT: watch the bench result for orb_us100_retest in DAILY_REPORT; if it
passes a few days, add a verified opening_range template (ORB + IB, retest, FAILED, stats table) with a TradingView compile check.

## Volatility squeeze (2026-10-27 run)
Shipped: VOLATILITY SQUEEZE / COMPRESSION RULES in the knowledge pack, reference fixture tests/fixtures/squeeze_rules.pine (checker +
preview test), bench squeeze_gold_release, daily volatility regime in the market report. NEXT: when squeeze_gold_release passes in
DAILY_REPORT for a few days and Ahmad pastes the fixture into TradingView without errors, promote it to a verified `squeeze` template
on the design system (theme input, glow, gallery card) - one TradingView compile check first.

## Anchored VWAP (2026-10-28 run)
Shipped: ANCHORED VWAP RULES in the knowledge pack, reference fixture tests/fixtures/avwap_rules.pine (checker + preview test), lesson
L018 (TWAP fallback), bench avwap_btc_swing, 60-day high / low anchored VWAP (TWAP without volume) per market in the market report.
NEXT: polyline.new support in the preview runner (the rules allow a polyline for the back-filled stretch; today only line pieces are
drawn); when avwap_btc_swing passes in DAILY_REPORT for a few days and Ahmad pastes the fixture into TradingView without errors,
promote it to a verified `avwap` template on the design system - one TradingView compile check first.
