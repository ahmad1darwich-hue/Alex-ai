// End-to-end tests of the Nexus pages in a real browser (optional: needs Playwright and Chromium).
//   node nexus-engine/tests/ui-e2e.mjs            (starts the dev server itself, simulated model)
//   NEXUS_CHROME=/path/to/chrome node ...         (use a specific browser binary)
// Skipped with a message when Playwright is not installed. Screenshots go to $NEXUS_SHOTS when set.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium = null;
for (const name of ["playwright", "/opt/npm-tools/node_modules/playwright"]) { try { ({ chromium } = require(name)); break; } catch (e) {} }
if (!chromium) { console.log("SKIP ui-e2e: Playwright is not installed."); process.exit(0); }

const PORT = Number(process.env.E2E_PORT || 8791);
const BASE = "http://localhost:" + PORT;
const EXE = process.env.NEXUS_CHROME || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
const SHOTS = process.env.NEXUS_SHOTS || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0, passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; return true; }
  failed++; failures.push(name + (detail !== undefined ? "  -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""));
  console.log("  FAIL " + name + (detail !== undefined ? "  -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600) : ""));
  return false;
}

// ---------- server ----------
const server = spawn(process.execPath, [path.join(here, "..", "dev-server.mjs")], { env: { ...process.env, PORT: String(PORT), SIM_SPEED: "25", ANTHROPIC_API_KEY: "", BRAIN_KEY: "e2e-brain-key-0123456789abcdefgh" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
async function waitServer() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + "/api/indicator"); if (r.ok) return; } catch (e) {} await sleep(150); }
  throw new Error("dev server did not start:\n" + serverLog);
}

// ---------- browser helpers ----------
let browser = null, nCtx = 0;
async function open(opts = {}) {
  const mobile = !!opts.mobile;
  const ctx = await browser.newContext({
    // Each test is its own client for the server's request caps.
    extraHTTPHeaders: { "x-real-ip": "10.9." + Math.floor(++nCtx / 250) + "." + (nCtx % 250) },
    viewport: opts.viewport || (mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 }),
    deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, acceptDownloads: true,
    permissions: opts.clipboard === false ? [] : ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const log = { console: [], errors: [], dialogs: [], external: [], posts: [] };
  page.on("console", (m) => log.console.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => log.errors.push(String((e && e.stack) || e)));
  page.on("dialog", async (d) => { log.dialogs.push(d.type() + ": " + d.message()); try { await d.dismiss(); } catch (e) {} });
  page.on("request", (r) => { if (r.method() === "POST" && /\/api\/(indicator|nexus)/.test(r.url())) { try { log.posts.push(JSON.parse(r.postData() || "{}")); } catch (e) { log.posts.push({}); } } });
  // No external network: everything that is not the local server is recorded and blocked (or held, for the fonts test).
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    log.external.push(u);
    if (opts.holdExternal) { await sleep(opts.holdExternal); }
    return route.abort();
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  return { ctx, page, log };
}
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png") }); };
const isBusy = (page) => page.evaluate(() => document.getElementById("send").classList.contains("stop"));
async function idle(page, timeout = 30000) { await page.waitForFunction(() => !document.getElementById("send").classList.contains("stop"), null, { timeout }); await sleep(120); }
async function busyStart(page, timeout = 5000) { await page.waitForFunction(() => document.getElementById("send").classList.contains("stop"), null, { timeout }); }
async function ask(page, text) { await page.fill("#in", text); await page.keyboard.press("Enter"); await busyStart(page); await idle(page); }
const last = (page) => page.evaluate(() => {
  const msgs = [...document.querySelectorAll(".msg.b")]; const m = msgs[msgs.length - 1]; if (!m) return null;
  const art = m.querySelector(".art"), vis = (e) => e && e.style.display !== "none";
  return {
    bubbles: [...m.querySelectorAll(".bub")].map((b) => ({ cls: b.className, dir: b.dir, text: b.innerText, role: b.getAttribute("role") })),
    vline: m.querySelector(".vline") && { cls: m.querySelector(".vline").className, text: m.querySelector(".vline").textContent },
    retry: !!m.querySelector(".retry"),
    art: art && {
      cls: art.className, file: art.querySelector(".fn").textContent,
      badge: art.querySelector(".badge") && { cls: art.querySelector(".badge").className, text: art.querySelector(".badge").textContent },
      meta: art.querySelector(".meta").textContent,
      copyPrimary: art.querySelector(".bar .btn2").classList.contains("pri"),
      findingsTitle: art.querySelector(".findings .ft") && art.querySelector(".findings .ft").textContent,
      unapplied: art.querySelector(".findings .fu") && art.querySelector(".findings .fu").textContent,
      more: art.querySelector(".findings .fm") && art.querySelector(".findings .fm").textContent,
      findings: [...art.querySelectorAll(".findings li")].map((l) => l.textContent),
      foot: [...art.querySelectorAll(".foot > *")].filter(vis).map((e) => e.textContent),
      code: [...art.querySelectorAll("pre .l")].map((l) => l.textContent).join("\n"),
      closed: art.querySelector(".codewrap").classList.contains("closed"),
    },
    ctx: document.getElementById("ctx").classList.contains("on") ? document.getElementById("ctxFile").textContent : null,
  };
});
const store = (page, key = "nexus_v2") => page.evaluate((k) => { try { return JSON.parse(sessionStorage.getItem(k) || localStorage.getItem(k) || "null"); } catch (e) { return String(e); } }, key);
const noisy = (log) => log.console.filter((c) => !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT/.test(c));
function cleanLog(name, log) {
  check(name + ": no page errors", log.errors.length === 0, log.errors);
  check(name + ": no dialogs", log.dialogs.length === 0, log.dialogs);
  const bad = noisy(log).filter((c) => /Content Security Policy|i18n: missing|^error:/i.test(c));
  check(name + ": console is clean", bad.length === 0, bad);
  const ext = log.external.filter((u) => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
  check(name + ": only the fonts are loaded from outside", ext.length === 0, ext);
}
// Replaces the engine for the next POST(s) with a canned response.
async function mockPost(page, makeResponse, times = 1) {
  let left = times;
  await page.route("**/api/indicator", async (route) => {
    if (route.request().method() !== "POST" || left <= 0) return route.fallback();
    left--;
    const r = await makeResponse(route.request());
    return route.fulfill(r);
  });
}
const ndjson = (events) => ({ status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" }, body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
const GOOD = '//@version=6\nindicator("T", overlay = true)\nplot(close)\n';

// ---------- tests ----------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("landing: loads under the production policy, opens the app, reload and Back behave", async () => {
  const { ctx, page, log } = await open();
  const res = await page.goto(BASE + "/", { waitUntil: "load" });
  const csp = res.headers()["content-security-policy"] || "";
  check("the page is served with a policy", /script-src 'sha256-/.test(csp) && !/unsafe-inline'[^;]*;?\s*$/.test(csp.split(";").find((p) => /script-src/.test(p)) || ""), csp);
  check("the app script ran", await page.evaluate(() => typeof window.NexusApp === "object"));
  check("landing visible first", await page.evaluate(() => !document.getElementById("appview").classList.contains("on") && getComputedStyle(document.getElementById("landing")).display !== "none"));
  check("no inline handlers", await page.evaluate(() => ![...document.querySelectorAll("*")].some((e) => [...e.attributes].some((a) => /^on/i.test(a.name)))));
  check("template cards on the landing", (await page.locator("#lgrid .tcard").count()) === 9);
  await page.click('[data-act="launch"] >> nth=0');
  check("launch shows the app at #app", await page.evaluate(() => location.hash === "#app" && document.getElementById("appview").classList.contains("on")));
  check("landing is not rendered behind the app", await page.evaluate(() => getComputedStyle(document.getElementById("landing")).display === "none"));
  await page.locator("#tgrid .tcard").first().click();
  await idle(page);
  const a = await last(page);
  check("template delivered with a green badge", a && a.art && /badge ok/.test(a.art.badge.cls), a && a.art && a.art.badge);
  await page.reload({ waitUntil: "load" });
  check("reload keeps the app view and the conversation", await page.evaluate(() => document.getElementById("appview").classList.contains("on") && document.querySelectorAll(".art").length === 1));
  await page.goBack(); await sleep(150);
  check("Back returns to the landing page (same site)", await page.evaluate(() => location.pathname === "/" && location.hash === "" && !document.getElementById("appview").classList.contains("on")));
  await page.goForward(); await sleep(150);
  check("Forward returns to the app", await page.evaluate(() => document.getElementById("appview").classList.contains("on")));
  await page.click("#home"); await sleep(150);
  check("Home shows the landing page", await page.evaluate(() => !document.getElementById("appview").classList.contains("on") && location.hash === ""));
  await page.click('[data-act="demo"]');
  await idle(page);
  check("demo button opens the app and fetches the SMC template", await page.evaluate(() => document.getElementById("appview").classList.contains("on") && document.querySelectorAll(".art").length === 2));
  cleanLog("landing", log);
  await shot(page, "01-app");
  await ctx.close();
});

test("fonts: a slow font server does not block the page", async () => {
  const { ctx, page } = await open({ holdExternal: 6000 });
  const t0 = Date.now();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const ok = await page.waitForFunction(() => typeof window.NexusApp === "object" && document.querySelectorAll("#lgrid .tcard").length > 0, null, { timeout: 3000 }).then(() => true).catch(() => false);
  check("page is interactive while the fonts request hangs", ok && Date.now() - t0 < 3500, Date.now() - t0);
  const painted = await page.waitForFunction(() => performance.getEntriesByType("paint").length > 0, null, { timeout: 2500 }).then(() => true).catch(() => false);
  check("first paint happened while the fonts request hangs", painted && Date.now() - t0 < 5000, Date.now() - t0);
  await ctx.close();
});

test("build: custom request, edit follow-up, repair, unverified result, text reply, error and retry", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  check("direct #app link opens the app", await page.evaluate(() => document.getElementById("appview").classList.contains("on")));
  await page.click("#langA"); // English
  await ask(page, "an indicator please");
  let a = await last(page);
  check("custom request delivers a verified script", a.art && /badge ok/.test(a.art.badge.cls) && a.art.copyPrimary, a.art && a.art.badge);
  check("result line from the server is shown", a.vline && /vline ok/.test(a.vline.cls) && /0 errors/.test(a.vline.text), a.vline);
  check("the script becomes the current one", a.ctx === "simulated_trend.pine", a.ctx);
  await ask(page, "make the line thicker");
  const p = log.posts[log.posts.length - 1];
  check("follow-up sends the current script", p.mode === "build" && /indicator\(/.test(p.code || "") && p.file === "simulated_trend.pine", { mode: p.mode, file: p.file, code: String(p.code).slice(0, 40) });
  check("history carries text only", Array.isArray(p.messages) && p.messages.every((m) => typeof m.content === "string" && m.content.length < 6500));

  await page.click("#ctxNew");
  await ask(page, "sim:broken please");
  a = await last(page);
  check("a broken draft is repaired and verified", a.art && /badge ok/.test(a.art.badge.cls), a.art && a.art.badge);

  await page.click("#ctxNew");
  await ask(page, "sim:unfixable please");
  a = await last(page);
  check("unverified: red badge that says it will not compile", a.art && /badge bad/.test(a.art.badge.cls) && /will not compile/.test(a.art.badge.text), a.art && a.art.badge);
  check("unverified: the server's sentence is shown", a.vline && /vline bad/.test(a.vline.cls) && /Not verified/.test(a.vline.text), a.vline);
  check("unverified: Copy is not the main action, Fix is offered first", a.art && !a.art.copyPrimary && /Fix the findings/.test(a.art.foot[0]), a.art && a.art.foot);
  check("unverified: findings are listed", a.art.findings.length > 0 && /Line \d+:/.test(a.art.findings[0]), a.art.findings);
  await shot(page, "02-unverified");

  await page.click("#ctxNew");
  await ask(page, "sim:text please");
  a = await last(page);
  check("plain answer is a bubble without a script", a && !a.art && a.bubbles.length === 1 && /plain answer/.test(a.bubbles[0].text), a);

  await ask(page, "sim:error please");
  a = await last(page);
  check("model failure: an alert with a retry button", a.bubbles[0] && /err/.test(a.bubbles[0].cls) && a.bubbles[0].role === "alert" && a.retry, a);
  const nPosts = log.posts.length;
  await page.click(".retry"); await busyStart(page); await idle(page);
  check("retry re-sends the same request", log.posts.length === nPosts + 1 && JSON.stringify(log.posts[nPosts].messages) === JSON.stringify(log.posts[nPosts - 1].messages));
  check("one retry button at most", (await page.locator(".retry").count()) === 1);
  await ask(page, "another indicator");
  check("a new request removes the stale retry button", (await page.locator(".retry").count()) === 0);
  const st = await store(page);
  check("failed requests leave no assistant turn in storage", st.msgs.filter((m) => m.r === "a").every((m) => m.kind === "script" || (m.kind === "text" && m.explain && m.explain !== "…")), st.msgs.map((m) => m.r + ":" + (m.kind || "")));
  cleanLog("build", log);
  await ctx.close();
});

test("replies the engine did not write are never shown as answers", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  const cases = [
    ["429 from the platform", { status: 429, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: { code: "rate_limited", message: "Too Many Requests" } }) }, /Too many requests/],
    ["500 JSON", { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal Server Error" }) }, /server had a problem/],
    ["502 HTML", { status: 502, headers: { "content-type": "text/html" }, body: "<html>Bad gateway</html>" }, /server had a problem/],
    ["413 without a file", { status: 413, headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "error", message: "The request is too large. Send smaller files." }) }, /too large/],
    ["200 HTML (sign-in page of a network)", { status: 200, headers: { "content-type": "text/html" }, body: "<html><body>Please sign in to the Wi-Fi</body></html>" }, /server had a problem|Could not reach/],
    ["200 JSON without a kind", { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ hello: 1 }) }, /No complete reply/],
    ["engine error in JSON", { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "error", message: "Daily limit reached. Please try again tomorrow." }) }, /Daily limit reached/],
    ["stream that ends without a final event", ndjson([{ t: "stage", id: "start" }, { t: "stage", id: "think" }]), /No complete reply/],
    ["malformed report", ndjson([{ t: "final", kind: "script", code: GOOD, file: "x.pine", explain: "ok", report: { verified: false, errors: [null, 5, { line: "x", message: { a: 1 } }], warnings: "oops" } }]), null],
  ];
  for (const [name, response, expect] of cases) {
    await mockPost(page, () => response);
    await page.fill("#in", "test " + name); await page.keyboard.press("Enter");
    await idle(page);
    const a = await last(page);
    if (expect) check(name + ": shown as an error with retry", a.bubbles.length === 1 && /err/.test(a.bubbles[0].cls) && expect.test(a.bubbles[0].text) && a.retry, a.bubbles);
    else check(name + ": rendered without freezing", a.art && /badge/.test(a.art.badge.cls) && !(await isBusy(page)), a);
    await page.unroute("**/api/indicator");
  }
  const st = await store(page);
  check("none of the failures was stored as an answer", st.msgs.filter((m) => m.r === "a").length === 1, st.msgs.map((m) => m.r + ":" + (m.kind || "")));

  // A reply that says edits could not be applied.
  await mockPost(page, () => ndjson([{ t: "final", kind: "script", code: GOOD, file: "x.pine", explain: "I changed the colours.", line: "2 requested change(s) could not be applied. If TradingView shows an error, paste it here and I will fix it.", report: { verified: false, unappliedEdits: 2, errors: [], warnings: [], errorCount: 0, warningCount: 0 } }]));
  await page.fill("#in", "change colours"); await page.keyboard.press("Enter"); await idle(page);
  let a = await last(page);
  check("unapplied edits: amber badge and a plain sentence", a.art && /badge warn/.test(a.art.badge.cls) && /2 requested change/.test(a.art.unapplied || "") && /could not be applied/.test(a.vline.text), { badge: a.art && a.art.badge, un: a.art && a.art.unapplied });
  await page.unroute("**/api/indicator");

  // Counts come from the totals, not from the shortened lists.
  const errs = Array.from({ length: 8 }, (_, i) => ({ line: i + 3, message: "Undeclared identifier \"x" + i + "\"" }));
  await mockPost(page, () => ndjson([{ t: "final", kind: "script", code: GOOD, file: "x.pine", explain: "", report: { verified: false, errors: errs, warnings: [], errorCount: 40, warningCount: 3, unappliedEdits: 0 } }]));
  await page.fill("#in", "many errors"); await page.keyboard.press("Enter"); await idle(page);
  a = await last(page);
  check("error totals are not understated", a.art && /40 error/.test(a.art.badge.text) && /35 more/.test(a.art.more || ""), { badge: a.art && a.art.badge, more: a.art && a.art.more });
  await page.unroute("**/api/indicator");

  // Markup in every field is shown as text.
  const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
  await mockPost(page, () => ndjson([{ t: "stage", id: "template", template: evil }, { t: "final", kind: "script", code: GOOD + "// " + evil + "\n", file: "../../" + evil + ".exe", title: evil, explain: "**" + evil + "** `" + evil + "`", line: evil, report: { verified: false, errors: [{ line: 1, message: evil }], warnings: [{ line: evil, message: evil }], errorCount: 1, warningCount: 1 } }]));
  await page.fill("#in", evil); await page.keyboard.press("Enter"); await idle(page);
  a = await last(page);
  check("markup from the server stays text", (await page.evaluate(() => window.__xss)) === undefined && (await page.locator("#thread img:not(.att)").count()) === 0 && (await page.locator("#thread script").count()) === 0);
  check("file names are made safe", a.art && /^[A-Za-z0-9_.-]+\.pine$/.test(a.art.file) && !/^\./.test(a.art.file), a.art && a.art.file);
  await page.unroute("**/api/indicator");
  cleanLog("foreign replies", { ...log, console: log.console.filter((c) => !/status of (4|5)\d\d/.test(c)) });
  await ctx.close();
});

