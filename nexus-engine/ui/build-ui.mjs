// Builds the pages that host the Nexus app from the shared sources in this folder.
//   node nexus-engine/ui/build-ui.mjs   -> indicator-build/index.html + indicator-build/vercel.json (public Nexus site),
//                                          brain-app/indicators.html (Brain Indicators),
//                                          brain-app/nexus-next.html (staging page, talks to /api/nexus)
// `render()` returns the same files without writing them (used by tests/ui.test.mjs to detect stale pages).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../catalog.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");
export const BRAIN_ORIGIN = "https://brain-ahmad-93cb.vercel.app";
const FONTS = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
const ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#34e39b"/><path d="M12 34c6-14 12-14 20 0s14 14 20 0" fill="none" stroke="#042016" stroke-width="6" stroke-linecap="round"/></svg>');

// Card texts for the template gallery (ids must exist in ../catalog.mjs).
const CARDS = {
  smc: { icon: "📦", name: { ar: "SMC كامل", en: "Full SMC" }, blurb: { ar: "هيكل السوق، Order Blocks، FVG وسيولة", en: "Structure, order blocks, FVG, liquidity" } },
  trend: { icon: "📈", name: { ar: "اتجاه + تنبيه", en: "Trend + alerts" }, blurb: { ar: "صاعد / هابط / محايد مع تنبيه عند التغيّر", en: "Up / down / neutral with change alerts" } },
  signals: { icon: "🔔", name: { ar: "إشارات Buy/Sell مع أهداف", en: "Buy/Sell signals with targets" }, blurb: { ar: "دخول، وقف وثلاث أهداف لكل إشارة", en: "Entry, stop and three targets per signal" } },
  sr: { icon: "📐", name: { ar: "دعوم ومقاومات", en: "Support & Resistance" }, blurb: { ar: "مناطق بتتحدّث لحالها وبتنمسح لما تنكسر", en: "Zones that update and clear when broken" } },
  scalper: { icon: "⚡", name: { ar: "سكالبينغ / زخم", en: "Scalping / momentum" }, blurb: { ar: "دخول سريع على فريمات 1 إلى 15 دقيقة", en: "Fast entries for 1 to 15 minute charts" } },
  mtf: { icon: "🧭", name: { ar: "جدول متعدّد الفريمات", en: "Multi-timeframe table" }, blurb: { ar: "اتجاه أربع فريمات بجدول واحد", en: "Trend on four timeframes in one table" } },
  sessions: { icon: "🕒", name: { ar: "جلسات ومستويات أمس", en: "Sessions & previous levels" }, blurb: { ar: "آسيا، لندن، نيويورك وقمة وقاع اليوم السابق", en: "Asia, London, New York and yesterday's range" } },
  rsi_div: { icon: "〽️", name: { ar: "دايفرجنس RSI", en: "RSI divergence" }, blurb: { ar: "عادي ومخفي، مع خطوط وتنبيهات", en: "Regular and hidden, with lines and alerts" } },
  strategy: { icon: "🧪", name: { ar: "قالب ستراتيجي (باك-تست)", en: "Strategy template (backtest)" }, blurb: { ar: "مخاطرة ثابتة، وقف ATR وهدف", en: "Fixed risk, ATR stop and target" } },
};
const templates = CATALOG.map((t) => {
  const c = CARDS[t.id];
  if (!c) throw new Error("no card text for template " + t.id);
  return { id: t.id, icon: c.icon, title: c.name, blurb: c.blurb };
});

