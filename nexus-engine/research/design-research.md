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

## 2026-10-19 · SMC zone life cycle: order blocks, breakers, FVG mitigation and inversion
Sources: mql5 blog "How Order Blocks Form, Mitigate, and Die" (no-repaint OB article), TradingView FVG script search page
(feature descriptions only: mitigation modes, inversion, auto clean-up, CE), luxalgo library "Inversion FVG" page title,
edgeful blog "FVG indicator for TradingView" (same-session fill statistics on YM 30m).
What traders want / complain about:
- Repainting is still complaint #1: boxes that "appear exactly where price bounced". Zones must be born and retired only
  from closed bars, and the chart must show the life cycle (fresh / tested / dead) - identical static rectangles for a
  fresh and a 3-times-tapped zone make people trade dead blocks.
- An order block needs an impulsive exit (ideally leaving an FVG); each tap uses up liquidity; a wick through and back
  is still alive, a decisive CLOSE through kills it - and the dead block becomes a breaker on the other side.
- FVG options traders ask for: fill by full close-through or by midpoint (consequent encroachment), CE line, inversion
  (a gap closed through flips to S/R for a limited number of bars), caps per side and auto clean-up, ATR size filter,
  HTF gaps next to chart gaps, a panel with the nearest gaps per side.
- Data point (edgeful, small sample, one market): ~7 of 10 30m FVGs were NOT filled the same session -> gaps are
  context/targets, not entries by themselves.
Where it went:
- knowledge.js ZONE ENGINE RULES: FVG CE line + inversion rule, order block from the extreme of the breaking leg with
  displacement + score + first-touch tracking + breaker, caps after flips, strong/weak swings and HTF gaps.
- templates/smc.pine rebuilt as "Nexus SMC - Structure, Zone Engine & Liquidity" on the design system (theme, auto swing
  length, displacement-filtered scored OBs, fresh -> tested (dashed, xN) -> breaker -> removed, FVG CE + Full/Half fill +
  IFVG, HTF bias and HTF FVGs from closed HTF bars, strong/weak high/low, premium/discount, Present/Historical,
  dashboard with nearest supply/demand in ATR and the order-block first-touch track record).
- bench.js: new case fvg_inversion_breaker. tests/preview.test.mjs: SMC template checks (caps, text, dashed states, rows).
- Market report: data trend per market (20-day average + slope, distance in ADR, position in the 5-day range) fed to the
  prompt so 🟢/🔴/🟡 follow data unless today's news clearly says otherwise.

## 2026-10-20 · signal tools: confluence grading, late-entry veto, stops and trade management
Sources: luxalgo.com library "Neural Confluence Engine" concept page (scoring designs: equal-weight votes, weighted scores,
A+/B/C checklists, veto conditions), luxalgo library "Trailing Take Profit Trailing Stop Loss" page (trail anchors, ratchet,
profit-lock at R milestones, close vs intrabar triggers), friendofthetrend.com buy/sell indicator page (swing-extreme stop +
buffer, 3 ATR-style targets fixed at the signal, faded arrows while the bar is open, caution dots for weak signals),
TradingView "v1 Swing Trade" script description (late-entry filter, close-confirmed breakouts, stop modes ATR / pivot).
What traders want / complain about:
- A bare cross prints too many arrows; wanted: a score from independent checks with a cut-off, grades (A / B) shown
  differently, a "stand aside" when trend and momentum disagree, and veto conditions that beat any score.
- Chasing: signals that fire after the move is already stretched lose; a late-entry veto (distance from the mean in ATR) is
  a common ask. Also a cooldown and one position at a time.
- Stops: structure (recent swing + buffer) is preferred over a fixed ATR, but must be clamped (tiny swings = noise stop,
  huge swings = useless R). Targets fixed at the signal in R.
- Management: break-even after TP1, trail only in the trade's favor (ratchet), the stop line visibly changing state; the
  result depends on close vs intrabar checks - be conservative (stop first on a bar that hits both).
- Proof: "win rate" of TP1 alone flatters; traders trust total / average R per trade.
Where it went:
- knowledge.js: new "SIGNAL ENGINE RULES" (confluence score + grades, vetoes, clamped structure stop, break-even + ratchet
  trail, conservative order, R-based track record, exit marks for the last plan only).
- templates/signals.pine rebuilt as "Nexus Signals - Confluence Entries & Trade Manager" on the design system (theme, auto
  EMA lengths, 5-check confluence with A/B grades, late-entry veto + cooldown, swing/ATR stop clamped in ATR, TP1-TP3 with
  scale-out thirds, BE after TP1, ATR trail after TP2, opposite exit, risk/reward boxes, R track record dashboard, alerts).