test("send button: double click does not cancel, Stop stops and offers a retry", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await page.fill("#in", "sim:slow an indicator please");
  await page.dblclick("#send");
  await sleep(300);
  check("double click: still running", await isBusy(page));
  await idle(page);
  let a = await last(page);
  check("double click: one request, delivered", log.posts.length === 1 && a.art && /badge ok/.test(a.art.badge.cls), { posts: log.posts.length });
  // Enter several times while busy: nothing is sent or cancelled, the draft stays.
  await page.fill("#in", "sim:slow sim:broken"); await page.keyboard.press("Enter"); await busyStart(page);
  await page.fill("#in", "my draft"); for (let i = 0; i < 4; i++) await page.keyboard.press("Enter");
  check("Enter while busy keeps the draft", (await page.inputValue("#in")) === "my draft" && (await isBusy(page)));
  check("the send button is announced as Stop while busy", (await page.getAttribute("#send", "aria-label")) === "Stop");
  await sleep(700); await page.click("#send"); await idle(page);
  a = await last(page);
  check("Stop: a notice with a retry button", a.bubbles.length === 1 && /Request stopped/.test(a.bubbles[0].text) && a.retry && !/err/.test(a.bubbles[0].cls), a.bubbles);
  check("the send button is Send again", (await page.getAttribute("#send", "aria-label")) === "Send");
  const n = log.posts.length;
  await page.click(".retry"); await busyStart(page); await idle(page);
  a = await last(page);
  check("retry after Stop runs the request again", log.posts.length === n + 1 && a.art, { posts: log.posts.length - n });
  // The drawer tool "Explain" must not cancel a running request.
  await page.fill("#in", ""); await page.fill("#in", "sim:slow sim:broken again"); await page.keyboard.press("Enter"); await busyStart(page);
  await page.click("#menu"); await page.click('[data-tool="explain"]'); await sleep(200);
  check("Explain while busy does not cancel", await isBusy(page));
  await idle(page);
  a = await last(page);
  check("the running request finished normally", a.art && /badge ok/.test(a.art.badge.cls), a);
  cleanLog("send button", log);
  await ctx.close();
});