// Landing texts: [Arabic, English]. They describe what the product does, not more: every script is checked
// automatically and the result of the check is shown; nothing promises a script that cannot fail on TradingView.
const LANDING_I18N = {
  nav_cta: ["ابدأ التصميم ↖", "Start designing ↗"],
  eyebrow: ["⚡ مصمّم مؤشرات TradingView بالذكاء الاصطناعي", "⚡ AI indicator designer for TradingView"],
  hero_h1: ["صمّم مؤشّرك. <em>بكلماتك.</em>", "Design your indicator. <em>In your own words.</em>"],
  hero_sub: ["احكي فكرتك بالعربي، وNexus بيبني مؤشر TradingView كامل وبيفحصه تلقائياً قبل ما يسلّمك الكود.", "Describe your idea in plain words. Nexus builds a complete TradingView indicator and checks it automatically before handing you the code."],
  hero_cta1: ["ابدأ هلّق ←", "Start now →"],
  hero_cta2: ["جرّب مؤشر جاهز", "Try a ready indicator"],
  stat1: ["<b>Pine v6</b> · أحدث نسخة", "<b>Pine v6</b> · latest version"],
  stat2: ["<b>فحص تلقائي</b> · قبل التسليم", "<b>Automatic check</b> · before delivery"],
  stat3: [`<b>${templates.length} مؤشرات</b> · جاهزة فوراً`, `<b>${templates.length} indicators</b> · ready instantly`],
  mock_badge: ["✓ انفحص · 0 أخطاء", "✓ Checked · 0 errors"],
  feat_kick: ["ليش Nexus", "Why Nexus"],
  feat_sh: ["مؤشر مفحوص قبل ما يوصلك", "Checked before it reaches you"],
  f1h: ["بيفهم عليك", "Understands you"],
  f1p: ["اكتب بالعربي أو الإنجليزي، ارفع صورة شارت، أو احكي بالصوت إذا متصفّحك بيدعمه.", "Type in Arabic or English, upload a chart image, or dictate where your browser supports it."],
  f2h: ["فحص تلقائي", "Automatic check"],
  f2p: ["كل كود بيمرّ على فاحص Pine v6 قبل ما يوصلك، واللي بيلاقيه الفحص بينبعت للتصليح تلقائياً. وإذا بقي شي، بيبيّنلك بوضوح.", "Every script goes through a Pine v6 checker before you get it, and what the check finds is sent back for repair automatically. If anything remains, it is shown clearly."],
  f3h: ["مؤشرات جاهزة فورية", "Instant ready indicators"],
  f3p: ["SMC، اتجاه، إشارات مع أهداف، دعوم ومقاومات وغيرها، مفحوصة وجاهزة بكبسة.", "SMC, trend, signals with targets, support & resistance and more, checked and one click away."],
  f4h: ["تصليح بلصقة", "Fix by pasting"],
  f4p: ["إذا TradingView طلّع خطأ، الصقه تحت المؤشر وبينبعت للتصليح على نفس النسخة.", "If TradingView shows an error, paste it under the script and the same version is sent back for repair."],
  gal_kick: ["مؤشرات جاهزة", "Ready indicators"],
  gal_sh: ["جرّب واحد هلّق، فوري", "Try one now, instantly"],
  gal_p: ["اضغط على أي مؤشر وبيوصلك الكود فوراً. بعدها اطلب أي تعديل عليه بكلماتك.", "Click any indicator to get its code instantly. Then ask for any change in your own words."],
  how_kick: ["كيف بيشتغل", "How it works"],
  how_sh: ["من فكرة لمؤشّر بـ ٣ خطوات", "From idea to indicator in 3 steps"],
  s1h: ["احكي فكرتك", "Describe your idea"],
  s1p: ["مثلاً: «إشارة شراء لما RSI يطلع فوق 30 والسعر فوق EMA 200، مع تنبيه».", "For example: \"a buy signal when RSI crosses above 30 while price is above the 200 EMA, with an alert\"."],
  s2h: ["Nexus بيبني وبيفحص", "Nexus builds and checks"],
  s2p: ["بينكتب الكود، بينفحص تلقائياً، واللي بيلاقيه الفحص بينبعت للتصليح قبل التسليم.", "The code is written, checked automatically, and what the check finds is sent back for repair before delivery."],
  s3h: ["الصق بـ TradingView", "Paste into TradingView"],
  s3p: ["انسخ الكود، الصقه بالـ Pine Editor واضغط Add to chart.", "Copy the code, paste it into the Pine Editor and click Add to chart."],
  big_h: ["جاهز تبني مؤشّرك الأول؟", "Ready to build your first indicator?"],
  big_p: ["بدون برمجة. بس فكرة.", "No coding. Just an idea."],
  big_cta: ["ابدأ هلّق ↖", "Start now ↗"],
  foot_l: ["© {yr} Nexus — مصمّم مؤشرات التداول", "© {yr} Nexus — trading indicator designer"],
  foot_r: ["مؤشرات أصلية · أداة تعليمية، مش نصيحة مالية", "Original indicators · educational tool, not financial advice"],
};

const smcLines = fs.readFileSync(path.join(here, "..", "templates", "smc.pine"), "utf8").trimEnd().split("\n").length;
const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split("{{" + k + "}}").join(v), text);
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "");
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const sha256 = (s) => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";