- bench.js: new case signal_confluence_manager. tests/preview.test.mjs: signals template checks.

## 2026-10-21 · scalping tools: session VWAP bands, chop shield, kill zones and scalp management
Sources: TradingView "VWAP CCI Reversal (Scalp Edition)" description (daily VWAP + 1/2/3 sigma bands, 2-3 sigma as the signal
zone, recent oscillator extreme + reversal candle + volume, ATR stop / TP1 / TP2, fading levels, "avoid trend days hugging a
band"), TradingView "Tool: Chop and Trade Zones v2" description (distance from a mean as a no-trade zone, a 0/1/2/3 "allowed
direction" output), "NO REPAINT 1m Easy Scalping Sys" description + release notes (regime engine with confidence, ARMED ->
signal two-stage, closed-bar HTF, trading-ban windows; repainting candles got the script banned), "RSI Scalping Gold XAUUSD"
family (EMA9/SMA20/SMA200 + VWAP, relative volume with thresholds per timeframe, looser volume in London / NY kill zones),
sahi.com scalping-combinations article (pick ONE combo by day type: trend = VWAP + 9/21 EMA + volume, range = bands + RSI 7;
default RSI 14 too slow on 1m; 2-3 indicators max).
What traders want / complain about:
- Scalping signals die in chop: the top ask is a regime / no-trade filter that blocks entries rather than more arrows;
  trend-pullback and band-reversion are opposite tools and must not fire in the same regime.
- Quiet markets (Asian lull, lunch) do not pay the spread -> block entries when ATR is far below normal.
- Gold scalpers care about the spread: stops need a cushion; time stops ("the idea did not work") are common for scalps.
- Volume checks must not break on forex / CFD feeds without volume; kill zones must follow daylight saving (city timezones).
- Repainting candle colors / signals destroy trust; everything on confirmed bars.
Where it went:
- knowledge.js: new "SCALPER ENGINE RULES" (session VWAP map + sigma bands, chop shield with efficiency peak over the pullback
  window, PB only in Trend / REV only in Chop / nothing in Quiet, short RSI, RVOL + kill zones + grades, spread cushion, half at
  TP1 + stop to entry, time stop, R record).
- templates/scalper.pine rebuilt as "Nexus Scalper - VWAP Pullback Engine & Chop Shield" on the design system.
- bench.js: new case scalper_vwap_chop_shield. tests/preview.test.mjs: scalper template checks on 1m / 5m / 15m.
- Market report: weekend awareness (closed-market mornings become a week-ahead outlook with the Sydney reopen time).

## 2026-10-22 · multi-timeframe dashboards: ladders, weighted alignment and fading
Sources: TradingView "MTF Dashboard 9 Timeframes + Signals" description (per-TF trend / RSI / MACD / volume components averaged
into a confluence score, ⬆⬆ / ⬆ / ➡ symbols, star ratings, timeframes grouped lower / medium / higher, bias tint, cooldown on
labels, Professional / Classic / Vibrant / Dark schemes), LuxAlgo library "Multi-Timeframe (MTF) Dashboard" concept page (matrix
of states per TF, "4 of 5 bullish" count or weighted sum, ladder of 3-5 frames spaced ~3-6x apart, a decaying score 6/6 -> 3/6 as
an early regime-change sign, closed vs live HTF values), "MSP Multi-TF Dashboard v4" description (trend / RSI / MACD / ADX /
volume multiplier per TF, alignment streak counter, "4TF" all-aligned markers, brighter cells = stronger, compact mobile mode).
What traders want / complain about:
- A verdict, not a wall of cells: one alignment score / "n of 5" plus the per-TF matrix to see WHY.
- Higher timeframes should matter more; equal votes let the 1m flip the bias.
- Many dashboards never say whether HTF cells repaint; values of the still-open HTF candle flicker and alerts misfire.
- Strength matters: "up" in a noisy range is not the same as a clean trend - show strength, not only direction.
- Phones: big tables cover the chart -> compact layout.
- Signals from a falling score (alignment weakening) are wanted as an early warning.
Where it went:
- knowledge.js: new "MTF DASHBOARD RULES" (auto ladder, tuple closed-bar rows, warm-up rows without weight, weighted score with weak
  rows at half, Aligned / Mixed + Fading + streak, gauge, light chart layers, Full / Compact, alerts).
