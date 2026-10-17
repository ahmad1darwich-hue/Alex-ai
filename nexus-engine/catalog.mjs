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