// Returns { html, scripts }: `scripts` are the exact inline script bodies (their hashes go into the CSP).
function page({ title, desc, brand, brandSub, landing, endpoint, store, themeCss, hintAr, hintEn, noindex }) {
  const config = { endpoint, store, templates, landing: !!landing, hintAr, hintEn, fonts: FONTS, i18n: landing ? LANDING_I18N : undefined };
  const appHtml = fill(read("app.html"), {
    APP_ON: landing ? "" : ' class="on"',
    BRAND: brand,
    BRAND_SUB: brandSub,
    HOME_HIDDEN: landing ? "" : " hidden",
    HINT: hintAr,
  });
  const landingHtml = landing ? fill(read("landing.html"), { TPL_COUNT: String(templates.length), SMC_LINES: String(smcLines) }) : "";
  const css = [read("base.css"), themeCss || "", landing ? read("landing.css") : "", read("app.css")].filter(Boolean).join("\n");
  const scripts = ["window.NEXUS_CONFIG=" + safeJson(config) + ";", "\n" + read("app.js").trimEnd() + "\n"];
  for (const s of scripts) if (/<\/script/i.test(s)) throw new Error("an inline script contains a closing script tag");
  const html = `<!doctype html>
<!-- GENERATED by nexus-engine/ui/build-ui.mjs. Edit the sources in nexus-engine/ui and rebuild; do not edit this file. -->
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<title>${attr(title)}</title>
<meta name="description" content="${attr(desc)}">${noindex ? '\n<meta name="robots" content="noindex,nofollow">' : ""}
<meta name="theme-color" content="#070b09">
<link rel="icon" href="${attr(ICON)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${attr(FONTS)}">
<noscript><link rel="stylesheet" href="${attr(FONTS)}"></noscript>
<style>
${css}
</style>
</head>
<body>
${landingHtml}
${appHtml}
<script>${scripts[0]}</script>
<script>${scripts[1]}</script>
</body>
</html>
`;
  return { html, scripts };
}

const BRAIN_THEME = ':root{--bg:#0a0d0b;--panel:#111a14;--panel2:#0d1410;--line:#1d2a22;--line2:#28402f;--txt:#e6f3ea;--mut:#8ba897;--acc:#4ade80;--acc2:#22d3a8;--compbg:rgba(10,13,11,.88)}';

// The public site ships with a strict Content-Security-Policy: only the two inline scripts of the generated page run
// (by hash), and the page can only talk to itself and to the engine. The hashes change with every build, so
// indicator-build/vercel.json is generated together with the page.
function nexusHeaders(scripts) {
  const csp = [
    "default-src 'none'",
    "script-src " + scripts.map(sha256).join(" "),
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' " + BRAIN_ORIGIN,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    headers: [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), microphone=(self)" },
        ],
      },
    ],
  };
}

export function render() {
  const nexus = page({
    title: "Nexus — AI Trading Indicator Designer",
    desc: "Nexus turns your idea into a complete TradingView indicator and checks it automatically: SMC, signals, alerts, backtests.",
    brand: "NEXUS", brandSub: "Indicator Designer", landing: true,
    endpoint: BRAIN_ORIGIN + "/api/indicator", store: "nexus_v2",
    hintAr: "Nexus · Pine Script v6 · أداة تعليمية، مش نصيحة مالية", hintEn: "Nexus · Pine Script v6 · educational tool, not financial advice",
  });
  const brain = page({
    title: "Brain Indicators — Pine Script designer",
    desc: "Brain Indicators designs and checks TradingView Pine Script indicators and strategies.",
    brand: "Brain Indicators", brandSub: "Pine Script designer", landing: false, noindex: true,
    endpoint: "/api/indicator", store: "brain_ind_v2", themeCss: BRAIN_THEME,
    hintAr: "Pine Script v6 · الكود بينفحص تلقائياً · مش نصيحة مالية", hintEn: "Pine Script v6 · code is checked automatically · not financial advice",
  });
  const stage = page({
    title: "Nexus (staging)", desc: "Staging build of the Nexus app.",
    brand: "NEXUS", brandSub: "staging", landing: false, noindex: true,
    endpoint: "/api/nexus", store: "nexus_stage_v2",
    hintAr: "نسخة تجريبية", hintEn: "staging build",
  });
  return {
    "indicator-build/index.html": nexus.html,
    "indicator-build/vercel.json": JSON.stringify(nexusHeaders(nexus.scripts), null, 2) + "\n",
    "brain-app/indicators.html": brain.html,
    "brain-app/nexus-next.html": stage.html,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const [rel, text] of Object.entries(render())) {
    fs.writeFileSync(path.join(root, rel), text);
    out.push(`${rel} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`);
  }
  console.log("wrote:\n  " + out.join("\n  "));
}