test("language switch updates texts in place", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  check("Arabic first: rtl, composer placeholder right-to-left", await page.evaluate(() => document.documentElement.dir === "rtl" && document.getElementById("in").dir === "rtl"));
  await ask(page, "مؤشر اتجاه لو سمحت");
  await page.click("#ctxNew");
  await ask(page, "sim:unfixable جرّب");
  await ask(page, "sim:error جرّب");
  await page.evaluate(() => { const art = document.querySelector(".art"); art.querySelector(".more").click(); [...art.querySelectorAll(".foot .btn2")].find((b) => b.getAttribute("data-i18n") === "a_err").click(); art.querySelector(".fixbox textarea").value = "Error at 4:1 something"; });
  const before = await page.evaluate(() => ({ badge: document.querySelectorAll(".badge")[1].textContent, retry: document.querySelector(".retry").textContent, more: document.querySelector(".more").textContent, n: document.querySelectorAll(".msg").length }));
  check("Arabic labels", /خطأ/.test(before.badge) && /جرّب/.test(before.retry) && /إخفاء/.test(before.more), before);
  await page.click("#langA");
  const after = await page.evaluate(() => ({ badge: document.querySelectorAll(".badge")[1].textContent, retry: document.querySelector(".retry") && document.querySelector(".retry").textContent, more: document.querySelector(".more").textContent, n: document.querySelectorAll(".msg").length, open: !document.querySelector(".codewrap").classList.contains("closed"), fix: document.querySelector(".fixbox").classList.contains("on") && document.querySelector(".fixbox textarea").value, dir: document.documentElement.dir, ph: document.getElementById("in").placeholder, fixph: document.querySelector(".fixbox textarea").getAttribute("aria-label"), send: document.getElementById("send").getAttribute("aria-label"), menu: document.getElementById("menu").getAttribute("aria-label") }));
  check("English labels after the switch", /will not compile/.test(after.badge) && after.retry === "Try again" && /Hide code/.test(after.more) && after.dir === "ltr", after);
  check("the thread, the error with its retry, the open code and the typed text survive", after.n === before.n && after.open && after.fix === "Error at 4:1 something", after);
  check("aria labels follow the language", after.send === "Send" && after.menu === "Menu" && /TradingView/.test(after.fixph), after);
  // Switching while a request runs is allowed and keeps the request.
  await page.fill("#in", "sim:slow sim:broken go"); await page.keyboard.press("Enter"); await busyStart(page);
  await page.click("#langA"); await sleep(100);
  check("switch while busy keeps the request", (await isBusy(page)) && (await page.getAttribute("#send", "aria-label")) === "إيقاف");
  await idle(page);
  check("delivered after the switch", (await last(page)).art !== null);
  cleanLog("language", log);
  await ctx.close();
});

