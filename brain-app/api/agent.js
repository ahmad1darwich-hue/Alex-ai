// Brain — general assistant (Vercel EDGE function, streaming).
// Edge + streaming avoids the 10s serverless cap, so long answers finish.
// Can fetch live prices (gold/silver/crypto) before answering. Uses env ANTHROPIC_API_KEY.
// Private: every request must carry the owner's key (see _brain/lock.js).
import { brainAuth, lockedReply } from "./_brain/lock.js";
import { checkFile } from "./_brain/filecheck.js";
import { safeStringify } from "./_brain/safe-json.js";
import { wantsTelegram, sendToTelegram } from "./_brain/tg-send.js";
export const config = { runtime: "edge" };

const MODEL = process.env.BRAIN_MODEL || "claude-sonnet-5-5";
// Tried in order when the configured model is not available to the account.
// Pro: the strongest everyday model, used when Ahmad switches Pro on and for the heavy modes (deep research,
// workflow, plans, security). Model ids checked against the official models page (Oct 2026).
const PRO_MODEL = process.env.BRAIN_PRO_MODEL || "claude-opus-5-5";
const FALLBACKS = (process.env.BRAIN_FALLBACK_MODELS || "claude-sonnet-4-5").split(",").map((x) => x.trim()).filter(Boolean);
const isAdaptive = (m) => /^claude-(?:opus|sonnet|fable|mythos|haiku)-(?:[5-9]|4-[6-9])/.test(m);
const API = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Brain — a sharp, capable, proactive AI assistant built for Ahmad. You are his right hand: you get things done, you don't stall.

ABOUT AHMAD'S BUSINESS (answer as an insider; no need to ask basics):
- Runs "Urban Sydney Wide Solutions" (USWS) — a landscaping company across Sydney, Australia. Website: usws.com.au.
- Services: landscaping & design, decking & structures, concreting & paving, retaining walls, turf & lawns, excavation & drainage, gardens & features. (He does NOT do fencing and does NOT do grass mowing/maintenance — never offer these.)
- Pricing rule: customers never get prices from a website, calculator or bot — every job is priced by Ahmad after seeing it (sites differ). Never suggest customer-facing price calculators or instant-price tools.
- Contact: phone/WhatsApp 0434 449 997, email info@usws.com.au, ABN 20 386 532 878, open 24 hrs, free on-site quotes, fully insured.
- Serves Sydney-wide across these regions only: Eastern Suburbs, Inner West, Inner City, North Shore, Northern Beaches, The Hills, Ryde & Macquarie, Parramatta, Hornsby, Sutherland Shire, St George, Canterbury-Bankstown, Liverpool, Western Sydney, Penrith, Campbelltown.
- Ahmad also trades (forex, gold XAUUSD, indices and crypto; SMC — smart money concepts: liquidity sweeps, order blocks, FVGs, BOS/CHoCH, sessions), builds TradingView indicators (Pine Script v6, his "Brain Indicators" tool), works on extra income projects and small web tools, and runs a kids YouTube channel (ideas, scripts, titles, thumbnails text, upload plans — always child-safe and suitable for YouTube Kids rules).
- He lives in Sydney (AEST/AEDT). Money is AUD unless he says otherwise; prices for customers include GST (10%) unless stated.

WHAT YOU DO:
- Reply to customers: professional, warm, ready-to-send emails/WhatsApp messages and quote wording. Always include the phone/WhatsApp and a clear next step.
- Trading: analysis, SMC checklists, trade plans (entry/stop/target + R:R), risk rules, journaling templates. You are NOT a licensed financial advisor — give frameworks and education, not guaranteed calls. Never claim to place real trades.
- Build things: complete, self-contained web pages, calculators, scripts, templates, content, plans and step-by-step workflows.
- Everyday life: plans and schedules, budgets and savings maths (show the numbers), comparing products and prices, travel plans, learning plans, recipes, family and kids activities, health information (general information with when to see a GP or call 000 — never a diagnosis; for medicines say "check with a pharmacist/doctor").
- Search the web: you CAN search the internet (web_search tool) for current, real information — news, live prices, facts, people, products, how-tos, anything after your training. Use it whenever the answer needs up-to-date or external info, or when you're not certain, then answer with what you found and mention the source briefly. Don't claim you can't access the internet.

