// Main Brain assistant (brain-app/api/agent.js): modes, tools, thinking, fallbacks.   node nexus-engine/tests/agent.test.mjs
import assert from "node:assert/strict";
process.env.ANTHROPIC_API_KEY = "k"; process.env.BRAIN_KEY = "owner-key-0123456789abcdefghij"; delete process.env.BRAIN_MODEL;
const FLAT = ((b) => (Array.isArray(b.system) ? Object.assign(b, { rawSystem: b.system, system: b.system.map((x) => x.text).join("\n") }) : b));
const bodies = []; let failFirst = "";
const sse = (text) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode("data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } }) + "\n\n")); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.anthropic.com")) {
    const b = FLAT(JSON.parse(init.body)); bodies.push(b);
    if (failFirst && bodies.length === 1) return new Response(failFirst, { status: 400 });
    return sse("ok");
  }
  if (u.startsWith("http://usws.com.au")) return new Response("", { status: 308, headers: { location: "https://usws.com.au/" } });
  if (u.startsWith("https://usws.com.au")) return new Response("<html></html>", { status: 200, headers: { "x-content-type-options": "nosniff", server: "Vercel" } });
  if (u.includes("finance.yahoo.com")) { const sym = decodeURIComponent(u.split("/chart/")[1].split("?")[0]); const px = { "EURUSD=X": [1.085, 1.08], "CL=F": [71.2, 72.0] }[sym]; return px ? Response.json({ chart: { result: [{ meta: { regularMarketPrice: px[0], chartPreviousClose: px[1] } }] } }) : new Response("no", { status: 404 }); }
  if (u.includes("api.telegram.org")) { tgSent.push(JSON.parse(init.body)); return Response.json({ ok: true }); }
  return new Response("{}", { status: 200 });
};
const tgSent = [];
const { default: agent } = await import("../../brain-app/api/agent.js");
const post = (body) => agent(new Request("https://b.test/api/agent", { method: "POST", headers: { "x-brain-key": process.env.BRAIN_KEY, "content-type": "application/json" }, body: JSON.stringify(body) }));
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, e); process.exitCode = 1; } };
await t("locked without the key", async () => {
  const r = await agent(new Request("https://b.test/api/agent", { method: "POST", body: "{}" })); assert.equal(r.status, 401);
});
await t("normal chat: new model, adaptive thinking, search + fetch tools", async () => {
  bodies.length = 0; const r = await post({ messages: [{ role: "user", content: "hello" }] }); assert.equal(await r.text(), "ok");
  const b = bodies[0]; assert.equal(b.model, "claude-sonnet-5-5"); assert.equal(b.thinking.type, "adaptive");
  assert.deepEqual(b.tools.map((x) => x.name), ["web_search", "web_fetch"]); assert.ok(!/MODE:/.test(b.system));
});
await t("deep research mode: many searches, high effort, its instructions", async () => {
  bodies.length = 0; await (await post({ mode: "deep", messages: [{ role: "user", content: "best turf types for Sydney shade" }] })).text();
  const b = bodies[0]; assert.match(b.system, /DEEP RESEARCH/); assert.equal(b.tools[0].max_uses, 25); assert.equal(b.output_config.effort, "high");
});
await t("plan mode is inferred from the words; file mode from an attachment", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "حلّل هالمخطط واحسب المساحة" }] })).text();
  assert.match(bodies[0].system, /PLANS, MAPS/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: [{ type: "text", text: "محتوى الملف \"a.csv\":\n1,2" }, { type: "text", text: "شو فيه" }] }] })).text();
  assert.match(bodies[0].system, /FILE INSPECTION/);
});
await t("design studio: inferred from design words (not indicators or gardens), strongest model, understand-first rules", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "صمملي بوست انستا لعرض الديكينغ" }] })).text();
  assert.match(bodies[0].system, /DESIGN STUDIO/); assert.match(bodies[0].system, /فهمت عليك/); assert.equal(bodies[0].model, "claude-opus-5-5"); assert.equal(bodies[0].max_tokens, 20000);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "design me a logo for the kids channel" }] })).text();
  assert.match(bodies[0].system, /DESIGN STUDIO/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "صمملي مؤشر تريدنج فيو" }] })).text();
  assert.doesNotMatch(bodies[0].system, /DESIGN STUDIO/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "تصميم حديقة خلفية مع ديكينغ" }] })).text();
  assert.doesNotMatch(bodies[0].system, /DESIGN STUDIO/);
  assert.match(bodies[0].system, /Get it right the first time/);
});
await t("trading desk: inferred from backtest / position-size words (not script building), strongest model, honest checklist", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "راجعلي هالباك تست، البروفيت فاكتور 3.8 و 25 صفقة" }] })).text();
  assert.match(bodies[0].system, /TRADING DESK/); assert.match(bodies[0].system, /trades >= 30/); assert.match(bodies[0].system, /never place trades/);
  assert.equal(bodies[0].model, "claude-opus-5-5");
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "what lot size for gold with a $5000 account, 1% risk and a 6 dollar stop?" }] })).text();
  assert.match(bodies[0].system, /TRADING DESK/); assert.match(bodies[0].system, /100 oz/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "build me a strategy for gold with a backtest" }] })).text();
  assert.doesNotMatch(bodies[0].system, /TRADING DESK/);
});
await t("send to Telegram: the whole answer goes to Ahmad's chat, the page gets a confirmation; nothing sent otherwise", async () => {
  const { wantsTelegram, splitForTelegram } = await import("../../brain-app/api/_brain/tg-send.js");
  assert.ok(wantsTelegram("ابعتلي هالدرس على التيليجرام")); assert.ok(wantsTelegram("send this to telegram please")); assert.ok(wantsTelegram("حطلي الخطة عالتلغرام"));
  for (const w of ["تليجرام", "تلجرام", "تيلجرام", "تيلغرام", "تيليغرام", "التيليجرام", "Telegram"]) assert.ok(wantsTelegram("ابعتلي الدرس على " + w), w);
  assert.ok(wantsTelegram("بعتلي ياه عالتلي"));
  assert.ok(!wantsTelegram("شو هو تيليجرام؟")); assert.ok(!wantsTelegram("ابعتلي ايميل للزبون"));
  const parts = splitForTelegram(("سطر ".repeat(40) + "\n").repeat(60)); assert.ok(parts.length > 1 && parts.every((p) => p.length <= 3900));
  process.env.TELEGRAM_BOT_TOKEN = "123:abc"; process.env.TELEGRAM_CHAT_ID = "42";
  tgSent.length = 0; bodies.length = 0;
  const out = await (await post({ messages: [{ role: "user", content: "ابعتلي درس عن الأوردر بلوك على تيليجرام" }] })).text();
  assert.match(bodies[0].system, /TELEGRAM: Ahmad asked/); assert.match(bodies[0].system, /فيديوهات قصيرة للشرح/);
  assert.equal(tgSent.length, 1); assert.equal(tgSent[0].chat_id, "42"); assert.match(tgSent[0].text, /ok/); assert.equal(tgSent[0].parse_mode, undefined);
  assert.match(out, /✅ انبعت على تيليجرام/);
  tgSent.length = 0; bodies.length = 0;
  await (await post({ messages: [{ role: "user", content: "مرحبا" }] })).text();
  assert.equal(tgSent.length, 0); assert.doesNotMatch(bodies[0].system, /TELEGRAM: Ahmad asked/);
  delete process.env.TELEGRAM_BOT_TOKEN;
  const out2 = await (await post({ messages: [{ role: "user", content: "send it to telegram" }] })).text();
  assert.match(out2, /مش مضبوط/);
  delete process.env.TELEGRAM_CHAT_ID;
});
await t("security mode runs one passive check of the site", async () => {
  bodies.length = 0; await (await post({ mode: "security", messages: [{ role: "user", content: "check usws.com.au" }] })).text();
  const s = bodies[0].system; assert.match(s, /SECURITY CHECK/); assert.match(s, /redirects to HTTPS: good/); assert.match(s, /strict-transport-security: MISSING/); assert.match(s, /server: Vercel/);
});
await t("falls back to fewer tools when web_fetch is refused", async () => {
  bodies.length = 0; failFirst = JSON.stringify({ error: { message: "web_fetch is not supported" } });
  assert.equal(await (await post({ messages: [{ role: "user", content: "hi" }] })).text(), "ok");
  assert.equal(bodies[1].tools.length, 1); failFirst = "";
});
await t("web answers end with their sources; quote and life modes", async () => {
  const { sourcesFooter } = await import("../../brain-app/api/agent.js");
  const ev = (o) => "data: " + JSON.stringify(o) + "\n\n";
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => { bodies.push(FLAT(JSON.parse(init.body))); return new Response(new ReadableStream({ start(c) { const e = new TextEncoder();
    c.enqueue(e.encode(ev({ type: "content_block_start", content_block: { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.test/1", title: "A" }] } })));
    c.enqueue(e.encode(ev({ type: "content_block_delta", delta: { type: "text_delta", text: "سعر الذهب 4000" } })));
    c.enqueue(e.encode(ev({ type: "content_block_delta", delta: { type: "citations_delta", citation: { url: "https://b.test/2", title: "B news" } } })));
    c.close(); } }), { status: 200 }); };
  const out = await (await post({ messages: [{ role: "user", content: "سعر الذهب" }] })).text();
  globalThis.fetch = prev;
  assert.match(out, /🔗 المصادر:\n• B news — https:\/\/b\.test\/2/); assert.doesNotMatch(out, /a\.test/);
  assert.equal(sourcesFooter("see https://x.t/1 and https://x.t/2", [{ url: "https://x.t/1" }, { url: "https://x.t/2" }], []), "");
  assert.match(sourcesFooter("hello", [], [{ url: "https://s.t", title: "S" }]), /Search results used/);
  assert.equal(sourcesFooter("hi", [], []), "");
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "اعملي عرض سعر لتركيب turf 80 متر" }] })).text();
  assert.match(bodies[0].system, /USWS QUOTE/); assert.match(bodies[0].system, /GST 10%/);
  bodies.length = 0; await (await post({ mode: "life", messages: [{ role: "user", content: "budget" }] })).text();
  assert.match(bodies[0].system, /LIFE PLANNER/); assert.match(bodies[0].system, /kids YouTube channel/);
});
await t("recovery mode is inferred and uses official-route instructions", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "انسرق حسابي على انستغرام، بدي استرجع حسابي" }] })).text();
  assert.match(bodies.at(-1).system, /ACCOUNT RECOVERY/);
});
await t("a file sent for checking is fingerprinted and its real type compared with its name", async () => {
  bodies.length = 0;
  const fake = Buffer.from("MZ" + "x".repeat(200)).toString("base64");
  await (await post({ messages: [{ role: "user", content: "safe?" }], scan: [{ name: "invoice.pdf.exe", size: 202, data: fake }] })).text();
  const sys = bodies.at(-1).system;
  assert.match(sys, /FILE CHECK/); assert.match(sys, /double extension/); assert.match(sys, /virustotal\.com\/gui\/file\/[0-9a-f]{64}/); assert.match(sys, /SECURITY CHECK/);
});
await t("Pro switch and heavy modes use the strongest model; plain chat stays fast; fixed instructions are cached", async () => {
  bodies.length = 0; await (await post({ pro: true, messages: [{ role: "user", content: "hello" }] })).text();
  assert.equal(bodies[0].model, "claude-opus-5-5"); assert.equal(bodies[0].output_config.effort, "high");
  assert.equal(bodies[0].rawSystem[0].cache_control.type, "ephemeral"); assert.match(bodies[0].rawSystem[1].text, /NOW:/);
  bodies.length = 0; await (await post({ mode: "deep", messages: [{ role: "user", content: "research" }] })).text();
  assert.equal(bodies[0].model, "claude-opus-5-5");
  bodies.length = 0; const r = await post({ messages: [{ role: "user", content: "hi" }] }); await r.text();
  assert.equal(bodies[0].model, "claude-sonnet-5-5"); assert.equal(r.headers.get("x-brain-model"), "claude-sonnet-5-5");
});
await t("WhatsApp model helper: falls back on a retired or overloaded model, stops on other errors", async () => {
  const { askModel, modelList } = await import("../../brain-app/api/_brain/model.js");
  assert.deepEqual(modelList("claude-sonnet-5-5", "claude-sonnet-4-5, claude-sonnet-5-5,"), ["claude-sonnet-5-5", "claude-sonnet-4-5"]);
  const saved = globalThis.fetch; const seen = [];
  try {
    globalThis.fetch = async (u, init) => { const m = JSON.parse(init.body).model; seen.push(m);
      if (m === "a") return new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: a" } }), { status: 404 });
      if (m === "b") return new Response("{\"error\":{\"type\":\"overloaded_error\"}}", { status: 529 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }), { status: 200 }); };
    const r = await askModel({ key: "k", models: ["a", "b", "c"], system: "s", user: "u" });
    assert.equal(r.ok, true); assert.equal(r.text, "hi"); assert.equal(r.model, "c"); assert.deepEqual(seen, ["a", "b", "c"]);
    seen.length = 0;
    globalThis.fetch = async (u, init) => { seen.push(JSON.parse(init.body).model); return new Response("{\"error\":{\"type\":\"authentication_error\"}}", { status: 401 }); };
    const bad = await askModel({ key: "k", models: ["a", "b"], system: "s", user: "u" });
    assert.equal(bad.ok, false); assert.equal(bad.status, 401); assert.deepEqual(seen, ["a"], "auth errors are not retried on other models");
  } finally { globalThis.fetch = saved; }
});

await t("live quotes: forex and oil are fetched for the question (Yahoo), with the change vs previous close", async () => {
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "شو سعر اليورو دولار والنفط هلق؟" }] })).text();
  const sys = bodies[0].system;
  assert.match(sys, /LIVE DATA \(fetched now/); assert.match(sys, /EUR\/USD = 1\.08500 \(\+0\.46% vs previous close\)/); assert.match(sys, /WTI crude oil \(futures\) = 71\.20 \(-1\.11%/);
  bodies.length = 0; await (await post({ messages: [{ role: "user", content: "write a quote for a deck in Europe" }] })).text();
  assert.ok(!/LIVE DATA \(fetched now/.test(bodies[0].system), "no quote fetch for unrelated words");
});

console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