test("check my code, fix box, continue from a version, new chat", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await page.click("#menu");
  check("menu button reports the open drawer", (await page.getAttribute("#menu", "aria-expanded")) === "true");
  await page.click('[data-tool="check"]');
  check("the dialog takes the focus", await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.activeElement && document.activeElement.id === "checkIn"), 80))));
  check("the page behind the dialog is inert", await page.evaluate(() => document.getElementById("wrap").inert === true && document.querySelector("#appview header").inert === true));
  await page.fill("#checkIn", GOOD);
  await page.click("#checkGo"); await idle(page);
  let a = await last(page);
  check("valid code: green badge and an accurate sentence", a.art && /badge ok/.test(a.art.badge.cls) && /found no errors/.test(a.bubbles[0].text), a);
  check("the page is usable again after the dialog", await page.evaluate(() => document.getElementById("wrap").inert === false));
  const many = '//@version=6\nindicator("x")\n' + Array.from({ length: 30 }, (_, i) => "plot(undefinedVar" + i + ")").join("\n") + "\n";
  await page.click("#menu"); await page.click('[data-tool="check"]'); await page.fill("#checkIn", many); await page.click("#checkGo"); await idle(page);
  a = await last(page);
  check("invalid code: the real number of errors", a.art && /badge bad/.test(a.art.badge.cls) && /30 error/.test(a.art.badge.text) && /found 30 problem/.test(a.bubbles[0].text) && /22 more/.test(a.art.more || ""), { badge: a.art && a.art.badge, text: a.bubbles[0].text, more: a.art && a.art.more });
  // A checker crash is not a pass.
  const crash = '//@version=6\nindicator("x", overlay = true)\ny = ' + "1 + ".repeat(3000) + "1\nplot(undefinedVar)\nthis is not even pine (((\n";
  await page.click("#menu"); await page.click('[data-tool="check"]'); await page.fill("#checkIn", crash); await page.click("#checkGo"); await idle(page);
  a = await last(page);
  check("unreadable code is never reported as clean", a.art && !/badge ok/.test(a.art.badge.cls), a.art && a.art.badge);
  // Too long for the server: refused in the dialog instead of checking a cut-off script.
  await page.click("#menu"); await page.click('[data-tool="check"]');
  await page.evaluate(() => { document.getElementById("checkIn").value = "//@version=6\n" + "x".repeat(121000); });
  const n = log.posts.length; await page.click("#checkGo"); await sleep(200);
  check("over-long code is refused before sending", log.posts.length === n && (await page.evaluate(() => document.getElementById("checkModal").classList.contains("on"))));
  await page.keyboard.press("Escape");
  check("Escape closes the dialog", await page.evaluate(() => !document.querySelector(".modal.on")));

  // Dragging a selection out of the dialog must not close it.
  await page.click("#menu"); await page.click('[data-tool="check"]'); await page.fill("#checkIn", "some text to select");
  const box = await page.locator("#checkIn").boundingBox();
  await page.mouse.move(box.x + 30, box.y + 20); await page.mouse.down(); await page.mouse.move(5, 5, { steps: 4 }); await page.mouse.up(); await sleep(100);
  check("a selection drag that ends on the backdrop keeps the dialog", await page.evaluate(() => document.getElementById("checkModal").classList.contains("on")));
  await page.mouse.click(5, 5); await sleep(100);
  check("a click on the backdrop closes it", await page.evaluate(() => !document.querySelector(".modal.on")));

  // TradingView error flow on the second card.
  const cards = page.locator(".art");
  const second = cards.nth(1);
  await second.locator('.foot .btn2[data-i18n="a_err"]').click();
  await second.locator(".fixbox textarea").fill('Error at 3:6 Undeclared identifier "undefinedVar0"');
  await second.locator('.fixbox .btn2[data-i18n="fix_go"]').click(); await busyStart(page); await idle(page);
  const p = log.posts[log.posts.length - 1];
  check("fix request carries the error and that card's code", p.mode === "fix" && /undefinedVar0/.test(p.tvError) && /undefinedVar29/.test(p.code), { mode: p.mode, tv: p.tvError });
  // Continue from an older version.
  await cards.first().locator('.foot .btn2[data-i18n="a_use"]').click();
  check("an older version becomes the current script", (await page.evaluate(() => document.getElementById("ctxFile").textContent)) === "my_script.pine");

  // New chat needs two presses.
  await page.click("#newchat");
  check("first press only arms the button", (await page.locator(".art").count()) > 0 && /Sure\?/.test(await page.textContent("#newchat")));
  await page.click("#newchat"); await sleep(100);
  check("second press clears the conversation", (await page.locator(".msg").count()) === 0 && (await page.locator("#intro").count()) === 1 && (await store(page)) === null);
  cleanLog("check and fix", log);
  await ctx.close();
});

