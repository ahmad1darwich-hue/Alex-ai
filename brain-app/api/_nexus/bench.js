// Benchmark cases for the daily self-check (api/daily.js). A few run every day, in rotation, through the same
// pipeline that serves users; the result is the first thing the daily improvement run looks at.
//
// `expect` lists regular expressions the delivered script must match (strings, applied with the "i" flag) and
// `overlay` says where the script belongs. A case passes when the checker verified the script and every
// expectation holds. Add a case for every kind of request that failed for a real user; keep the list balanced
// between Arabic and English and between the template kinds (SMC, trend, signals, S/R, scalping, MTF, sessions,
// divergence, strategy) and free-form ideas.

export const BENCH = [
  { id: "rsi_ema_alert", lang: "ar", text: "مؤشر يعطي إشارة شراء لما RSI يطلع فوق 30 والسعر فوق EMA 200، وإشارة بيع لما RSI ينزل تحت 70 والسعر تحت EMA 200، مع تنبيهات", expect: ["ta\\.rsi\\(", "ta\\.ema\\(", "alertcondition\\(", "ta\\.crossover\\(|ta\\.crossunder\\("], overlay: true },
  { id: "ny_first_hour", lang: "en", text: "Draw the high and low of the first hour of the New York session as two lines that extend through the day, and alert me when price closes above the high or below the low", expect: ["time\\(", "America/New_York", "alertcondition\\(", "line\\.new\\(|box\\.new\\(|plot\\("], overlay: true },
  { id: "bb_reentry", lang: "ar", text: "بولنجر باند 20/2 مع سهم لما الشمعة تسكّر برّا الباند وبعدها ترجع تسكّر جوّا، مع تنبيه", expect: ["ta\\.bb\\(", "plotshape\\(|label\\.new\\(", "alertcondition\\("], overlay: true },
  { id: "vwap_bands", lang: "en", text: "VWAP with two standard-deviation bands and a background colored by whether price is above or below VWAP", expect: ["ta\\.vwap\\(", "bgcolor\\("], overlay: true },
  { id: "order_blocks", lang: "ar", text: "مؤشر order blocks بسيط: يرسم آخر ٣ order blocks صاعدة وآخر ٣ هابطة كبوكسات تتمدّد لآخر شمعة وتنمسح لما السعر يخترقها، مع تنبيه عند الدخول ببلوك", expect: ["box\\.new\\(", "array\\.", "\\.delete\\(", "alertcondition\\("], overlay: true },
  { id: "supertrend_ema_tpsl", lang: "en", text: "Supertrend with an EMA 100 filter: a buy only when the supertrend turns up while price is above the EMA, a sell when it turns down below the EMA, with stop and take-profit labels based on ATR and alerts", expect: ["ta\\.supertrend\\(", "ta\\.atr\\(", "alertcondition\\(", "label\\.new\\(|plotshape\\("], overlay: true },
  { id: "mtf_table", lang: "ar", text: "جدول بزاوية الشارت فيه اتجاه ٤ فريمات (15 دقيقة، ساعة، ٤ ساعات، يومي) حسب EMA 50 و EMA 200، أخضر صاعد وأحمر هابط", expect: ["table\\.new\\(", "request\\.security\\(", "barstate\\.islast"], overlay: true },
  { id: "macd_divergence", lang: "en", text: "MACD histogram in its own pane with regular bullish and bearish divergence detection against price, lines on the histogram and alerts", expect: ["ta\\.macd\\(", "ta\\.pivothigh\\(|ta\\.pivotlow\\(", "line\\.new\\(", "alertcondition\\(", "overlay\\s*=\\s*false"], overlay: false },
  { id: "breakout_strategy", lang: "ar", text: "ستراتيجي باك-تست: دخول شراء عند إغلاق فوق أعلى قمة بآخر ٢٠ شمعة، وقف ATR × 1.5، هدف 2R، مخاطرة 1% من الرصيد، وبيع بالعكس", expect: ["strategy\\(", "strategy\\.entry\\(", "strategy\\.exit\\(", "ta\\.atr\\(", "ta\\.highest\\("], overlay: true },
  { id: "engulfing_filtered", lang: "en", text: "Bullish and bearish engulfing signals only at a recent swing low or high, with a minimum candle size filter in ATR, a cooldown input between signals, and alerts", expect: ["input\\.", "ta\\.atr\\(", "ta\\.lowest\\(|ta\\.highest\\(", "alertcondition\\("], overlay: true },
  { id: "auto_sr", lang: "ar", text: "خطوط دعم ومقاومة تلقائية من البيفوتات، تتمدّد لليمين، وتنمسح لما تنكسر بإغلاق، مع تنبيه عند الكسر", expect: ["ta\\.pivothigh\\(", "ta\\.pivotlow\\(", "line\\.new\\(|box\\.new\\(", "\\.delete\\(", "alertcondition\\("], overlay: true },
  { id: "session_boxes", lang: "en", text: "Session boxes for Asia, London and New York showing each session's high and low, plus the previous day high and low as dotted lines", expect: ["box\\.new\\(", "time\\(", "request\\.security\\(|ta\\.highest\\(", "line\\.new\\("], overlay: true },
  { id: "fib_last_swing", lang: "en", text: "Auto Fibonacci retracement of the last confirmed swing (pivot high to pivot low or the reverse): levels 0.382, 0.5, 0.618 and 0.786 as lines extending right with price labels, redrawn when a new swing forms", expect: ["ta\\.pivothigh\\(", "ta\\.pivotlow\\(", "line\\.new\\(|line\\.set_", "label\\.new\\(|label\\.set_", "0\\.618"], overlay: true },
  { id: "htf_opens_intraday", lang: "ar", text: "خطوط افتتاح اليوم والأسبوع والشهر، تظهر بس على الفريمات الأصغر من اليومي، مع ليبل سعر لكل خط", expect: ["request\\.security\\(|timeframe\\.change\\(", "timeframe\\.isintraday|timeframe\\.in_seconds\\(", "line\\.new\\(|line\\.set_|plot\\(", "label\\.new\\(|label\\.set_"], overlay: true },
  { id: "fvg_boxes", lang: "en", text: "Fair value gaps: draw bullish and bearish FVG boxes (3-candle imbalance, minimum size in ATR), extend them right until price fills them, then delete them; keep at most 10 of each and alert when a new FVG forms", expect: ["box\\.new\\(", "ta\\.atr\\(", "array\\.", "\\.delete\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "pdh_pdl_sweep", lang: "ar", text: "مؤشر سيولة: ارسم أعلى وأدنى اليوم السابق، وحط إشارة لما السعر يكسر أحدهم بذيل ويسكّر راجع جوّا (sweep) مع تنبيه", expect: ["request\\.security\\(", "line\\.new\\(|plot\\(", "plotshape\\(|label\\.new\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "gold_killzones", lang: "ar", text: "مؤشر كِل زونز للذهب: لندن ونيويورك كمربّعات، قمة وقاع آسيا يضلّوا خطوط سيولة لحتى ينضربوا، وحط SWEEP لما السعر يضربهم بذيل ويسكّر راجع، مع جدول فيه مدى اليوم مقارنة بالـ ADR وتنبيهات", expect: ["time\\(", "America/New_York|tzInput|timezone", "box\\.new\\(", "line\\.new\\(", "table\\.new\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "stoch_hidden_div", lang: "ar", text: "ستوكاستيك RSI بنافذة لحالو، يكشف الدايفرجنس المخفي (استمرار الترند) والعادي، يرسم الخطوط على المؤشر وعلى شارت السعر كمان، مع فلتر أقل فرق بين القمتين وتنبيهات", expect: ["ta\\.stoch\\(", "ta\\.pivothigh\\(|ta\\.pivotlow\\(", "force_overlay\\s*=\\s*true", "line\\.new\\(", "alertcondition\\(", "overlay\\s*=\\s*false"], overlay: false },
  { id: "trend_chop_filter", lang: "ar", text: "مؤشر ترند للذهب على الربع ساعة: ريبون EMA وخط تريلنغ ATR، بس ما يقلب الاتجاه بالتذبذب (فلتر efficiency أو ADX)، إشارة BUY/SELL مرّة وحدة لكل اتجاه، وجدول فيه حالة السوق (ترند نظيف أو تذبذب) ونسبة نجاح الإشارات، مع تنبيهات", expect: ["ta\\.ema\\(", "ta\\.atr\\(", "math\\.sum\\(|ta\\.adx|ta\\.dmi\\(|efficien", "table\\.new\\(", "label\\.new\\(|plotshape\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "sr_flip_retest", lang: "en", text: "Support and resistance zones from swing pivots with a strength score (touches and freshness), a zone flips from resistance to support only after a full-body close through it, mark the first retest of a flipped zone with a signal and a stop beyond the zone, a dashboard with the nearest support and resistance, and alerts", expect: ["ta\\.pivothigh\\(", "ta\\.pivotlow\\(", "box\\.new\\(", "table\\.new\\(", "label\\.new\\(|plotshape\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "fvg_inversion_breaker", lang: "ar", text: "مؤشر SMC للذهب: فجوات FVG مع خط المنتصف (CE)، لما السعر يسكّر من خلال الفجوة تنقلب لـ IFVG بالاتجاه المعاكس، والـ order block اللي ينكسر بإغلاق يصير breaker block متقطّع، أقوى منطقة طلب وعرض بالجدول مع المسافة بالـ ATR، وتنبيهات", expect: ["box\\.new\\(", "ta\\.atr\\(", "IFVG|inver", "breaker|BRK", "table\\.new\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "signal_confluence_manager", lang: "ar", text: "مؤشر إشارات شراء وبيع للذهب على الساعة: تقاطع EMA بس مع تقييم من 5 (اتجاه، RSI، ADX، فوليوم، فريم أعلى)، ما يدخل إذا السعر بعيد كتير عن المتوسط، وقف تحت آخر قاع وثلاث أهداف بالـ R، بعد الهدف الأول الوقف ينتقل للدخول وبعد التاني يصير متحرك، وجدول فيه نسبة النجاح ومجموع الـ R، مع تنبيهات", expect: ["ta\\.ema\\(", "ta\\.dmi\\(|ta\\.adx|adx", "ta\\.lowest\\(|ta\\.pivotlow\\(", "box\\.new\\(", "table\\.new\\(", "alertcondition\\(|alert\\("], overlay: true },
  { id: "scalper_vwap_chop_shield", lang: "ar", text: "بدي مؤشر سكالبينغ للذهب على الدقيقة والخمس دقايق: VWAP يومي مع حزم انحراف، فلتر يمنع الدخول وقت السوق متذبذب أو هادي، دخول مع الترند بعد تصحيح لخط EMA ومع RSI قصير، وارتداد من الحزمة بس وقت التذبذب، ستوب ورا آخر قاع مع هامش سبريد، نص الصفقة عالهدف الأول والستوب عالدخول، ووقف زمني، وجدول بالنتائج بالـ R وتنبيهات", expect: ["vwap", "ta\\.ema\\(", "ta\\.rsi\\(", "ta\\.lowest\\(|ta\\.pivotlow\\(", "table\\.new\\(", "alertcondition\\(|alert\\("], overlay: true },
];

export const PER_RUN = 3;

// The cases for a given day: a sliding window over the list, so every case runs every few days.
export function casesFor(dayIndex, perRun = PER_RUN) {
  const out = [];
  const start = (dayIndex * perRun) % BENCH.length;
  for (let i = 0; i < Math.min(perRun, BENCH.length); i++) out.push(BENCH[(start + i) % BENCH.length]);
  return out;
}

// Judges one delivered result. Returns { pass, verified, expectFailed, lines, inputs }.
export function judge(c, result) {
  const code = result && result.kind === "script" ? String(result.code || "") : "";
  const verified = !!(result && result.report && result.report.verified);
  const expectFailed = [];
  for (const re of c.expect || []) { if (!new RegExp(re, "i").test(code)) expectFailed.push(re); }
  if (c.overlay === false && !/overlay\s*=\s*false/i.test(code)) { if (!expectFailed.includes("overlay = false")) expectFailed.push("overlay = false"); }
  if (c.overlay === true && /overlay\s*=\s*false/i.test(code)) expectFailed.push("overlay = true");
  const lines = code ? code.replace(/\n$/, "").split("\n").length : 0;
  const inputs = (code.match(/\binput\.\w+\(/g) || []).length;
  if (code && inputs < 2) expectFailed.push("at least 2 inputs");
  if (lines > 700) expectFailed.push("at most 700 lines");
  return { pass: verified && expectFailed.length === 0, verified, expectFailed, lines, inputs };
}