- templates/mtf_dashboard.pine rebuilt as "Nexus MTF - Trend Matrix & Alignment Engine" on the design system.
- bench.js: new case mtf_alignment_matrix. tests/preview.test.mjs: mtf template checks on 1m / 15m / 1H (ladders, cells, verdict).
- Market report: weekly trend (10-week average from the daily candles) + "daily + weekly aligned up / down / mixed" tag in the
  price data, and the prompt treats an aligned pair as the main bias.

## 2026-10-23 · strategy backtests: honest results, out-of-sample and overfitting
Sources: TradersPost blog "Pine Script backtesting limitations and validation" and "Over-optimization in Pine Script" (fill
assumptions inside OHLC bars, zero costs = a theoretical signal, slippage kills small scalp targets, Bar Magnifier on/off
comparison, delayed / closed-bar HTF values, chronological ~70/30 in-sample / out-of-sample split with rules frozen before the
check, plateau not peak, minimum trade count set before optimizing, re-run with higher costs, results without the biggest
winners), TradingView open-source "Monthly Strategy Performance Table" description (realized-equity basis, paging, progressive
detail, debug labels tying the table back to trades), TradingView Pine v6 manual "Alerts" (alertcondition() compiles in a
strategy but no alert can be created from it; alert_message on strategy.entry / exit / close + {{strategy.order.alert_message}};
alert() works in strategies, once per bar close unless calc_on_every_tick), NexusFi / babypips threads on misleading tests.
What traders want / complain about:
- Backtests that look great and die live: zero costs, lookahead HTF, intrabar fill luck, 15-trade samples, tuned on all data.
- A proof panel on the chart (profit factor, expectancy, drawdown, losing streak) instead of digging in the Strategy Tester.
- An out-of-sample check that is honest (same rules, just a split record) and a clear "not enough trades" warning.
- Partial take-profits + break-even like they trade by hand; alerts that carry the order details for bots.
Where it went:
- templates/strategy.pine rebuilt as "Nexus Strategy - Regime Breakout Engine & Honest Backtest" on the design system (Breakout /
  EMA-cross engine, ER regime filter, trend EMA + closed-bar auto HTF, risk-based size with max position cap, TP1 qty_percent +
  BE, optional trail, TP2, time stop, R ledger per idea, IS vs OOS split by last % of bars, verdict needing 30 trades, result
  boxes, OOS marker, alert_message on all orders). Last template moved to the design system.
- knowledge.js: new "STRATEGY / BACKTEST RULES". lint.js: NX_STRATEGY_ALERTCONDITION (should-fix). bench: strategy_honest_backtest
  (replaces the simpler breakout_strategy case). Preview simulator: qty, exits by id with qty_percent partial fills, openprofit.
- Main Brain: new TRADING DESK mode (backtest review checklist, position size maths for gold / forex, chart review, trading plan).

## 2026-10-24 · what makes premium indicators look premium (Ahmad: "the design is rubbish")
Sources: TradingView blog "Pine Script vertical gradients" (official: fill(plot1, plot2, top_value, bottom_value, top_color,
bottom_color), series arguments, the two plots act as a mask over the gradient); public descriptions of popular open scripts -
a gradient range tool (transparent range box, dashed mid line, candles colored by distance from the mid, tiny status label,
contrasting markers on extremes), trend-wave bands (solid main band + dashed secondary band, intensity fading with the age of
the trend, small circles at reversals, "restraint"), an order-block matrix (volume bars inside zones, brightness = relative
volume, edge label with the total, faded / dashed when mitigated, compact screener table), a visual library (solid core +
transparent glow, glow intensity tied to volatility, transparency tied to confidence, auto black / white text for contrast,
text gauges and star ratings inside table cells, named palettes).
Common thread: restraint; color carries information (strength -> intensity, age -> fading, direction -> hue); depth from
solid / dashed / faint layers; zones = translucent body + crisp border + dashed mid + tag and price at the right edge; signals
small, at the turn only, details in tooltips; status in a compact dashboard with gauges.
Where it went:
- New verified TEMPLATE design_kit ("Nexus Design Kit - Trend Cloud, Live Zones & Signals"): hero line + glow, vertical
  gradient cloud, candles by strength, Zone UDT with dashed mid line + right-edge price tag that fades with age and is deleted
  on a break, signal pills with tooltips, ■□ gauge dashboard. Checked by our compiler checks and the preview (not yet pasted
  into TradingView - first real paste is the check).
- knowledge.js DESIGN DIRECTOR rule 13: the design kit is THE LOOK REFERENCE for every tool + the principles above.
- Preview: gradient fills drawn with the stronger end at half strength (a bearish cloud was invisible before).

