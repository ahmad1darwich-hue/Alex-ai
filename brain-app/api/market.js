// Brain daily market report (Vercel NODE function, up to 300 s: the model searches the web first).
//   GET /api/market                          -> { ok, info }  (public: nothing else)
//   GET /api/market  (Vercel cron, Bearer CRON_SECRET) -> builds today's report, stores it, sends it to Telegram
//   GET /api/market?run=1&key=DAILY_KEY      -> same, on demand
//   GET /api/market?report=1&key=DAILY_KEY   -> the latest stored report
// Also accepts the owner's x-brain-key header instead of ?key=.
import { buildReport, storeReport, latestReport, sendEverywhere, MARKETS, MARKET_MODEL } from "./_brain/market.js";
import { brainAuth } from "./_brain/lock.js";

function sameSecret(given, expected) {
  const g = String(given || ""), e = String(expected || "");
  if (!e || e.length < 16 || g.length !== e.length) return false;
  let d = 0; for (let i = 0; i < e.length; i++) d |= g.charCodeAt(i) ^ e.charCodeAt(i);
  return d === 0;
}
function send(res, obj, status) { res.statusCode = status || 200; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(obj)); }

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, { ok: false, message: "GET only" }, 405);
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const cronOk = sameSecret(bearer, process.env.CRON_SECRET);
  const keyOk = sameSecret(q.key, process.env.DAILY_KEY) || sameSecret(q.key, process.env.CRON_SECRET) || brainAuth(req.headers["x-brain-key"]) === "ok";
  if (!cronOk && !keyOk) {
    if (q.run || q.report) return send(res, { ok: false, message: "not allowed" }, 401);
    return send(res, { ok: true, info: "Brain daily market report. Runs by cron every morning (Sydney).", markets: MARKETS, model: MARKET_MODEL });
  }
  if (q.report) { const r = await latestReport(); return r ? send(res, { ok: true, report: r }) : send(res, { ok: false, message: "no report yet" }, 404); }
  try {
    const rep = await buildReport({ key: process.env.ANTHROPIC_API_KEY });
    await storeReport(rep);
    const sent = await sendEverywhere(rep);
    try { console.log("MARKET_REPORT " + JSON.stringify({ day: rep.day, model: rep.model, chars: rep.text.length, sent })); } catch (e) {}
    return send(res, { ok: true, day: rep.day, sent, report: rep });
  } catch (e) {
    try { console.error("market report failed:", String(e && e.message).slice(0, 300)); } catch (x) {}
    return send(res, { ok: false, message: "report failed" }, 502);
  }
}
