// Catalog of verified Nexus templates. Source of truth for brain-app/api/_nexus/templates.js (run build.mjs).
// `use` is read by the model; `explain` is shown to the user when a template is delivered as-is.
export const CATALOG = [
  {
    id: "smc",
    src: "smc.pine",
    file: "nexus_smc.pine",
    title: { en: "Nexus SMC - Structure, Order Blocks, FVG & Liquidity", ar: "مؤشر SMC كامل" },
    use: "Smart Money Concepts / ICT / market structure: swing and internal BOS and CHoCH (one event per broken swing, line from the swing to the breaking bar), order blocks created on structure breaks with mitigation and a cap, fair value gaps with an ATR size filter and removal when filled, equal highs/lows, liquidity sweeps, bias table, alerts.",
    explain: {
      en: [
        "Draws market structure (BOS / CHoCH once per broken swing), order blocks, fair value gaps, equal highs/lows and liquidity sweeps.",
        "Zones stretch to the current bar and disappear once price trades through them, so the chart stays clean.",
        "Key settings: Swing length (bigger = fewer, stronger breaks), Keep last per side, Minimum FVG size.",
        "Alerts: BOS, CHoCH, new FVG, order block mitigated, liquidity sweep, equal highs/lows.",
        "Note: a swing is confirmed a few bars after it forms (the swing length), so structure lines appear with that delay and never move afterwards.",
      ],
      ar: [
        "بيرسم هيكل السوق (BOS و CHoCH مرّة وحدة لكل قمة/قاع بينكسر)، الـ Order Blocks، فجوات الـ FVG، القمم/القيعان المتساوية وسحب السيولة (Sweep).",
        "المناطق بتتمدّد لآخر شمعة وبتنمسح لحالها لما السعر يخترقها، فالشارت بيضل نضيف.",
        "أهم الإعدادات: Swing length (كل ما كبر، الكسور أقل وأقوى)، عدد المناطق المحفوظة لكل جهة، أقل حجم للـ FVG.",
        "التنبيهات: BOS، CHoCH، FVG جديد، اختراق Order Block، Sweep، قمم/قيعان متساوية.",
        "ملاحظة: القمة أو القاع بيتأكّد بعد كم شمعة (قدّ الـ Swing length)، فخطوط الهيكل بتظهر بهالتأخير وما بتتحرّك بعدها.",
      ],
    },
  },
  {
    id: "trend",
    src: "trend.pine",
    file: "nexus_trend.pine",
    title: { en: "Nexus Trend - EMA & ATR Trail", ar: "مؤشر اتجاه + تنبيه" },
    use: "Trend direction with three states (up / down / neutral): baseline EMA plus ATR trailing line (ta.supertrend), optional higher-timeframe agreement, trend-change markers printed once per new direction, optional bar coloring, alerts.",
    explain: {
      en: [
        "Shows the trend as up, down or neutral using an EMA baseline and an ATR trailing line.",
        "UP / DOWN is printed once, on the bar close where a new direction starts - not on every flip through neutral.",
        "Key settings: ATR trail multiplier (higher = fewer changes), Baseline EMA length, optional higher-timeframe agreement.",
        "Alerts: trend turned up, trend turned down, any change. Signals use closed bars only, so they do not repaint.",
      ],
      ar: [
        "بيحدّد الاتجاه: صاعد، هابط أو محايد، بالاعتماد على EMA أساسي وخط ATR متحرّك.",
        "علامة UP أو DOWN بتنطبع مرّة وحدة عند إغلاق الشمعة اللي بيبلّش فيها اتجاه جديد، مش كل ما مرق السعر بالمحايد.",
        "أهم الإعدادات: مضاعف الـ ATR (كل ما كبر، التغييرات أقل)، طول الـ EMA، وخيار اشتراط توافق الفريم الأعلى.",
        "التنبيهات: الاتجاه صار صاعد، صار هابط، أو أي تغيير. الإشارات على الشموع المغلقة بس، يعني بدون إعادة رسم.",
      ],
    },
  },
  {
    id: "signals",
    src: "signals.pine",
    file: "nexus_signals.pine",
    title: { en: "Nexus Signals - Buy/Sell with TP & SL", ar: "إشارات Buy/Sell مع أهداف ووقف" },
    use: "Buy / sell signal indicator: EMA cross entries with trend and RSI filters, a position state machine (one signal per leg), entry / stop / TP1-TP3 lines and labels for the active trade that freeze when hit, trade table, alertcondition plus dynamic alert() messages.",
    explain: {
      en: [
        "Prints BUY / SELL when the fast EMA crosses the slow EMA, filtered by the trend EMA and RSI.",
        "Each signal draws entry, stop (ATR based) and three targets (1R, 2R, 3R). Lines follow price and are marked when hit.",
        "Only one signal per move: it will not print BUY again while a long is open.",
        "Key settings: EMA lengths, Stop distance (x ATR), TP multiples, the two filters.",
        "Alerts: buy, sell, TP1-TP3 hit, stop hit. This is a tool, not a guarantee - test it on your market first.",
      ],
      ar: [
        "بيطبع BUY أو SELL لما الـ EMA السريع يقطع البطيء، مع فلتر اتجاه (EMA 200) وفلتر RSI.",
        "كل إشارة بترسم الدخول، الوقف (حسب الـ ATR) وثلاث أهداف (1R، 2R، 3R). الخطوط بتمشي مع السعر وبتتعلّم لما تنضرب.",
        "إشارة وحدة لكل حركة: ما بيرجع يطبع BUY وإنت أصلاً بصفقة شراء.",
        "أهم الإعدادات: أطوال الـ EMA، مسافة الوقف (x ATR)، مضاعفات الأهداف، والفلترين.",
        "التنبيهات: شراء، بيع، ضرب TP1 إلى TP3، ضرب الوقف. هاي أداة مش ضمان، جرّبها على سوقك أول.",
      ],
    },
  },
  {
    id: "sr",
    src: "sr.pine",
    file: "nexus_support_resistance.pine",
    title: { en: "Nexus Support & Resistance Zones", ar: "دعوم ومقاومات تلقائية" },
    use: "Automatic support and resistance zones: pivots merged into ATR-wide zones, touch counting, strongest zones kept (cap), color by position (support below price, resistance above), role flip on break and removal after a second break, tested / broken alerts.",
    explain: {
      en: [
        "Finds swing highs and lows, merges nearby ones into zones and counts how many times each zone was touched.",
        "Green zones are below price (support), red zones above (resistance). A zone that breaks flips role; broken twice, it is removed.",
        "Key settings: Pivot length, Zone half-height (x ATR), Maximum zones, minimum touches to show.",
        "Alerts: support tested, resistance tested, zone broken up, zone broken down.",
      ],
      ar: [
        "بيلقط القمم والقيعان، بيجمع القريبين من بعض بمنطقة وحدة، وبيعدّ كم مرّة انلمست كل منطقة.",
        "الأخضر تحت السعر (دعم) والأحمر فوقه (مقاومة). المنطقة اللي بتنكسر بتقلب دورها، وإذا انكسرت مرّتين بتنمسح.",
        "أهم الإعدادات: Pivot length، سماكة المنطقة (x ATR)، أقصى عدد مناطق، وأقل عدد لمسات للعرض.",
        "التنبيهات: اختبار دعم، اختبار مقاومة، كسر لفوق، كسر لتحت.",
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
    title: { en: "Nexus Sessions & Previous Levels", ar: "جلسات التداول ومستويات اليوم السابق" },
    use: "Session boxes (Asia / London / New York) built with time() and an IANA timezone, one box per session stretched while it runs, plus previous day and previous week high / low lines from a non-repainting tuple request, alerts on session start and on closes beyond the previous day's range.",
    explain: {
      en: [
        "Draws a box around each session (Asia, London, New York) and lines at the previous day's high and low.",
        "Session times follow the chosen timezone including daylight saving. Boxes are hidden on daily and higher charts.",
        "Key settings: timezone, session hours, which levels to show.",
        "Alerts: session started, close above the previous day high, close below the previous day low.",
      ],
      ar: [
        "بيرسم مربّع حول كل جلسة (آسيا، لندن، نيويورك) وخطوط على قمة وقاع اليوم السابق.",
        "أوقات الجلسات بتمشي على المنطقة الزمنية اللي بتختارها مع التوقيت الصيفي. المربّعات بتختفي على اليومي وما فوق.",
        "أهم الإعدادات: المنطقة الزمنية، ساعات كل جلسة، وأي مستويات تنعرض.",
        "التنبيهات: بداية جلسة، إغلاق فوق قمة اليوم السابق، إغلاق تحت قاعه.",
      ],
    },
  },
  {
    id: "rsi_div",
    src: "rsi_divergence.pine",
    file: "nexus_rsi_divergence.pine",
    title: { en: "Nexus RSI Divergence", ar: "دايفرجنس RSI" },
    use: "Oscillator pane (overlay = false): RSI with levels and fill, regular and hidden divergences detected on RSI pivots with min / max distance, lines between the two RSI pivots and a label on the second, alerts per divergence type.",
    explain: {
      en: [
        "RSI in its own pane, with lines drawn between two RSI pivots when price and RSI disagree (divergence).",
        "Regular divergences are on by default; hidden ones can be enabled.",
        "Key settings: RSI length, Pivot length, minimum and maximum bars between the two pivots.",
        "Alerts: bullish and bearish divergence (regular and hidden). A divergence is confirmed a few bars after the pivot (the pivot length).",
      ],
      ar: [
        "RSI بنافذة لحالو، وبيرسم خط بين قمتين أو قاعين للـ RSI لما السعر والـ RSI يختلفوا (دايفرجنس).",
        "الدايفرجنس العادي شغّال تلقائياً، والمخفي بتفعّله من الإعدادات.",
        "أهم الإعدادات: طول الـ RSI، Pivot length، وأقل وأكثر عدد شموع بين النقطتين.",
        "التنبيهات: دايفرجنس صاعد وهابط (عادي ومخفي). التأكيد بيجي بعد كم شمعة من تشكّل النقطة.",
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
