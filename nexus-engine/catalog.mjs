// Catalog of verified Nexus templates. Source of truth for brain-app/api/_nexus/templates.js (run build.mjs).
// `use` is read by the model; `explain` is shown to the user when a template is delivered as-is.
export const CATALOG = [
  {
    id: "smc",
    src: "smc.pine",
    file: "nexus_smc.pine",
    title: { en: "Nexus SMC - Structure, Zone Engine & Liquidity", ar: "مؤشر SMC احترافي: هيكل + مناطق + سيولة" },
    use: "Premium Smart Money Concepts / ICT tool on the design system: theme input, auto swing length per timeframe, swing (solid) and internal (dashed) BOS / CHoCH once per broken swing, strong/weak high and low, order blocks from the extreme of the breaking leg kept only with ATR displacement and scored (displacement, FVG in the leg, CHoCH), life cycle fresh -> tested (dashed, touch count) -> breaker block (flipped) -> removed, FVGs with ATR size filter, CE midline, Full or Half (CE) fill and inversion gaps (IFVG), higher-timeframe bias + HTF FVGs from closed HTF bars, equal highs/lows, sweeps, premium/discount, zones to the right edge, Present/Historical mode, dashboard (swing/internal/HTF bias, price in range, nearest supply/demand in ATR, live zones, order-block track record), alerts.",
    explain: {
      en: [
        "Market structure (BOS / CHoCH once per broken swing; internal structure dashed) with the Strong / Weak high and low of the current swing.",
        "Order blocks are kept only when the move that broke structure left them with force (displacement in ATR) and carry a quality score; a block closed through becomes a dashed breaker block.",
        "Fair value gaps with a midpoint (CE) line; a gap closed through flips into an inversion gap (IFVG). Higher-timeframe gaps are drawn with a dashed purple outline.",
        "Dashboard: swing / internal / HTF bias, premium or discount, nearest supply and demand in ATR, live zones and how often a fresh order block held on its first touch.",
        "Key settings: Auto settings, Displacement (x ATR), Keep last per side, FVG Filled when, HTF timeframe, Theme, Present / Historical.",
        "Note: a swing is confirmed a few bars after it forms (the swing length), so structure lines appear with that delay and never move afterwards; HTF data uses closed HTF bars only.",
      ],
      ar: [
        "هيكل السوق (BOS و CHoCH مرّة وحدة لكل قمة/قاع بينكسر، والهيكل الداخلي متقطّع) مع القمة/القاع القوي والضعيف للموجة الحالية.",
        "الـ Order Block بينحفظ بس إذا الحركة اللي كسرت الهيكل طلعت منه بقوّة (Displacement بالـ ATR) وعليه علامة جودة؛ إذا السعر سكّر من خلاله بيصير Breaker Block متقطّع.",
        "فجوات FVG مع خط المنتصف (CE)؛ الفجوة اللي السعر بيسكّر من خلالها بتنقلب لـ IFVG. فجوات الفريم الأكبر مرسومة بإطار بنفسجي متقطّع.",
        "الجدول: اتجاه الهيكل الكبير والداخلي والفريم الأكبر، السعر بالـ Premium ولا Discount، أقرب عرض وطلب بالـ ATR، عدد المناطق، وكم مرّة الـ Order Block صمد بأوّل لمسة.",
        "أهم الإعدادات: Auto settings، الـ Displacement، عدد المناطق لكل جهة، طريقة امتلاء الـ FVG، فريم الـ HTF، الثيم، Present / Historical.",
        "ملاحظة: القمة أو القاع بيتأكّد بعد كم شمعة (قدّ الـ Swing length)، فخطوط الهيكل بتظهر بهالتأخير وما بتتحرّك بعدها؛ بيانات الفريم الأكبر من شموع مسكّرة بس.",
      ],
    },
  },
  {
    id: "trend",
    src: "trend.pine",
    file: "nexus_trend.pine",
    title: { en: "Nexus Trend - Adaptive Ribbon & Trail", ar: "مؤشر ترند ذكي: ريبون + تريلنغ + فلتر تذبذب" },
    use: "Premium trend tool on the design system: theme input, auto lengths per timeframe, EMA ribbon (stacked / knot, spread in ATR, gradient fill), ATR trail that freezes in noisy markets (efficiency ratio) with a whipsaw shield (flip needs a close beyond trail + margin, blocked pokes counted), graded A/B BUY/SELL labels that alternate, trade plan for the last signal (SL, 1R, 2R, risk/reward boxes), track record + regime dashboard, optional HTF agreement, candle colors by trend quality, alerts incl. grade A.",
    explain: {
      en: [
        "Shows the trend with an EMA ribbon and an ATR trail, and tells a clean trend from chop (efficiency ratio): in noisy markets the trail holds still and candles turn gray.",
        "The trend flips only on a close clearly beyond the trail (whipsaw shield); BUY / SELL prints once per new direction, graded A (clean trend + ribbon agrees) or B.",
        "The last signal gets a trade plan: stop at the trail, 1R and 2R. The dashboard shows trend, regime, ribbon, last signal, hit rate and how many whipsaws were blocked.",
        "Auto settings adapt the lengths to the timeframe; signals use closed bars only, so they do not repaint. Switch the look with Theme in Settings.",
      ],
      ar: [
        "بيبيّن الترند بريبون EMA وخط تريلنغ ATR، وبيفرّق بين ترند نظيف وتذبذب: بالتذبذب الخط بيوقف مكانه والشموع بتصير رمادية.",
        "الاتجاه ما بيقلب إلا بإغلاق واضح ورا الخط (درع ضد الخبطات)، و BUY أو SELL بتطلع مرّة وحدة لكل اتجاه، بدرجة A (ترند نظيف والريبون موافق) أو B.",
        "آخر إشارة إلها خطة: وقف عند الخط، هدف 1R و 2R. والجدول فيه الاتجاه، حالة السوق، الريبون، آخر إشارة، نسبة النجاح وكم خبطة انمنعت.",
        "الإعدادات التلقائية بتتأقلم مع الفريم، والإشارات على الشموع المغلقة بس يعني بدون إعادة رسم. غيّر الشكل من Theme بالإعدادات.",
      ],
    },
  },
  {
    id: "signals",
    src: "signals.pine",
    file: "nexus_signals.pine",
    title: { en: "Nexus Signals - Confluence Entries & Trade Manager", ar: "إشارات Buy/Sell مع تقييم وإدارة صفقة" },
    use: "Signal + trade manager on the design system: EMA cross (auto lengths per timeframe) scored 0-5 on confluence (trend EMA side, RSI side, ADX strength, volume vs average skipped on symbols without volume, closed-bar HTF agreement), grade A/B with an A-only input, cooldown and a late-entry veto (too far from the slow EMA, counted), swing or ATR stop clamped between min/max ATR, TP1-TP3 in R with scale-out thirds, stop to break-even after TP1 and ratchet ATR trail after TP2, exit on opposite signal, the LAST plan only (risk/reward boxes, entry/stop/TP lines to the right edge, TP/SL/BE marks, frozen when finished), dashboard with position, confluence, open R, targets, stop mode, trades + win %, total and average R, late skips; alerts incl. grade A and break-even.",
    explain: {
      en: [
        "Prints ▲ BUY / ▼ SELL when the fast EMA crosses the slow EMA, but only when enough checks agree: trend, RSI, ADX strength, volume and the higher timeframe (score out of 5, grade A or B).",
        "Skips late entries when price is already stretched far from the slow EMA, and keeps a minimum gap between signals.",
        "Each signal draws one trade plan: stop beyond the recent swing (or ATR), three targets in R and risk/reward boxes. After TP1 the stop moves to entry, after TP2 it trails.",
        "The dashboard shows the open trade, the open result in R, and the real track record: trades, win rate, total and average R.",
        "Alerts: buy, sell, grade A, TP1-TP3, stop, break-even. Signals use closed bars only (no repainting). This is a tool, not a guarantee - test it on your market first.",
      ],
      ar: [
        "بيطبع ▲ BUY أو ▼ SELL لما الـ EMA السريع يقطع البطيء، بس إذا أغلب الفلاتر موافقة: الاتجاه، الـ RSI، قوة الـ ADX، الفوليوم والفريم الأعلى (تقييم من 5، درجة A أو B).",
        "بيتجاهل الدخول المتأخر لما السعر يكون بعيد كتير عن الـ EMA البطيء، وفي حد أدنى من الشموع بين كل إشارة والتانية.",
        "كل إشارة إلها خطة وحدة: وقف ورا آخر قاع أو قمة (أو حسب الـ ATR)، تلات أهداف بالـ R ومربعات الربح والخسارة. بعد TP1 الوقف بينتقل للدخول، وبعد TP2 بصير متحرّك.",
        "الجدول بيورجيك الصفقة المفتوحة، النتيجة الحالية بالـ R، وسجل الأداء الحقيقي: عدد الصفقات، نسبة النجاح، مجموع ومتوسط الـ R.",
        "التنبيهات: شراء، بيع، درجة A، TP1 لـ TP3، الوقف، ونقل الوقف للدخول. الإشارات على شموع مغلقة بس (بدون إعادة رسم). هاي أداة مش ضمان، جرّبها على سوقك أول.",
      ],
    },
  },
  {
    id: "sr",
    src: "sr.pine",
    file: "nexus_support_resistance.pine",
    title: { en: "Nexus S/R - Strength Zones & Role Flips", ar: "دعوم ومقاومات بقوّة وقلب أدوار" },
    use: "Pro support/resistance zones on the design system: confirmed pivots (auto length per timeframe) built wick-to-body and clamped in ATR, merged into zones that count independent visits, strength score 0-100 (touches, freshness decay, HTF swing confluence), full-body break rule, role flip only for zones with history, first-retest signals with stop 0.5 ATR beyond the zone and a retest track record, failed flips removed, Present/Historical mode, zones to the right edge with strength-graded fills, nearest S/R dashboard with ATR distance, alerts for tests, breaks and retests.",
    explain: {
      en: [
        "Finds confirmed swings and builds each zone from the swing's wick to its body, merging nearby swings and counting separate visits.",
        "Every zone shows S/R, touches and a strength score (touches + freshness + higher-timeframe confluence); stronger zones have bolder fills.",
        "A zone with history that breaks with a full-body close flips role (dashed); the first return that rejects it prints ▲/▼ RETEST with a stop beyond the zone. Broken back = failed flip, removed.",
        "Dashboard: nearest resistance and support with distance in ATR, strongest zone, flips and the retest hit rate. Alerts: tested, broken, retest.",
      ],
      ar: [
        "بيلقط القمم والقيعان المؤكّدة وبيبني كل منطقة من ذيل الشمعة لجسمها، بيجمع القريبين وبيعدّ الزيارات المنفصلة.",
        "كل منطقة مكتوب عليها دعم/مقاومة، عدد اللمسات، ودرجة قوّة (لمسات + جدّة + توافق مع فريم أعلى)؛ الأقوى لونها أوضح.",
        "المنطقة اللي إلها تاريخ وبتنكسر بإغلاق جسم كامل بتقلب دورها (حدود متقطّعة)، وأوّل رجعة بترفضها بتطلع ▲/▼ RETEST مع ستوب ورا المنطقة. إذا انكسرت عكسي بتنمسح (قلب فاشل).",
        "الجدول: أقرب مقاومة وأقرب دعم مع المسافة بالـ ATR، أقوى منطقة، عدد القلبات ونسبة نجاح الريتست. تنبيهات: اختبار، كسر، ريتست.",
      ],
    },
  },
  {
    id: "scalper",
    src: "scalper.pine",
    file: "nexus_scalper.pine",
    title: { en: "Nexus Scalper - Momentum Entries", ar: "سكالبينغ / زخم" },
    use: "Scalping on 1m-15m: trend from two EMAs, entry when RSI pulls back and crosses 50 again with a strong candle, optional volume filter that is skipped when the symbol has no volume, ATR quiet-market filter, optional session filter with timezone, cooldown between signals, quick stop/target lines for the latest signal, alerts.",
    explain: {
      en: [
        "Made for 1m-15m charts: waits for a pullback inside the trend, then signals when momentum (RSI) turns back with a strong candle.",
        "Filters: volume above average (skipped automatically on symbols without volume, such as some forex feeds), quiet-market filter, optional session hours.",
        "A minimum number of bars between signals keeps the chart from filling with arrows. Stop and target of the latest signal are drawn.",
        "Key settings: EMA lengths, Pullback level, Minimum bars between signals, Stop / Target (x ATR). Alerts: scalp buy, scalp sell.",
      ],
      ar: [
        "معمول لفريمات 1 إلى 15 دقيقة: بيستنّى تصحيح جوّا الاتجاه، وبيعطي إشارة لما الزخم (RSI) يرجع مع شمعة قوية.",
        "الفلاتر: حجم فوق المتوسط (بيتخطّاه لحالو إذا الرمز ما فيه حجم، متل بعض أزواج الفوركس)، فلتر السوق الهادي، وساعات جلسة اختيارية.",
        "في حدّ أدنى للشموع بين الإشارات حتى ما يتعبّى الشارت أسهم. وبيرسم وقف وهدف آخر إشارة.",
        "أهم الإعدادات: أطوال الـ EMA، مستوى التصحيح، أقل شموع بين الإشارات، الوقف والهدف (x ATR). التنبيهات: شراء وبيع.",
      ],
    },
  },
  {
    id: "mtf",
    src: "mtf_dashboard.pine",
    file: "nexus_mtf_dashboard.pine",
    title: { en: "Nexus MTF Trend Dashboard", ar: "جدول اتجاه متعدّد الفريمات" },
    use: "Multi-timeframe trend table: four request.security() calls using the non-repainting pattern (expression[1] with lookahead_on), per-timeframe bullish / bearish / neutral cells, overall bias row, table position and size inputs, bias-change alerts.",
    explain: {
      en: [
        "A small table showing the trend on four timeframes and the overall bias.",
        "Each row uses the last closed bar of that timeframe, so the table does not repaint.",
        "Key settings: the four timeframes, the EMA lengths of the trend rule, table position and text size.",
        "Alerts: bias turned bullish, bias turned bearish.",
      ],
      ar: [
        "جدول صغير بيعرض الاتجاه على أربع فريمات والميل العام.",
        "كل سطر بيعتمد على آخر شمعة مغلقة بفريمه، فالجدول ما بيعيد رسم.",
        "أهم الإعدادات: الفريمات الأربعة، أطوال الـ EMA لقاعدة الاتجاه، مكان الجدول وحجم الخط.",
        "التنبيهات: الميل صار صاعد، الميل صار هابط.",
      ],
    },
  },
  {
    id: "sessions",
    src: "sessions.pine",
    file: "nexus_sessions.pine",
    title: { en: "Nexus Sessions & Kill Zones", ar: "جلسات التداول والكِل زونز" },
    use: "Kill-zone boxes (Asia / London / NY AM / NY PM) built with time() and an IANA timezone (DST-safe), one box per session stretched while it runs with range text and a 50% midline; finished sessions leave their high/low as liquidity lines (array of UDT objects, capped) that end when traded through and mark a SWEEP when the bar closes back inside; previous day/week levels from a non-repainting tuple request; ADR vs today's range; themed dashboard (Theme input) and alerts for kill-zone start, session high/low sweeps and PDH/PDL breaks. Hidden above a chosen timeframe.",
    explain: {
      en: [
        "Draws each kill zone (Asia, London, New York AM, optional New York PM) as a box with its range and a 50% line.",
        "When a session ends, its high and low stay on the chart as liquidity lines until price takes them; a wick through with a close back inside is marked SWEEP.",
        "Dashboard: current session, Asia range, today's range against the average daily range (ADR), distance to the previous day high/low.",
        "Key settings: timezone (follows daylight saving), session hours, Theme, how many liquidity levels to keep. Hidden above 1h by default.",
        "Alerts: kill zone started, session high or low swept, close above PDH / below PDL.",
      ],
      ar: [
        "بيرسم كل كِل زون (آسيا، لندن، نيويورك الصبح، ونيويورك بعد الظهر اختياري) كمربّع عليه مدى الجلسة وخط النص 50%.",
        "لما تخلص الجلسة، قمتها وقاعها بيضلّوا خطوط سيولة لحتى السعر ياخدهم؛ إذا ضرب بذيل وسكّر راجع جوّا بينكتب SWEEP.",
        "الجدول: الجلسة الحالية، مدى آسيا، مدى اليوم مقارنة بمتوسط المدى اليومي (ADR)، والبعد عن قمة وقاع اليوم السابق.",
        "أهم الإعدادات: المنطقة الزمنية (بتمشي مع التوقيت الصيفي)، ساعات الجلسات، الثيم، وكم مستوى سيولة ينحفظ. بيختفي فوق فريم الساعة افتراضياً.",
        "التنبيهات: بداية كِل زون، سويب لقمة أو قاع جلسة، إغلاق فوق قمة اليوم السابق أو تحت قاعه.",
      ],
    },
  },
  {
    id: "rsi_div",
    src: "rsi_divergence.pine",
    file: "nexus_rsi_divergence.pine",
    title: { en: "Nexus RSI Divergence", ar: "دايفرجنس RSI" },
    use: "Oscillator pane (overlay = false), full design system: Theme input, gradient RSI line with glow, OB/OS heat fills, auto RSI / pivot lengths per timeframe. Regular and hidden divergences on confirmed RSI pivots (price extreme within one bar, min / max distance, minimum RSI difference), drawn in the pane and on the price chart (force_overlay), track record (hits / fails / hit rate in ATR) in a dashboard, alerts per type.",
    explain: {
      en: [
        "RSI in its own pane with a gradient line and heat when it is overbought or oversold; divergences are drawn in the pane AND on the price chart (▲ DIV / ▼ DIV).",
        "Regular divergences are on by default; hidden (continuation) ones can be enabled. Flat ones are filtered by a minimum RSI difference.",
        "Auto settings pick the RSI and pivot length from your timeframe. The dashboard shows RSI, zone, the last divergence and its track record (hit = 1 ATR in its direction first).",
        "Alerts: bullish and bearish divergence (regular and hidden). A divergence is confirmed a few bars after the pivot (the pivot length) - it never repaints.",
      ],
      ar: [
        "RSI بنافذة لحالو بخط متدرّج اللون وتلوين لما يكون تشبّع شراء أو بيع، والدايفرجنس بينرسم بالنافذة وكمان على شارت السعر (▲ DIV / ▼ DIV).",
        "الدايفرجنس العادي شغّال تلقائياً، والمخفي (استمرار الترند) بتفعّله من الإعدادات. والدايفرجنس الضعيف بينفلتر بأقل فرق بالـ RSI.",
        "الإعدادات التلقائية بتختار طول الـ RSI والبيفوت حسب الفريم. الجدول بيعرض قيمة الـ RSI، المنطقة، آخر دايفرجنس وسجلّه (نجح = تحرّك 1 ATR باتجاهه أول).",
        "التنبيهات: دايفرجنس صاعد وهابط (عادي ومخفي). التأكيد بيجي بعد كم شمعة من تشكّل النقطة، وما بيعيد الرسم.",
      ],
    },
  },
  {
    id: "strategy",
    src: "strategy.pine",
    file: "nexus_strategy_template.pine",
    title: { en: "Nexus Strategy Template - EMA Cross with ATR Risk", ar: "قالب ستراتيجي للباك-تست" },
    use: "strategy() skeleton for backtests: realistic commission and slippage, entries on EMA cross, position size from risk percent and ATR stop distance, bracket exit with stop and limit prices via strategy.exit, direction filter, backtest start date. Use it to convert any signal logic into a strategy.",
    explain: {
      en: [
        "A backtest-ready strategy: enters on an EMA cross, risks a fixed percent of equity per trade, exits at an ATR stop or a reward:risk target.",
        "Commission and slippage are included so results are not flattering by default.",
        "Key settings: Risk per trade, Stop distance (x ATR), Reward : risk, trade direction, backtest start.",
        "Open TradingView's Strategy Tester to see results. Past results do not predict future performance.",
      ],
      ar: [
        "ستراتيجي جاهزة للباك-تست: بتدخل عند تقاطع EMA، بتخاطر بنسبة ثابتة من الرصيد بكل صفقة، وبتطلع على وقف ATR أو هدف بنسبة عائد/مخاطرة.",
        "العمولة والانزلاق محسوبين حتى ما تطلع النتائج أحلى من الواقع.",
        "أهم الإعدادات: المخاطرة لكل صفقة، مسافة الوقف (x ATR)، نسبة العائد للمخاطرة، اتجاه التداول، تاريخ بداية الاختبار.",
        "افتح Strategy Tester بـ TradingView لتشوف النتائج. نتائج الماضي ما بتضمن المستقبل.",
      ],
    },
  },
];