test("storage: restore, damaged data, separate tabs", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await ask(page, "an indicator please");
  const page2 = await ctx.newPage();
  await page2.goto(BASE + "/#app", { waitUntil: "load" });
  check("a new tab starts from the latest saved conversation", (await page2.locator(".art").count()) === 1);
  await page2.fill("#in", "sim:text hello"); await page2.keyboard.press("Enter"); await idle(page2);
  await page.reload({ waitUntil: "load" });
  check("a reload shows this tab's own conversation", (await page.locator(".msg").count()) === 2, await page.locator(".msg").count());
  await page2.close();
  // Damaged storage: unknown entries are dropped, the rest renders, the app works.
  await page.evaluate(() => { const bad = JSON.stringify({ v: 2, msgs: [{ r: "u", text: "hello" }, null, 7, { r: "a", kind: "script", id: 3, code: "//@version=6\nindicator(\"s\")\nplot(close)\n", file: "../../x.exe", report: { verified: true, errors: [null], warnings: "oops" } }, { r: "x" }, { r: "a", kind: "text", explain: 12 }], cur: { id: 3 }, seq: "nope" }); sessionStorage.setItem("nexus_v2", bad); localStorage.setItem("nexus_v2", bad); });
  await page.reload({ waitUntil: "load" });
  const st = await page.evaluate(() => ({ msgs: document.querySelectorAll(".msg").length, art: document.querySelectorAll(".art").length, file: document.querySelector(".art .fn") && document.querySelector(".art .fn").textContent, ctx: document.getElementById("ctxFile").textContent }));
  check("damaged storage: readable messages are shown", st.msgs === 3 && st.art === 1 && st.file === "x.pine" && st.ctx === "x.pine", st);
  await ask(page, "sim:text still works");
  check("the app still works after damaged storage", /plain answer/.test((await last(page)).bubbles[0].text));
  await page.evaluate(() => { sessionStorage.setItem("nexus_v2", "{not json"); localStorage.setItem("nexus_v2", "{not json"); });
  await page.reload({ waitUntil: "load" });
  check("unreadable storage starts clean", (await page.locator("#intro").count()) === 1 && (await page.locator(".msg").count()) === 0);
  cleanLog("storage", log);
  await ctx.close();
});