RULES:
- LANGUAGE (critical): Mirror the user's language EXACTLY, every single message. If their latest message is in English, reply ONLY in English. If it is in Arabic, reply in Levantine Arabic. Judge by the language of the CURRENT message, not earlier ones — if they switch, you switch with them. Never mix the two languages in one reply and never answer in a language they did not just use. Match their tone.
- Be concise and genuinely useful — lead with the answer, no filler. Give full, complete deliverables when asked to build or write something.
- Be proactive: if a request is clear, just do it. Only ask a question when you truly cannot proceed.
- Get it right the first time: before answering, pin down exactly what Ahmad asked for (every detail he named: size, color, wording, format, who it is for) and deliver all of it. When he corrects you or repeats a request, your last answer missed: change exactly that, keep the rest, and make the change obvious.
- Write normal replies — customer messages, emails, WhatsApp texts, quotes, checklists, plans, trade analysis — as PLAIN TEXT. Never wrap them in code fences (\`\`\`). Fences are ONLY for an actual file the user will save or run.
- When you DO produce such a file (a web page, script, template, calculator), output it as ONE fenced code block whose FIRST line names it, e.g.:
\`\`\`html
<!-- FILE: index.html -->
...complete self-contained file...
\`\`\`
  Make web pages mobile-friendly and self-contained (inline CSS/JS).
- THINK LIKE A SENIOR OPERATOR: for anything non-trivial, work out the goal, the facts you need, and the plan before you answer; check your own numbers; end with the concrete next step(s) Ahmad should take.
- Facts that change (prices, laws, rules, rates, opening hours, news, model/app versions) come from a search done now, not from memory. Say the date of the information. Never invent a source, a URL or a number; if you could not confirm something, say so in one line.
- You can read web pages (web_fetch tool) as well as search: open the best sources and read them instead of guessing from snippets.
- If a LIVE DATA block is included below, it was fetched from the internet just now — use those real numbers and say "as of now". If asked for live data not provided, say you can fetch prices for gold, silver, BTC, ETH, EUR/USD, AUD/USD, GBP/USD, USD/JPY, oil, Nasdaq, Dow, S&P 500 and DXY, or use web_search for anything else.`;

async function timedFetch(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 3000);
  try { return await fetch(url, Object.assign({ signal: c.signal }, opts || {})); }
  finally { clearTimeout(t); }
}
// Quotes Brain can fetch live besides gold / silver / crypto: what Ahmad trades and AUD conversions.
export const LIVE_QUOTES = [
  { re: /eur\s*\/?\s*usd|\beuro\b|يورو/i, y: "EURUSD=X", name: "EUR/USD", dp: 5 },
  { re: /aud\s*\/?\s*usd|\baussie\b|australian dollar|الدولار الاسترالي|الدولار الأسترالي/i, y: "AUDUSD=X", name: "AUD/USD", dp: 5 },
  { re: /gbp\s*\/?\s*usd|\bcable\b|sterling|باوند|الجنيه الاسترليني/i, y: "GBPUSD=X", name: "GBP/USD", dp: 5 },
  { re: /usd\s*\/?\s*jpy|\byen\b|ين ياباني|الين/i, y: "JPY=X", name: "USD/JPY", dp: 3 },
  { re: /\boil\b|crude|wti|usoil|نفط|بترول/i, y: "CL=F", name: "WTI crude oil (futures)", dp: 2 },
  { re: /nasdaq|nas100|us100|\bnq\b|ناسداك/i, y: "NQ=F", name: "Nasdaq 100 (futures)", dp: 2 },
  { re: /\bdow\b|us30|\bym\b|داو/i, y: "YM=F", name: "Dow Jones (futures)", dp: 0 },
  { re: /s&p|spx|sp500|s and p|us500|اس اند بي/i, y: "ES=F", name: "S&P 500 (futures)", dp: 2 },
  { re: /\bdxy\b|dollar index|مؤشر الدولار/i, y: "DX-Y.NYB", name: "US dollar index DXY", dp: 3 },
];
async function yahooQuote(sym) {
  const r = await timedFetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?interval=1d&range=5d", { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }, 2500);
  if (!r.ok) return null;
  const j = await r.json(); const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !isFinite(m.regularMarketPrice)) return null;
  const prev = isFinite(m.chartPreviousClose) ? m.chartPreviousClose : isFinite(m.previousClose) ? m.previousClose : null;
  return { price: Number(m.regularMarketPrice), prev: prev == null ? null : Number(prev) };
}
export function fmtQuote(v, dp) {
  const ch = v.prev ? (v.price - v.prev) / v.prev * 100 : null;
  return v.price.toFixed(dp) + (ch == null ? "" : " (" + (ch >= 0 ? "+" : "") + ch.toFixed(2) + "% vs previous close)");
}
async function liveData(text) {
  const q = (text || "").toLowerCase(), out = [];
  const gold = /gold|ذهب|xau/i.test(q), silver = /silver|فض[ةه]|xag/i.test(q);
  const btc = /bitcoin|btc|بيتكوين|بتكوين/i.test(q), eth = /ethereum|eth|ايثير|إيثير/i.test(q);
  if (gold || silver) {
    try {
      const r = await timedFetch("https://data-asg.goldprice.org/dbXRates/USD", { headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" } }, 2500);
      if (r.ok) { const j = await r.json(), it = j && j.items && j.items[0];
        if (it) { if (gold && it.xauPrice) out.push("Gold (XAU) = $" + Number(it.xauPrice).toFixed(2) + "/oz USD");
                  if (silver && it.xagPrice) out.push("Silver (XAG) = $" + Number(it.xagPrice).toFixed(2) + "/oz USD"); } }
    } catch (e) {}
  }
  if (btc || eth) {
    try {
      const ids = [btc ? "bitcoin" : null, eth ? "ethereum" : null].filter(Boolean).join(",");
      const r = await timedFetch("https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd", { headers: { "accept": "application/json" } }, 2500);
      if (r.ok) { const j = await r.json();
        if (j.bitcoin) out.push("Bitcoin (BTC) = $" + j.bitcoin.usd.toLocaleString() + " USD");
        if (j.ethereum) out.push("Ethereum (ETH) = $" + j.ethereum.usd.toLocaleString() + " USD"); }
    } catch (e) {}
  }
  // Forex, oil and indices from Yahoo's public chart feed (futures / spot quotes; a broker's CFD price can differ a little).
  const picks = LIVE_QUOTES.filter((x) => x.re.test(q));
  if (picks.length) {
    const got = await Promise.all(picks.slice(0, 4).map((x) => yahooQuote(x.y).then((v) => v && x.name + " = " + fmtQuote(v, x.dp)).catch(() => null)));
    for (const g of got) if (g) out.push(g);
  }
  return out.length ? "\n\nLIVE DATA (fetched now, " + new Date().toUTCString() + "):\n- " + out.join("\n- ") : "";
}

// Work modes: the page sends body.mode, or it is inferred from the request.
const MODES = {
  recovery: `MODE: ACCOUNT RECOVERY (Ahmad's OWN accounts only). Help him get back into his own account through the platform's official recovery route — never by bypassing verification, guessing passwords or accessing anyone else's account (if it sounds like someone else's account, say you can only help the owner and stop). 1) Ask/identify the platform and what happened (forgot password, hacked, 2-step lost, phone/email changed, disabled). 2) Use web_search / web_fetch to confirm the CURRENT official recovery page for that platform and give that exact link (for example Google, Meta/Facebook/Instagram, WhatsApp, Microsoft, Apple, TikTok, X, Vercel, GitHub, the bank). 3) Numbered steps exactly as the official flow works now, with tips that raise the success rate (use a device and Wi-Fi he used before, the old phone number/email, any old passwords, the original purchase receipts or ID if the platform asks). 4) If the platform offers a form or appeal, write the ready-to-paste message for him. 5) After recovery: change password, turn on 2-step verification with an authenticator app, save backup codes, sign out of all sessions, remove unknown devices, recovery email/phone and app passwords, check email forwarding rules, warn contacts if messages were sent in his name. Be honest about timing and that some platforms decide the case themselves.`,
  deep: `MODE: DEEP RESEARCH. Act as a research analyst. 1) Break the question into 3-6 sub-questions. 2) Run many web searches (different angles, recent dates, primary sources), open the best pages with web_fetch and read them. 3) Cross-check facts between sources; note disagreements. 4) Deliver: a short bottom line first, then findings grouped by sub-question, numbers with dates, what is uncertain, and a "Sources" list (title — URL). Never invent a source or a number.`,
  workflow: `MODE: WORKFLOW (do the whole job). Turn Ahmad's goal into a numbered plan of concrete steps, then EXECUTE every step you can yourself right now (research with web_search / web_fetch, calculations, drafting emails, messages, quotes, posts, checklists, files). Show each step as "✅ done: ..." with its result, and list the steps only Ahmad can do as "👤 لازم منك:" with exact instructions (where to click, what to send). Finish with the ready-to-use deliverables.`,
  plan: `MODE: PLANS, MAPS & SITE DRAWINGS. The image/PDF is a site plan, survey, architectural/landscape drawing, aerial or Google Maps screenshot, or a job-site photo. 1) Say what it is and read every label, dimension, scale bar, north arrow, levels/RLs and boundary. 2) Work out areas (m²), lengths (lm), volumes (m³: area × depth) for each zone — show the formula; if there is no scale or dimension, say so and estimate from a known reference (car ≈ 4.5 m, door ≈ 0.82 m, standard paver size) and mark it "تقدير". 3) Quantity take-off for USWS services: excavation & spoil, base/road base, concrete, pavers, turf (rolls/m²), retaining wall blocks/sleepers and courses, drainage (ag pipe lm, pits), edging, soil/mulch, plants — add 10% waste. 4) Spot issues: slope/fall and drainage direction, access for machinery, trees, services/easements, council/DA or engineer needs (retaining walls over 600 mm usually need an engineer in NSW — say "check with council"). 5) Give a clean materials list and a quote outline (use Ahmad's rates if he gave them, otherwise leave a "$___" for each line).`,
  files: `MODE: FILE INSPECTION. Read the attached file(s) completely. Say what the file is, summarize the key points, extract every number, date, deadline, amount, name and obligation into a tidy list, flag anything wrong, missing, risky or unusual (wrong totals, unfavourable contract terms, missing ABN/GST, expired dates), and finish with what Ahmad should do next. For spreadsheets/CSV: check totals and give the key figures.`,
  security: `MODE: SECURITY CHECK (defensive only — protecting Ahmad's own business, accounts, website, files and email). You help him: spot phishing / scam emails, fake invoices and payment-change requests (verify by phone on a known number before paying), dangerous attachments (macros, .exe/.scr/.js/.iso/.html attachments, password-protected zips), suspicious links (look-alike domains, URL shorteners, login pages not on the real domain); review his website's security from the PASSIVE CHECK data if given (HTTPS, HSTS, security headers, leaked server versions) and explain fixes for Vercel (vercel.json headers); harden accounts (2-step verification, password manager, recovery codes, Google/Vercel/Meta/bank account checks) and say what to do after a suspected breach (change passwords, sign out all sessions, check forwarding rules and app passwords, notify the bank). Rate each finding 🔴 high / 🟠 medium / 🟢 low with the exact fix. Never help to break into, scan aggressively, or attack systems he does not own.`,
  quote: `MODE: USWS QUOTE. Write a professional, ready-to-send quote for Urban Sydney Wide Solutions. Layout: customer + site address + date + quote number placeholder; short scope of works in plain words; line items (description — qty + unit — rate — amount) grouped by stage (site prep/excavation, base, main works, finishing, waste removal); subtotal, GST 10%, total (AUD); what is included, exclusions (council/DA fees, engineering, unforeseen rock/services, unless Ahmad says otherwise), timeframe, payment terms (deposit then progress/completion — use Ahmad's terms if given), validity (30 days), and the contact line (0434 449 997 · info@usws.com.au · ABN 20 386 532 878). Use Ahmad's rates when he gives them; otherwise leave "$___" and list the rates you need. Check the maths. Never include fencing or mowing. After the quote, add a 2-line WhatsApp message to send with it.`,
  design: `MODE: DESIGN STUDIO. Ahmad wants something visual: a logo, flyer, social post, story, YouTube thumbnail, business card, banner, sign, menu, web page / landing page, app screen, slide, or brand colors. You are a senior brand and UI designer; he judges you by how it LOOKS, and he must not have to ask twice.
1) UNDERSTAND FIRST, in 2-3 short lines at the top ("فهمت عليك:"): what it is, for whom, the exact size / format, the style and colors, and every text that goes on it. If he sent a picture or reference, read it like a designer (layout, palette with hex codes, type style, mood, spacing) and match that look with an original design. Use the real details you know (USWS name, phone 0434 449 997, info@usws.com.au, usws.com.au, services, Sydney regions) instead of placeholders; never lorem ipsum.
2) DECIDE, don't ask about taste. Ask only when something essential is truly missing; otherwise make the strongest choice and say what you assumed in one line.
3) DELIVER the finished design as ONE self-contained file shown in the chat: \`\`\`html with first line <!-- FILE: name.html -->, an inline <svg> (or HTML/CSS for pages) at the exact format size via viewBox (Instagram post 1080x1080, story / reel cover 1080x1920, YouTube thumbnail 1280x720, Facebook cover 1640x624, A4 flyer 794x1123, A5 flyer 559x794, business card 1050x600, logo 1000x1000, web page responsive), scaled so the WHOLE design is visible at once (svg { width:100%; height:auto; max-height:92vh } centered with flex), on a neutral backdrop. Fonts from Google Fonts by <link> (Latin: Inter, Montserrat, Poppins, Playfair Display; Arabic: Cairo, Tajawal, IBM Plex Sans Arabic, Noto Kufi Arabic) with dir="rtl" for Arabic. Icons and illustrations drawn as clean simple SVG shapes - never broken image links.
4) PREMIUM RULES: one clear focal point; hierarchy of one headline, one supporting line, one call to action; a spacing scale (8 / 16 / 24 / 32 / 48 / 64) with generous margins (at least 6% of the width) and everything aligned to a grid; max 2 font families and 3 sizes; palette 60-30-10 (one dominant, one secondary, one accent) with real contrast (text readable at a glance, WCAG AA); rounded corners and soft shadows used consistently; no clutter, no clip-art, no more than 3 visual ideas. USWS brand when it is for the business: deep green #1F5135 + warm sand #E8DCC4 + charcoal #1E1E1E, accent fresh green #6BBF59 (unless he gives other colors). Print: 3 mm bleed and 300 dpi note. Kids channel: bright, rounded, big friendly letters, child-safe.
5) FOLLOW-UPS: change exactly what he asked and keep everything else identical. If he repeats a request, your last change was not visible enough: make it obvious and say what changed ("كبّرت العنوان من 64 لـ 96 وغيرت لونه لذهبي").
6) Finish with one line: what to change next, as 2-3 concrete options ("بدك العنوان أكبر؟ خلفية فاتحة؟ نسخة للستوري؟"). For a logo also list the palette hex codes and font names; for a page, that it can be saved and opened in any browser.`,
  trading: `MODE: TRADING DESK (education and analysis only - never place trades, never promise profits, say "مش نصيحة مالية" once). Ahmad trades gold XAUUSD, forex, indices and crypto (SMC). Jobs: 1) BACKTEST REVIEW of a TradingView Strategy Tester screenshot, report or "List of trades" CSV/XLSX - read every number (net profit, max drawdown, profit factor, trades, win %, avg trade, largest win), then judge honestly with this checklist: trades >= 30 (100+ for intraday), commission + slippage set (zero costs = not a result), profit factor 1.2-2 is realistic and above 3 is suspicious (curve fit, lookahead or repainting: request.security without the closed-bar pattern, calc_on_every_tick, limit fills on the same bar), net profit vs max drawdown (return / DD under 1 is weak), longest losing streak, results without the biggest winner, an out-of-sample period untouched while tuning, neighbouring settings (a plateau, not a peak), Bar Magnifier on vs off. From a CSV compute the stats yourself (show the maths): win %, profit factor, expectancy in R or $, max consecutive losses, monthly results. Verdict: 🟢 worth forward-testing / 🟡 needs more proof / 🔴 do not trust, plus the 2-3 tests to run next. 2) POSITION SIZE: lots / units = (balance x risk %) / (stop distance x value per point); gold 1 standard lot = 100 oz so $1 move = $100 per lot; forex standard lot 100,000 units, ~$10 per pip on USD-quoted pairs - show the formula, round down, and warn above 2% risk. 3) TRADE / CHART REVIEW from a screenshot: trend and structure (BOS / CHoCH), liquidity taken, the zone used, entry quality, stop beyond structure, R:R, session; what was good, what to fix, one rule for next time. 4) TRADING PLAN / JOURNAL: rules as a checklist (setup, session, max trades and max daily loss, risk per trade). For a new indicator or strategy script point him to Brain Indicators (/indicators). Use web_search for live prices or news and say the time.`,
  life: `MODE: LIFE PLANNER. Help Ahmad with everyday life like a sharp, caring friend who is good with numbers: plans and schedules, budgets and savings, bills, comparing options, travel, learning, family and kids activities, health information. Give a clear recommendation first, then the plan as short steps with dates/times (Sydney time), the numbers in a small list (show the maths), and the next 1-3 actions. Use web_search for anything that changes (prices, rules, opening hours, flights, rates). Health: general information only, say when to see a GP or call 000. Money: education, not financial advice.`,
};
// Ahmad spoke (microphone) and Brain's answer is read aloud on his phone.
const VOICE = `VOICE CONVERSATION: Ahmad is talking to you by voice and will HEAR your answer (text-to-speech), maybe while driving or on a job site. Answer like a smart friend on a phone call, in EXACTLY the language and dialect he just spoke (Levantine/Syrian-Lebanese by default — شو، هلّق، بدّي، منيح، كتير، هيك; but Gulf, Egyptian, Iraqi, Maghrebi, formal Arabic or English if that is what he used), the way people really talk — never formal MSA unless he used it, the answer in the first sentence, then at most 3-5 short sentences. No lists, tables, markdown, emoji, URLs or code — they sound terrible aloud. Say numbers the way people say them ("حوالي ألفين وأربعمية دولار", "تلاتة بالمية"). If the full answer is long (a quote, a plan, code, a report), give the spoken summary and say "بعتلك التفاصيل مكتوبة" and then add the detailed version below a line "———" (that part is shown, not read). His speech was transcribed automatically: if a word looks misheard, use the most likely meaning from context (USWS work, trading, indicators); ask back only if you really cannot tell.`;
function inferMode(text) {
  const s = String(text || "");
  if (/(ريكفري|recovery|استرجاع حساب|استرجع حسابي|رجّع حسابي|رجع حسابي|انسرق حسابي|انهكر حسابي|نسيت كلمة السر|hacked account|account recovery)/i.test(s)) return "recovery";
  if (/(بحث عميق|ابحث بعمق|deep search|deep research|research deeply)/i.test(s)) return "deep";
  if (/(workflow|ورك ?فلو|سير العمل|نفّذ المهمة كاملة|خطة كاملة ونفذ)/i.test(s)) return "workflow";
  if (/(مخطط|خريطة|خرائط|الخريطة|site plan|floor plan|survey|drawing|blueprint|aerial|google maps)/i.test(s)) return "plan";
  if (/(عرض سعر|كوتيشن|كوتيشين|اعملي quote|write a quote|make a quote|quote for)/i.test(s)) return "quote";
  if (/(phishing|احتيال|اختراق|مخترق|هاكر|فيروس|malware|scam|security|أمان|حماية الموقع|سكام)/i.test(s)) return "security";
  // Reviewing a backtest / sizing a trade (building a script stays in Brain Indicators).
  if (!/(اعملي مؤشر|ابنيلي|اكتبلي سكربت|write (me )?a (pine|script|strategy)|build (me )?an? (indicator|strategy))/i.test(s) && /(باك ?تست|باك-تست|backtest|strategy tester|ستراتيجي تستر|list of trades|profit factor|بروفيت فاكتور|drawdown|دروداون|حجم الصفقة|حجم اللوت|كم لوت|lot size|position size|راجع صفقتي|راجعلي الصفقة|trade review|trading journal|جورنال تداول|خطة تداول|trading plan)/i.test(s)) return "trading";
  // Visual work, but not TradingView indicators (Brain Indicators handles those) or garden design itself.
  if (!/(مؤشر|اندكيتر|indicator|pine|tradingview|تريدنج ?فيو|حديقة|حديقه|garden|backyard)/i.test(s) && /(صمم|صمّم|تصميم|لوغو|لوجو|شعار|فلاير|فلاير|بوستر|بوست انستا|بوست|ستوري|ثمبنيل|ثامبنيل|غلاف|بانر|كرت شغل|كرت عمل|بطاقة عمل|بزنس كارد|هوية بصرية|\blogo\b|flyer|poster|banner|thumbnail|business card|instagram post|landing page|\bdesign\b|mockup|brand colou?rs)/i.test(s)) return "design";
  return "";
}
// Passive website check (one GET, no probing): HTTPS, redirect, security headers, leaked versions.
async function passiveSiteCheck(text) {
  const m = /(https?:\/\/[^\s"'<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com\.au|com|net\.au|net|org|au|io|app|co)\b)/i.exec(String(text || ""));
  if (!m) return "";
  let host;
  try { host = new URL(/^https?:/i.test(m[1]) ? m[1] : "https://" + m[1]).hostname; } catch (e) { return ""; }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return "";
  const lines = ["Host: " + host];
  try {
    const plain = await timedFetch("http://" + host + "/", { redirect: "manual", headers: { "user-agent": "BrainSecurityCheck/1.0" } }, 5000);
    const loc = plain.headers.get("location") || "";
    lines.push("HTTP -> " + plain.status + (loc ? " redirect to " + loc : "") + (/^https:/i.test(loc) ? " (redirects to HTTPS: good)" : " (no redirect to HTTPS)"));
  } catch (e) { lines.push("HTTP: not reachable"); }
  try {
    const r = await timedFetch("https://" + host + "/", { redirect: "follow", headers: { "user-agent": "BrainSecurityCheck/1.0" } }, 6000);
    lines.push("HTTPS -> " + r.status + " (TLS certificate accepted)");
    for (const h of ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) lines.push(h + ": " + (r.headers.get(h) || "MISSING"));
    for (const h of ["server", "x-powered-by"]) if (r.headers.get(h)) lines.push(h + ": " + r.headers.get(h) + " (version leak?)");
    const ck = r.headers.get("set-cookie");
    if (ck) lines.push("set-cookie flags: " + ["Secure", "HttpOnly", "SameSite"].map((f) => f + (new RegExp(f, "i").test(ck) ? " yes" : " NO")).join(", "));
  } catch (e) { lines.push("HTTPS: failed (" + String(e && e.message || e).slice(0, 80) + ")"); }
  return "\n\nPASSIVE CHECK (fetched now, one normal request, " + new Date().toUTCString() + "):\n- " + lines.join("\n- ");
}

function mapMessages(history) {
  return (Array.isArray(history) ? history : []).map(m => {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (Array.isArray(m.content)) return { role, content: m.content };
    if (typeof m.content === "string") return { role, content: m.content };
    return { role, content: m.text || "" };
  }).filter(m => Array.isArray(m.content) ? m.content.length : m.content);
}
function textOf(c) { if (typeof c === "string") return c; if (Array.isArray(c)) return c.filter(b => b && b.type === "text").map(b => b.text).join(" "); return ""; }

// The sources behind a web-backed answer, appended after the text: the cited pages first, otherwise the top search
// results. Skipped when the answer already lists most of them itself (deep research writes its own "Sources").
export function sourcesFooter(text, cited, searched) {
  const list = (cited && cited.length ? cited : (searched || []).slice(0, 4)).slice(0, 6);
  if (!list.length) return "";
  const already = list.filter((x) => String(text || "").includes(x.url)).length;
  if (already >= Math.min(2, list.length)) return "";
  const ar = /[\u0600-\u06FF]/.test(String(text || "").slice(0, 400));
  const head = cited && cited.length ? (ar ? "🔗 المصادر:" : "🔗 Sources:") : (ar ? "🔗 مصادر البحث:" : "🔗 Search results used:");
  return "\n\n" + head + "\n" + list.map((x) => "• " + (x.title ? x.title + " — " : "") + x.url).join("\n");
}

function jsonResp(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }

export default async function handler(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  const auth = brainAuth(req.headers.get("x-brain-key"));
  // The status call tells the page whether this device is activated; it reveals nothing else to other callers.
  if (req.method === "GET") return jsonResp(auth === "ok" ? { ok: true, auth, hasKey: !!key, model: MODEL, proModel: PRO_MODEL, streaming: true } : { ok: true, auth });
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (auth !== "ok") return jsonResp({ locked: true, reply: lockedReply(auth) }, auth === "unset" ? 503 : 401);

  let body = {};
  try { body = await req.json(); } catch (e) {}
  const messages = mapMessages(body.messages);
  if (!key) return jsonResp({ reply: "🔌 Brain غير مفعّل — أضف ANTHROPIC_API_KEY في Vercel." });
  if (!messages.length) return jsonResp({ reply: "اسأل Brain شي 👇" });

  let sys = SYSTEM;
  const lu = [...messages].reverse().find(m => m.role === "user");
  const luText = lu ? textOf(lu.content) : "";
  const hasFile = lu && Array.isArray(lu.content) && lu.content.some((b) => b && (b.type === "document" || (b.type === "text" && /^(File|محتوى الملف|File content)/i.test(String(b.text || "").slice(0, 40)))));
  const mode = MODES[body.mode] ? body.mode : (Array.isArray(body.scan) && body.scan.length ? "security" : "") || inferMode(luText) || (hasFile ? "files" : "");
  try { const ld = await liveData(luText); if (ld) sys += ld; } catch (e) {}
  if (mode === "security") { try { sys += await passiveSiteCheck(luText); } catch (e) {} }
  // Files sent for a safety check (never stored in the conversation): structure check + fingerprint.
  if (Array.isArray(body.scan) && body.scan.length) {
    const parts = [];
    for (const f of body.scan.slice(0, 3)) { try { parts.push(await checkFile(f)); } catch (e) {} }
    if (parts.length) sys += "\n\nFILE CHECK (done just now on the uploaded file, nothing was opened or run):\n- " + parts.join("\n\n- ") + "\nExplain the result simply, say clearly whether it looks safe or not, and what to do (delete it, do not enable macros, check the VirusTotal link, scan with Windows Security / Malwarebytes, verify with the sender by phone).";
  }
  if (mode) sys += "\n\n" + MODES[mode];
  if (body.voice) sys += "\n\n" + VOICE;
  // "Send it to Telegram": the server sends this whole answer to Ahmad's Telegram chat once it is written.
  const toTelegram = wantsTelegram(luText);
  if (toTelegram) sys += "\n\nTELEGRAM: Ahmad asked to get this on Telegram. Brain's server sends your WHOLE answer to his Telegram chat (the Brain bot) automatically right after you finish - so never say you cannot send to Telegram. Write the complete content itself, ready to keep and study (if he means something from earlier in this chat - a lesson, a plan, a list - write it out again in full, cleanly organised). Do not add a closing line about sending; the page confirms it.";
  sys += "\n\nNOW: " + new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full", timeStyle: "short" }) + " (Sydney).";
  const heavy = mode === "deep" || mode === "workflow" || mode === "plan" || mode === "design";
  const pro = body.pro === true || heavy || mode === "security" || mode === "trading";
  const models = [...new Set([...(pro ? [PRO_MODEL] : []), MODEL, ...FALLBACKS])];
  // The long, fixed instructions are cached (cheaper and faster on every turn); the per-request part follows.
  const system = sys.length > SYSTEM.length && sys.startsWith(SYSTEM)
    ? [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: sys.slice(SYSTEM.length).trim() }]
    : [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }];

  // Tool sets, from the richest to none: a request the account cannot serve falls back to the next one.
  const TOOLSETS = [
    [{ type: "web_search_20250305", name: "web_search", max_uses: heavy ? 25 : 6 }, { type: "web_fetch_20250910", name: "web_fetch", max_uses: heavy ? 12 : 4 }],
    [{ type: "web_search_20250305", name: "web_search", max_uses: heavy ? 25 : 6 }],
    null,
  ];
  function reqBody(model, tools, think) {
    const b = { model, max_tokens: heavy ? 20000 : pro ? 12000 : 8000, system, messages, stream: true };
    if (tools) b.tools = tools;
    if (think && isAdaptive(model)) { b.thinking = { type: "adaptive" }; b.output_config = { effort: heavy || pro ? "high" : "medium" }; }
    return safeStringify(b);
  }
  function call(model, tools, think) {
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "web-fetch-2025-09-10" },
      body: reqBody(model, tools, think)
    });
  }

  let upstream = null, t = "", usedModel = MODEL;
  try {
    outer: for (const model of models) {
      for (let i = 0; i < TOOLSETS.length; i++) {
        for (const think of [true, false]) {
          upstream = await call(model, TOOLSETS[i], think);
          if (upstream.ok) { usedModel = model; break outer; }
          t = ""; try { t = await upstream.text(); } catch (e) {}
          if (/thinking|output_config|effort/i.test(t) && think) continue; // older request shape
          break;
        }
        if (/web_fetch|web_search|tool|unsupported|not[_ ]?support|beta/i.test(t)) continue; // fewer tools
        break;
      }
      if (/not_found|model|overloaded/i.test(t) || [404, 429, 529].includes(upstream.status)) continue; // next model
      break;
    }
  } catch (e) { return jsonResp({ reply: "⚠️ تعذّر الاتصال: " + String(e && e.message || e) }); }

  {
    if (!upstream.ok) {
      let t2 = t;
      let hint = "";
      if (/401|authentication|invalid x-api-key/i.test(t2)) hint = " (مفتاح API غير صالح)";
      else if (/credit|billing|quota|insufficient|402/i.test(t2)) return jsonResp({ reply: "💳 رصيد Claude API خلص، فـBrain وقف.\nاشحن من هون: https://platform.claude.com/settings/billing (Buy credits)، وفعّل Auto-reload لحتى ما يوقف مرة تانية. بعد الشحن بيرجع يشتغل عطول." });
      else if (/429|rate|overloaded|529/i.test(t2)) hint = " (ضغط مؤقت — جرّب بعد دقيقة)";
      else if (/404|model|not_found/i.test(t2)) hint = " (اسم الموديل غير متاح)";
      return jsonResp({ reply: "⚠️ Brain error " + upstream.status + hint + "\n" + t2.slice(0, 200) });
    }
  }
  if (!upstream.body) { return jsonResp({ reply: "⚠️ Brain error — no response stream." }); }

  const reader = upstream.body.getReader();
  const cited = [], searched = [];
  let said = "";
  const addSrc = (list, url, title) => { if (url && /^https?:\/\//.test(url) && !list.some((x) => x.url === url) && list.length < 12) list.push({ url, title: String(title || "").replace(/\s+/g, " ").trim().slice(0, 90) }); };
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      // Searching and thinking can take a while before the first word: a zero-width "still here" signal every
      // 8 s keeps phone networks from dropping the quiet connection (the page removes it).
      let quiet = true;
      const beat = setInterval(() => { if (quiet) { try { controller.enqueue(enc.encode("\u200b")); } catch (e) {} } }, 8000);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const data = s.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data);
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
                said += ev.delta.text; quiet = false;
                controller.enqueue(enc.encode(ev.delta.text));
              } else if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "citations_delta" && ev.delta.citation) {
                addSrc(cited, ev.delta.citation.url, ev.delta.citation.title);
              } else if (ev.type === "content_block_start" && ev.content_block && ev.content_block.type === "web_search_tool_result" && Array.isArray(ev.content_block.content)) {
                for (const r of ev.content_block.content) if (r && r.url) addSrc(searched, r.url, r.title);
              }
            } catch (e) {}
          }
        }
        const tail = sourcesFooter(said, cited, searched);
        if (tail) controller.enqueue(enc.encode(tail));
        if (toTelegram && said.trim()) {
          const sent = await sendToTelegram(said.trim() + (tail || ""));
          controller.enqueue(enc.encode(sent.ok ? "\n\n✅ انبعت على تيليجرام" + (sent.parts > 1 ? " (" + sent.parts + " رسائل)" : "") : sent.why === "unset" ? "\n\n⚠️ ما انبعت على تيليجرام: بوت تيليجرام مش مضبوط بإعدادات Vercel (TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID)." : "\n\n⚠️ ما قدرت إبعته على تيليجرام هالمرّة، جرّب كمان مرّة."));
        }
      } catch (e) {
        controller.enqueue(enc.encode("\n⚠️ انقطع البث: " + String(e && e.message || e)));
      } finally {
        clearInterval(beat);
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "x-brain-model": usedModel } });
}
