// Local development server for the Nexus pages and engine.
//   node nexus-engine/dev-server.mjs            -> http://localhost:8787  (model calls are simulated)
//   ANTHROPIC_API_KEY=... node nexus-engine/dev-server.mjs   -> real model calls
// Pages: /            Nexus site (indicator-build)        /indicators   Brain Indicators      /brain   Brain (private app)
// API:   /api/indicator and /api/nexus (same engine as production); /api/agent and /api/email (Brain, need the owner key)
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const PORT = Number(process.env.PORT || 8787);
const SIMULATED = !process.env.ANTHROPIC_API_KEY;
if (SIMULATED) process.env.ANTHROPIC_API_KEY = "simulated";

// ---------- simulated model (only without a real key) ----------
const SAMPLE = fs.readFileSync(path.join(here, "templates", "trend.pine"), "utf8");
const BROKEN = '//@version=6\nindicator("Broken demo", shorttitle = "Broken", overlay = true)\nlenInput = input.int(20, "Length", minval = 1)\nema = ta.ema(close, lenInput\nplot(ema, "EMA", color = color.teal)\n';
function simulatedReply(prompt) {
  const p = prompt.toLowerCase();
  if (/checker found problems/.test(p)) return { text: "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nema = ta.ema(close, lenInput\n=======\nema = ta.ema(close, lenInput)\n>>>>>>> END\n</edits><explain>-</explain></nexus>" };
  if (/sim:broken/.test(p)) return { text: `<nexus><title>Broken demo</title><file>broken_demo.pine</file><base>NEW</base><code>\n${BROKEN}</code><explain>Demo: the first draft has a syntax error that the engine repairs.</explain></nexus>` };
  if (/sim:unfixable/.test(p)) return { text: `<nexus><title>Broken demo</title><file>broken_demo.pine</file><base>NEW</base><code>\n${BROKEN.replace("lenInput\n", "lenInput +\n")}</code><explain>Demo: a script the engine cannot repair.</explain></nexus>` };
  if (/sim:text/.test(p)) return { text: "<nexus><base>NONE</base><explain>This is a plain answer without a script.</explain></nexus>" };
  if (/sim:error/.test(p)) return { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
  if (/tradingview reported/.test(p) || /current script/.test(p)) return { text: '<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\n//@version=6\n=======\n//@version=6\n// edited by the simulated model\n>>>>>>> END\n</edits><explain>Simulated edit of the current script.</explain></nexus>' };
  if (/sim:template/.test(p)) return { text: "<nexus><title>Trend</title><file>my_trend.pine</file><base>TEMPLATE:trend</base><edits></edits><explain>Simulated: verified template delivered unchanged.</explain></nexus>" };
  return { text: `<nexus>\n<title>Simulated Trend</title>\n<file>simulated_trend.pine</file>\n<base>NEW</base>\n<code>\n${SAMPLE}</code>\n<explain>\nSimulated model reply (no API key set).\nIt streams one of the verified templates as a new script.\n</explain>\n</nexus>` };
}
const realFetch = globalThis.fetch;
if (SIMULATED) {
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.anthropic.com")) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const last = body.messages[body.messages.length - 1];
    const prompt = Array.isArray(last.content) ? last.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") : String(last.content);
    const rep = simulatedReply(prompt);
    if (rep.status) return new Response(JSON.stringify(rep.body), { status: rep.status });
    const enc = new TextEncoder();
    const ev = (o) => enc.encode("event: x\ndata: " + JSON.stringify(o) + "\n\n");
    // "sim:slow" in the request keeps one call slow (for testing Stop and other mid-request actions) whatever SIM_SPEED is.
    const speed = /sim:slow/.test(prompt) ? 0.5 : Number(process.env.SIM_SPEED || 1);
    const stream = new ReadableStream({
      async start(c) {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
        c.enqueue(ev({ type: "message_start", message: { usage: { input_tokens: 500, cache_read_input_tokens: 20000 } } }));
        c.enqueue(ev({ type: "content_block_start", index: 0, content_block: { type: "thinking" } }));
        await wait(1500);
        for (let i = 0; i < rep.text.length; i += 60) { c.enqueue(ev({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: rep.text.slice(i, i + 60) } })); await wait(25); }
        c.enqueue(ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.round(rep.text.length / 4) } }));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}

const { handle } = await import("../brain-app/api/_nexus/handler.js");
// Brain's private endpoints, locked with a development key (printed at start).
if (!process.env.BRAIN_KEY) process.env.BRAIN_KEY = crypto.randomBytes(24).toString("base64url");
const { default: brainAgent } = await import("../brain-app/api/agent.js");
const { default: brainSync } = await import("../brain-app/api/sync.js");
let brainEmail = null;
try { ({ default: brainEmail } = await import("../brain-app/api/email.js")); } catch (e) { /* imapflow is not installed locally */ }

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
const pages = {
  "/": () => fs.readFileSync(path.join(root, "indicator-build", "index.html"), "utf8").replace(/https:\/\/brain-ahmad-93cb\.vercel\.app\/api\/(indicator|sync)/g, "/api/$1"),
  "/indicators": () => fs.readFileSync(path.join(root, "brain-app", "indicators.html"), "utf8"),
  "/nexus-next": () => fs.readFileSync(path.join(root, "brain-app", "nexus-next.html"), "utf8"),
  "/brain": () => fs.readFileSync(path.join(root, "brain-app", "index.html"), "utf8"),
};

// The Nexus page is served with the same headers as production (indicator-build/vercel.json). The script hashes of
// the policy are recomputed here because the local copy of the page calls the local API.
function nexusHeaders(html) {
  const out = {};
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "indicator-build", "vercel.json"), "utf8"));
    for (const h of cfg.headers[0].headers) out[h.key.toLowerCase()] = h.value;
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
    if (out["content-security-policy"]) out["content-security-policy"] = out["content-security-policy"].replace(/script-src [^;]*/, "script-src " + hashes.join(" "));
  } catch (e) {}
  return out;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:" + PORT);
    if (url.pathname === "/api/indicator" || url.pathname === "/api/nexus") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await handle(request, { waitUntil() {} });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) { const reader = response.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } }
      return res.end();
    }
    if (url.pathname === "/api/agent" || url.pathname === "/api/sync") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const response = await (url.pathname === "/api/sync" ? brainSync : brainAgent)(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) { const reader = response.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } }
      return res.end();
    }
    if (url.pathname === "/api/email" && brainEmail) return await brainEmail(req, res);
    const page = pages[url.pathname.replace(/\.html$/, "")];
    if (page) {
      const html = page();
      const etag = '"' + crypto.createHash("sha1").update(html).digest("hex").slice(0, 16) + '"';
      res.writeHead(200, { ...(url.pathname === "/" ? nexusHeaders(html) : {}), "content-type": TYPES[".html"], etag });
      return res.end(req.method === "HEAD" ? undefined : html);
    }
    res.writeHead(404, { "content-type": "text/plain" }); res.end("not found");
  } catch (e) { res.writeHead(500, { "content-type": "text/plain" }); res.end(String((e && e.stack) || e)); }
}).listen(PORT, "127.0.0.1", () => console.log(`Nexus dev server on http://localhost:${PORT} (${SIMULATED ? "simulated model" : "real model"})\nBrain: http://localhost:${PORT}/brain#key=${process.env.BRAIN_KEY}`));