test("attachments and paste", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  // A clipboard with text and an image pastes the text.
  const r1 = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 60; c.height = 40; c.getContext("2d").fillRect(0, 0, 60, 40);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "shot.png", { type: "image/png" });
    const dt = new DataTransfer(); dt.items.add(file); dt.setData("text/plain", "hello");
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById("in").dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 300));
    return { prevented: ev.defaultPrevented, chips: document.querySelectorAll(".chip").length };
  });
  check("text plus image: left to the browser as a text paste", !r1.prevented && r1.chips === 0, r1);
  // An image alone is attached.
  const r2 = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; const g = c.getContext("2d"); g.fillStyle = "#268"; g.fillRect(0, 0, 3000, 2000);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "chart.png", { type: "image/png" }));
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById("in").dispatchEvent(ev);
    // Send in the same tick: the image is still being prepared.
    document.getElementById("in").value = "from this chart";
    document.getElementById("send").click();
    const early = { busy: document.getElementById("send").classList.contains("stop"), loadingChip: !!document.querySelector(".chip.load"), draft: document.getElementById("in").value };
    await new Promise((r) => { const t = setInterval(() => { if (!document.querySelector(".chip.load")) { clearInterval(t); r(); } }, 30); });
    return { prevented: ev.defaultPrevented, early, chips: document.querySelectorAll(".chip").length };
  });
  check("image paste is attached", r2.prevented && r2.chips === 1, r2);
  check("sending waits for the attachment", !r2.early.busy && r2.early.loadingChip && r2.early.draft === "from this chart", r2.early);
  await page.keyboard.press("Enter"); await busyStart(page); await idle(page);
  const p = log.posts[log.posts.length - 1], lastMsg = p.messages[p.messages.length - 1];
  check("the request carries the image", Array.isArray(lastMsg.content) && lastMsg.content[0].type === "image" && lastMsg.content[0].source.media_type === "image/jpeg" && lastMsg.content[0].source.data.length > 500 && lastMsg.content[1].text === "from this chart");
  check("chips are cleared after sending", (await page.locator(".chip").count()) === 0);
  // Unsupported and oversized files are refused with a message.
  const r3 = await page.evaluate(async () => {
    const out = [];
    const input = document.getElementById("file");
    const give = async (file) => { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event("change")); await new Promise((r) => setTimeout(r, 250)); out.push({ name: file.name, toast: document.getElementById("toast").textContent, chips: document.querySelectorAll(".chip").length }); };
    await give(new File([new Uint8Array(100)], "archive.zip", { type: "application/zip" }));
    await give(new File([new Uint8Array(1200000)], "big.pdf", { type: "application/pdf" }));
    await give(new File(["//@version=6\nindicator('x')\n"], "mine.pine", { type: "" }));
    return out;
  });
  check("a zip is refused", /Unsupported/.test(r3[0].toast) && r3[0].chips === 0, r3[0]);
  check("a large PDF is refused with the real limit", /1MB/.test(r3[1].toast) && r3[1].chips === 0, r3[1]);
  check("a .pine file is attached", r3[2].chips === 1, r3[2]);
  check("the remove control is a labelled button", await page.evaluate(() => { const x = document.querySelector(".chip .x"); return x.tagName === "BUTTON" && x.getAttribute("aria-label") === "Remove attachment"; }));
  await page.click(".chip .x");
  check("remove works", (await page.locator(".chip").count()) === 0);
  // Dropping a file on the page attaches it instead of navigating away.
  const r4 = await page.evaluate(async () => {
    const dt = new DataTransfer(); dt.items.add(new File(["spec"], "spec.txt", { type: "text/plain" }));
    const over = new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }); document.body.dispatchEvent(over);
    const drop = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }); document.body.dispatchEvent(drop);
    await new Promise((r) => setTimeout(r, 250));
    return { over: over.defaultPrevented, drop: drop.defaultPrevented, chips: document.querySelectorAll(".chip").length };
  });
  check("a dropped file is attached", r4.over && r4.drop && r4.chips === 1, r4);
  cleanLog("attachments", log);
  await ctx.close();
});

test("voice input keeps finished phrases and stops with Send", async () => {
  const init = () => {
    class FakeSR {
      constructor() { window.__sr = this; this.started = 0; }
      start() { this.started++; this.running = true; }
      stop() { this.running = false; setTimeout(() => { if (this.onresult) this.fire([["late words", true]], 9); if (this.onend) this.onend(); }, 30); }
      fire(list, resultIndex) {
        const results = []; const idx = resultIndex || 0;
        for (let i = 0; i < idx; i++) results.push(Object.assign([{ transcript: "" }], { isFinal: true }));
        list.forEach(([text, fin]) => results.push(Object.assign([{ transcript: text }], { isFinal: fin })));
        this.onresult({ resultIndex: idx, results });
      }
    }
    window.SpeechRecognition = FakeSR;
  };
  const { ctx, page, log } = await open({ init });
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await page.fill("#in", "Base text");
  await page.click("#mic");
  const v = await page.evaluate(() => {
    const sr = window.__sr, out = [];
    sr.fire([["buy signal when RSI", false]], 0); out.push(document.getElementById("in").value);
    sr.fire([["buy signal when RSI crosses 30", true]], 0); out.push(document.getElementById("in").value);
    sr.fire([["and price", false]], 1); out.push(document.getElementById("in").value);
    sr.fire([["and price above the EMA", true]], 1); out.push(document.getElementById("in").value);
    return out;
  });
  check("finished phrases are kept", v[3] === "Base text buy signal when RSI crosses 30 and price above the EMA" && v[2] === "Base text buy signal when RSI crosses 30 and price", v);
  check("the mic button reports its state", (await page.getAttribute("#mic", "aria-pressed")) === "true");
  await page.keyboard.press("Enter"); await sleep(200);
  check("late results after Send do not refill the box", (await page.inputValue("#in")) === "", await page.inputValue("#in"));
  await idle(page);
  check("the mic is off after Send", (await page.getAttribute("#mic", "aria-pressed")) === "false");
  cleanLog("voice", log);
  await ctx.close();
});