## 2026-10-24 (run 2) · volume profile: POC, value area, naked POCs, HVN / LVN
Sources: TradingView public script pages / tag listings for session, periodic and multi-mode volume profiles (public
descriptions only), TradingView Pine v6 manual "Limitations" (official: up to 200,000 intrabars via request.security_lower_tf
depending on plan, 100K on non-professional plans; 500 line / box / label IDs, 100 polylines; collections max 100,000 elements;
500 ms per loop per bar; 40 unique request.*() calls).
How the good ones work (ideas only):
- Rows (bins) over the period's range, ~25 by default; each bar's (or 1m intrabar's) volume spread evenly over the rows it
  touched, or all on the close row. POC = the fullest row; value area grown from the POC to 70% of the volume.
- Profiles cost ~rows + 1 boxes each, so the number of profiles is clamped to what fits in 500 boxes; drawn with bar_index
  so they do not drift on zoom; histogram anchored to one edge of the period, POC row widest, value area stronger.
- Levels traders actually use: POC, VAH / VAL, previous session levels and NAKED POCs (untouched) extended until hit;
  "In value / above / below" status; a buy / sell split by candle direction is a proxy, not real aggressor delta.
- Complaints: thin or missing old profiles (intrabar history limit), clutter from too many profiles, fake "delta",
  meaningless profiles on forex tick volume.
Where it went:
- knowledge.js: new "VOLUME PROFILE RULES" (rows + box budget, even spread, POC + 70% value area from the POC, bar_index
  drawing, naked POCs until touched, in-value status, proxy delta named honestly, time-at-price "TPO" fallback without volume).
- bench: session_volume_profile (replaces the simple vwap_bands case; VWAP is covered by the scalper case).
- Preview runner: request.security_lower_tf now returns arrays / tuples (chart bars stand in for intrabars, listed as approximate).
- Market report: previous week high / low (last completed week; the last week itself on a weekend) in the price data + prompt.

## 2026-10-25 (run 2) · alerts and automation: what traders expect from an indicator's alerts
Sources: TradingView Pine v6 FAQ "Alerts" (official), TradingView support "How to use a variable value in alert" (official
placeholder list), public docs of vendor alert systems and webhook relays (ideas only).
Facts (official):
- alertcondition(): indicators only (NO effect in a strategy), global scope, const message, placeholders filled; each one is a
  separate entry in the Create Alert dialog and counts toward the plot count and the user's alert limit.
- alert(): indicators and strategies, inside if blocks with freq (alert.freq_once_per_bar_close / _once_per_bar / _all),
  series message, but placeholders are NOT processed. All alert() calls = one entry "Any alert() function call" = one alert.
- Placeholders: {{ticker}} {{exchange}} {{close}} {{open}} {{high}} {{low}} {{volume}} {{time}} {{timenow}} {{interval}}
  {{syminfo.currency}} {{syminfo.basecurrency}} {{plot_0}}..{{plot_19}} {{plot("Name")}}; strategy: {{strategy.order.action}},
  {{strategy.order.price}}, {{strategy.order.alert_message}}, {{strategy.position_size}} ...
- More than 15 alerts in 3 minutes halts the script's alerts; a runtime error stops them; alerts are snapshots (recreate after
  changing inputs); no JSON helpers (build strings, double quotes); Telegram cannot receive TradingView webhooks directly.
What traders want: one alert for the whole tool (Any alert() call) with per-type on/off inputs, Buy / Sell / Strong / Exit / Trend
change types, once per bar close by default, JSON messages ready for bots (symbol, timeframe, side, price, stop), readable
Telegram / Discord messages. Complaints: alert limits used up by many alertconditions, "{{close}}" arriving literally, alerts
that fire then vanish (intrabar), floods.
Where it went:
- knowledge.js rule 8b (alert() facts, one-alert mode with per-type inputs, JSON strings, flood limit, recreate-after-change note).
- lint: NX_ALERT_PLACEHOLDER (must fix: {{...}} in alert(), inline or through a variable) and NX_STRATEGY_ALERTCONDITION (one
  repair attempt, never blocks). All 14 templates stay clean.
- bench: alert_webhook_json (Arabic: one Any-alert JSON message with per-type toggles; replaces the simple bb_reentry case).
- Brain: new /api/tv-alert webhook -> Ahmad's Telegram (secret TV_ALERT_KEY in the URL, 20 / min limit, repeats dropped,
  JSON shown as labelled Arabic lines, never trades).
- Market report: high-impact events from a public weekly calendar feed, converted to Sydney time in code (optional; search fallback).