test("small screens: no sideways scroll, readable controls", async () => {
  for (const vp of [{ width: 375, height: 812 }, { width: 320, height: 640 }]) {
    for (const lang of ["ar", "en"]) {
      const { ctx, page, log } = await open({ mobile: true, viewport: vp });
      await page.goto(BASE + "/", { waitUntil: "load" });
      if (lang === "en") await page.click("#langL");
      const tag = vp.width + "/" + lang;
      const wide = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      let w = await wide();
      check(tag + " landing: no horizontal overflow", w.doc <= w.win, w);
      await shot(page, "m-" + vp.width + "-" + lang + "-landing");
      await page.click('[data-act="launch"] >> nth=0');
      check(tag + " app: the keyboard is not opened on launch", await page.evaluate(() => document.activeElement !== document.getElementById("in")));
      await page.locator("#tgrid .tcard").first().click(); await idle(page);
      w = await wide();
      const fit = await page.evaluate(() => { const ok = (sel) => [...document.querySelectorAll(sel)].every((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }); return { header: ok("#appview header > *, #appview .hright > *"), composer: ok(".cform > *, .ctx, .chips, .hint"), bar: ok(".art .bar > *, .art .foot > *"), font: parseFloat(getComputedStyle(document.getElementById("in")).fontSize) }; });
      check(tag + " app: no horizontal overflow", w.doc <= w.win && fit.header && fit.composer && fit.bar, { w, fit });
      check(tag + " text boxes are 16px on touch devices", fit.font >= 16, fit.font);
      await shot(page, "m-" + vp.width + "-" + lang + "-app");
      // A long file name must wrap inside the composer.
      await page.evaluate(() => { const d = JSON.parse(sessionStorage.getItem("nexus_v2")); const m = d.msgs.find((x) => x.kind === "script"); m.file = "a_very_long_indicator_file_name_that_keeps_going_and_going_and_going_on.pine"; d.cur = { id: m.id, file: m.file }; const s = JSON.stringify(d); sessionStorage.setItem("nexus_v2", s); localStorage.setItem("nexus_v2", s); });
      await page.reload({ waitUntil: "load" });
      w = await wide();
      const cw = await page.evaluate(() => document.querySelector(".composer").scrollWidth <= window.innerWidth + 1);
      check(tag + " a long file name does not widen the page", w.doc <= w.win && cw, w);
      cleanLog(tag, log);
      await ctx.close();
    }
  }
});

test("keyboard: tab order stays inside what is visible", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await page.locator("#tgrid .tcard").first().click(); await idle(page);
  await page.evaluate(() => document.body.focus());
  const stops = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); return { id: e.id || e.className || e.tagName, inLanding: !!e.closest("#landing"), inDrawer: !!e.closest("#drawer"), visible: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" }; });
    if (!s) break;
    stops.push(s);
  }
  check("no tab stop in the hidden landing page or the closed drawer", stops.length > 5 && stops.every((s) => !s.inLanding && !s.inDrawer && s.visible), stops.filter((s) => s.inLanding || s.inDrawer || !s.visible));
  await page.click("#menu"); await sleep(300);
  check("open drawer: focus moves into it", await page.evaluate(() => !!document.activeElement.closest("#drawer")));
  await page.keyboard.press("Escape"); await sleep(50);
  check("Escape closes the drawer and returns the focus", await page.evaluate(() => !document.getElementById("drawer").classList.contains("on") && document.activeElement.id === "menu"));
  const how = page.locator('.art .foot .btn2[data-i18n="a_how"]').first();
  await how.focus(); await page.keyboard.press("Enter"); await sleep(120);
  check("dialog: labelled and focused", await page.evaluate(() => { const m = document.getElementById("howModal"); return m.classList.contains("on") && m.getAttribute("aria-labelledby") === "howTitle" && m.contains(document.activeElement) && document.activeElement.getAttribute("aria-label") === "Close"; }));
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  check("Tab does not leave the dialog into the page", await page.evaluate(() => !document.activeElement.closest("#wrap, .composer, #drawer, #appview header")));
  await page.keyboard.press("Escape"); await sleep(80);
  check("focus returns to the button that opened the dialog", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-i18n") === "a_how"));
  check("status messages are announced", await page.evaluate(() => document.getElementById("live").getAttribute("role") === "status" && document.getElementById("toast").getAttribute("role") === "status" && document.getElementById("live").textContent.length > 0));
  cleanLog("keyboard", log);
  await ctx.close();
});

test("copy and download", async () => {
  const { ctx, page, log } = await open();
  await page.goto(BASE + "/#app", { waitUntil: "load" });
  await page.click("#langA");
  await page.locator("#tgrid .tcard").first().click(); await idle(page);
  await page.click(".art .bar .btn2 >> nth=0"); await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("Copy puts the whole script on the clipboard", /^\/\/@version=6/.test(clip) && clip.length > 2000, clip.length);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(".art .bar .btn2 >> nth=1")]);
  check("download has a .pine name", /^[A-Za-z0-9_.-]+\.pine$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  // When copying is impossible the code is expanded and the user is told.
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("denied")); document.execCommand = () => false; });
  await page.click(".art .bar .btn2 >> nth=0"); await sleep(250);
  check("copy failure is not silent", await page.evaluate(() => /Could not copy/.test(document.getElementById("toast").textContent) && !document.querySelector(".codewrap").classList.contains("closed")));
  // A very long line is rendered without freezing the tab.
  const longLine = "//@version=6\nindicator(\"x\")\ny = " + "ta.".repeat(20000) + "x\nplot(close)\n";
  await mockPost(page, () => ndjson([{ t: "final", kind: "script", code: longLine, file: "long.pine", explain: "", report: { verified: true, errors: [], warnings: [] } }]));
  const t0 = Date.now();
  await page.fill("#in", "long line"); await page.keyboard.press("Enter"); await idle(page);
  check("a 60 KB line renders quickly", Date.now() - t0 < 2500, Date.now() - t0);
  cleanLog("copy", log);
  await ctx.close();
});

test("Brain Indicators and the staging page use their own endpoint and storage", async () => {
  for (const [url, key, endpoint] of [["/indicators", "brain_ind_v2", "/api/indicator"], ["/nexus-next", "nexus_stage_v2", "/api/nexus"]]) {
    const { ctx, page, log } = await open();
    const urls = [];
    page.on("request", (r) => { if (r.method() === "POST") urls.push(new URL(r.url()).pathname); });
    await page.goto(BASE + url, { waitUntil: "load" });
    check(url + ": app is shown directly, no Home button", await page.evaluate(() => document.getElementById("appview").classList.contains("on") && document.getElementById("home").hidden && !document.getElementById("landing")));
    await page.locator("#tgrid .tcard").nth(1).click(); await idle(page);
    const st = await store(page, key);
    check(url + ": own endpoint and storage key", urls[0] === endpoint && st && st.msgs.length === 2 && (await store(page, "nexus_v2")) === null, { urls, st: st && st.msgs.length });
    check(url + ": not indexed", (await page.getAttribute('meta[name="robots"]', "content")) === "noindex,nofollow");
    cleanLog(url, log);
    await ctx.close();
  }
});

test("Brain (private app): closed without the owner key, opened by the activation link", async () => {
  const KEY = "e2e-brain-key-0123456789abcdefgh";
  const agentPosts = (log) => log.agent.filter((r) => r.method === "POST" && /\/api\/agent/.test(r.url));
  const openBrain = async (hash) => {
    const o = await open();
    o.log.agent = [];
    o.page.on("request", (r) => { if (/\/api\/(agent|email)/.test(r.url())) o.log.agent.push({ method: r.method(), url: r.url(), key: r.headers()["x-brain-key"] || "" }); });
    await o.page.goto(BASE + "/brain" + (hash || ""), { waitUntil: "load" });
    await sleep(300);
    return o;
  };
  // A device that was never activated.
  let { ctx, page, log } = await openBrain("");
  check("status shows that the device needs activation", /needs activation|تفعيل/.test(await page.textContent("#stat")), await page.textContent("#stat"));
  await page.fill("#in", "what is in my inbox?"); await page.keyboard.press("Enter");
  await page.waitForSelector(".msg.b input[type=password]", { timeout: 5000 });
  check("a request without the key is refused with a way to activate", /not activated|مش مفعّل/.test(await page.textContent(".msg.b .bub")));
  check("nothing was stored as a conversation", (await page.evaluate(() => localStorage.getItem("brain_convo"))) === "[]" || (await page.evaluate(() => localStorage.getItem("brain_convo"))) === null, await page.evaluate(() => localStorage.getItem("brain_convo")));
  await page.fill(".msg.b input[type=password]", "wrong-key-wrong-key-wrong-key-12"); await page.click(".msg.b .bub button"); await sleep(400);
  check("a wrong key is rejected", /too short or wrong|قصير أو غلط/.test(await page.textContent(".msg.b .bub")) && (await page.evaluate(() => localStorage.getItem("brain_key"))) === null);
  // The email check-up is closed as well.
  const emailClosed = await page.evaluate(async () => { const r = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); return { status: r.status, body: await r.json().catch(() => null) }; });
  check("the inbox endpoint is closed without the key", emailClosed.status === 401 && emailClosed.body && emailClosed.body.locked === true || emailClosed.status === 404, emailClosed);
  // Pasting the whole activation link works too.
  await page.fill(".msg.b input[type=password]", BASE + "/brain#key=" + KEY); await page.click(".msg.b .bub button"); await sleep(500);
  check("pasting the activation link activates the device", /activated|تفعّل/.test(await page.textContent(".msg.b .bub")) && (await page.evaluate(() => localStorage.getItem("brain_key"))) === KEY && /active/.test(await page.textContent("#stat")));
  await page.fill("#in", "hello"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => { const b = document.querySelectorAll(".msg.b .bub"); return b.length >= 2 && b[b.length - 1].textContent.length > 20 && !document.getElementById("send").disabled; }, null, { timeout: 15000 });
  const posts = agentPosts(log);
  check("after activation requests carry the key in a header, never in the URL", posts.length === 2 && posts[0].key === "" && posts[1].key === KEY && log.agent.every((r) => !/key=/.test(r.url)), posts.map((r) => ({ k: r.key ? "set" : "", u: r.url })));
  check("no page errors", log.errors.length === 0, log.errors);
  await ctx.close();
  // The activation link itself.
  ({ ctx, page, log } = await openBrain("#key=" + KEY));
  check("the link stores the key and removes it from the address bar", (await page.evaluate(() => localStorage.getItem("brain_key"))) === KEY && (await page.evaluate(() => location.hash)) === "" && !/key=/.test(page.url()), page.url());
  check("status is active on an activated device", /active/.test(await page.textContent("#stat")), await page.textContent("#stat"));
  check("no page errors (activated)", log.errors.length === 0, log.errors);
  await ctx.close();
});

// ---------- run ----------
try {
  await waitServer();
  browser = await chromium.launch({ executablePath: EXE, headless: true, args: ["--no-sandbox", "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1", "--disable-background-networking", "--disable-component-update", "--no-first-run"] });
  const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, "i") : null;
  for (const t of tests) {
    if (only && !only.test(t.name)) continue;
    console.log("- " + t.name);
    try { await t.fn(); } catch (e) { check(t.name + ": ran to the end", false, String((e && e.stack) || e).slice(0, 900)); }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
console.log(`\nui-e2e: ${passed} passed, ${failed} failed`);
if (failed) { console.log(failures.map((f) => "  - " + f.slice(0, 900)).join("\n")); process.exit(1); }
