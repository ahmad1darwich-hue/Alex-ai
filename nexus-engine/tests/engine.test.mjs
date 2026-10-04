// Run: node nexus-engine/tests/engine.test.mjs
import assert from "node:assert/strict";
import { parseReply, applyEdits, runPipeline, makeStreamer, buildMessages } from "../../brain-app/api/_nexus/engine.js";
import { TEMPLATE_BY_ID } from "../../brain-app/api/_nexus/templates.js";

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", e.stack.split("\n").slice(0, 4).join("\n  ")); process.exitCode = 1; } };
const mock = (replies) => { const calls = []; let i = 0; const fn = async ({ messages, effort, onText }) => { calls.push({ messages, effort }); const text = replies[Math.min(i++, replies.length - 1)]; if (onText) for (let k = 0; k < text.length; k += 37) onText(text.slice(k, k + 37)); return { text, stopReason: "end_turn", usage: { input: 10, output: 5 }, model: "mock" }; }; fn.calls = calls; return fn; };

const GOOD = `//@version=6
indicator("Test EMA", shorttitle = "T EMA", overlay = true)
lenInput = input.int(20, "Length", minval = 1)
ema = ta.ema(close, lenInput)
plot(ema, "EMA", color = color.teal)
`;
const BAD = GOOD.replace("ema = ta.ema(close, lenInput)", "ema = ta.ema(close, lenInput");

await t("parseReply: NEW with code and explain", () => {
  const p = parseReply(`<nexus>\n<title>Test</title>\n<file>test.pine</file>\n<base>NEW</base>\n<code>\n${GOOD}</code>\n<explain>\nhello\n</explain>\n</nexus>`);
  assert.equal(p.base, "NEW"); assert.equal(p.codeClosed, true); assert.match(p.code, /indicator\("Test EMA"/); assert.equal(p.explain, "hello"); assert.equal(p.file, "test.pine");
});
await t("parseReply: edits incl. deletion and array generics", () => {
  const p = parseReply(`<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nvar array<float> xs = array.new<float>()\n=======\nvar array<float> xs = array.new<float>(0)\n>>>>>>> END\n<<<<<<< FIND\nplot(ema)\n=======\n>>>>>>> END\n</edits><explain>x</explain></nexus>`);
  assert.equal(p.base, "CURRENT"); assert.equal(p.edits.length, 2); assert.equal(p.edits[1].replace, ""); assert.match(p.edits[0].replace, /array\.new<float>\(0\)/);
});
await t("parseReply: truncated code is flagged", () => {
  const p = parseReply(`<nexus><base>NEW</base><code>\n//@version=6\nindicator("x")\nplot(clo`);
  assert.equal(p.codeClosed, false); assert.match(p.code, /plot\(clo$/);
});
await t("parseReply: fenced fallback and plain text", () => {
  const p = parseReply("Here you go:\n```pine\n" + GOOD + "```\nEnjoy");
  assert.equal(p.base, "NEW"); assert.match(p.code, /@version=6/);
  const q = parseReply("Nexus builds TradingView indicators. What would you like?");
  assert.equal(q.base, "NONE"); assert.match(q.explain, /Nexus builds/);
});
await t("applyEdits: exact, ambiguous, missing, indentation-tolerant", () => {
  const base = "a = 1\nif a > 0\n    b = 2\n    c = 3\nd = 4\n";
  let r = applyEdits(base, [{ find: "d = 4", replace: "d = 5" }]);
  assert.equal(r.applied, 1); assert.match(r.code, /d = 5/);
  r = applyEdits("x = 1\nx = 1\n", [{ find: "x = 1", replace: "x = 2" }]);
  assert.equal(r.failed.length, 1); assert.match(r.failed[0].reason, /2 times/);
  r = applyEdits(base, [{ find: "zzz", replace: "y" }]);
  assert.equal(r.failed.length, 1);
  r = applyEdits(base, [{ find: "b = 2\nc = 3", replace: "b = 20\nc = 30" }]);
  assert.equal(r.applied, 1); assert.match(r.code, /\n    b = 20\n    c = 30\n/);
  r = applyEdits(base, [{ find: "d = 4", replace: "$& and $1" }]);
  assert.match(r.code, /\$& and \$1/, "replacement must be literal");
});
await t("pipeline: template delivered unchanged is verified with zero repair rounds", async () => {
  const cm = mock(["<nexus><title>SMC</title><file>x.pine</file><base>TEMPLATE:smc</base><edits>\n</edits><explain>شرح</explain></nexus>"]);
  const ev = [];
  const r = await runPipeline({ mode: "build", lang: "ar", history: [], userContent: "مؤشر SMC كامل", callModel: cm, emit: (e) => ev.push(e) });
  assert.equal(r.kind, "script"); assert.equal(r.code, TEMPLATE_BY_ID.get("smc").code); assert.equal(r.report.verified, true); assert.equal(r.report.rounds, 0); assert.equal(cm.calls.length, 1); assert.equal(r.base, "template:smc");
  assert.ok(ev.some((e) => e.t === "stage" && e.id === "template"));
});
await t("pipeline: template with an edit", async () => {
  const cm = mock(['<nexus><base>TEMPLATE:trend</base><edits>\n<<<<<<< FIND\nint    emaLenInput    = input.int(50, "Baseline EMA length", minval = 2, group = GRP_T, tooltip = "Price must be on the trend side of this EMA.")\n=======\nint    emaLenInput    = input.int(100, "Baseline EMA length", minval = 2, group = GRP_T, tooltip = "Price must be on the trend side of this EMA.")\n>>>>>>> END\n</edits><explain>ok</explain></nexus>']);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "trend with ema 100", callModel: cm });
  assert.match(r.code, /input\.int\(100, "Baseline EMA length"/); assert.equal(r.report.verified, true); assert.equal(r.report.unappliedEdits, 0);
});
await t("pipeline: broken NEW script is repaired by edits", async () => {
  const cm = mock([`<nexus><base>NEW</base><title>T</title><file>t.pine</file><code>\n${BAD}</code><explain>e</explain></nexus>`, "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nema = ta.ema(close, lenInput\n=======\nema = ta.ema(close, lenInput)\n>>>>>>> END\n</edits><explain></explain></nexus>"]);
  const ev = [];
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "ema", callModel: cm, emit: (e) => ev.push(e) });
  assert.equal(r.report.verified, true); assert.equal(r.report.rounds, 1); assert.equal(r.code, GOOD); assert.equal(r.explain, "e");
  const repairPrompt = cm.calls[1].messages[0].content[0].text;
  assert.match(repairPrompt, /CHECKER FINDINGS/); assert.match(repairPrompt, /Missing closing parenthesis/);
  assert.ok(ev.some((e) => e.t === "code"), "code is streamed while writing");
});
await t("pipeline: repair that never converges stops and returns the best version, unverified", async () => {
  const cm = mock([`<nexus><base>NEW</base><code>\n${BAD}</code><explain>e</explain></nexus>`, "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nnot there\n=======\nx\n>>>>>>> END\n</edits></nexus>"]);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "ema", callModel: cm });
  assert.equal(r.report.verified, false); assert.ok(r.report.rounds >= 1 && r.report.rounds <= 3); assert.ok(r.report.errors.length >= 1);
});
await t("pipeline: failed first-pass edits trigger a redo round", async () => {
  const cm = mock(["<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, \"EMA\")\n=======\nplot(ema, \"EMA\", color = color.red)\n>>>>>>> END\n</edits><explain>e</explain></nexus>", "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, \"EMA\", color = color.teal)\n=======\nplot(ema, \"EMA\", color = color.red)\n>>>>>>> END\n</edits></nexus>"]);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "make it red", currentCode: GOOD, callModel: cm });
  assert.match(r.code, /color = color\.red/); assert.equal(r.report.verified, true); assert.equal(r.base, "edit");
  assert.match(cm.calls[1].messages[0].content[0].text, /COULD NOT BE APPLIED/);
});
await t("pipeline: NONE returns text only", async () => {
  const cm = mock(["<nexus><base>NONE</base><explain>BOS means break of structure.</explain></nexus>"]);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "what is BOS?", callModel: cm });
  assert.equal(r.kind, "text"); assert.match(r.explain, /break of structure/);
});
await t("pipeline: fix mode passes the TradingView error and checker findings", async () => {
  const cm = mock(["<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nema = ta.ema(close, lenInput\n=======\nema = ta.ema(close, lenInput)\n>>>>>>> END\n</edits><explain>fixed</explain></nexus>"]);
  const r = await runPipeline({ mode: "fix", lang: "en", history: [], userContent: "", currentCode: BAD, tvError: "Syntax error at input 'plot'", callModel: cm });
  const p = cm.calls[0].messages[0].content[0].text;
  assert.match(p, /TRADINGVIEW REPORTED/); assert.match(p, /AUTOMATIC CHECKER FINDINGS/); assert.equal(r.report.verified, true);
});
await t("buildMessages: history is trimmed, alternates, and ends with the user turn carrying attachments", () => {
  const m = buildMessages({ mode: "build", lang: "ar", history: [{ role: "assistant", content: "x" }, { role: "user", content: "first" }, { role: "assistant", content: "answer" }, { role: "user", content: "second" }], userContent: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }, { type: "text", text: "second" }], currentCode: GOOD });
  assert.equal(m[0].role, "user"); assert.equal(m[m.length - 1].role, "user"); assert.equal(m[m.length - 1].content[0].type, "image");
  for (let i = 1; i < m.length; i++) assert.notEqual(m[i].role, m[i - 1].role);
  assert.match(m[m.length - 1].content[1].text, /CURRENT SCRIPT/);
});
await t("streamer: never leaks a closing tag", () => {
  const ev = []; const s = makeStreamer((e) => ev.push(e));
  const text = "<nexus><base>NEW</base><code>\nline1\nline2\n</code><explain>hi there</explain></nexus>";
  for (const ch of text) s.push(ch);
  const code = ev.filter((e) => e.t === "code").map((e) => e.d).join(""); const ex = ev.filter((e) => e.t === "explain").map((e) => e.d).join("");
  assert.equal(code, "\nline1\nline2\n"); assert.equal(ex, "hi there");
});

// ---------- cases from the pre-launch review ----------
// A mock whose replies can carry a stop reason: [{ text, stop }].
const mockStops = (replies) => { const calls = []; let i = 0; const fn = async ({ messages, onText }) => { calls.push({ messages }); const r = replies[Math.min(i++, replies.length - 1)]; if (onText) onText(r.text); return { text: r.text, stopReason: r.stop || "end_turn", usage: { input: 1, output: 1 }, model: "mock" }; }; fn.calls = calls; return fn; };

await t("parseReply: CRLF, tags mentioned in prose, </code> inside the script, forgotten closing tag", () => {
  const crlf = parseReply("<nexus>\r\n<base>CURRENT</base>\r\n<edits>\r\n<<<<<<< FIND\r\nplot(ema)\r\n=======\r\nplot(ema, \"E\")\r\n>>>>>>> END\r\n</edits>\r\n<explain>x</explain></nexus>");
  assert.equal(crlf.edits.length, 1); assert.equal(crlf.edits[0].find, "plot(ema)"); assert.equal(crlf.editsIncomplete, false);
  const prose = parseReply("<nexus><title>I put it in a <code> block</title><base>NEW</base><code>\n" + GOOD + "</code><explain>e</explain></nexus>");
  assert.equal(prose.code.trim(), GOOD.trim());
  const inner = parseReply("<nexus><base>NEW</base><code>\n" + GOOD + '// note: "</code>" is not the end\nplot(close)\n</code><explain>e</explain></nexus>');
  assert.match(inner.code, /plot\(close\)\n$/); assert.equal(inner.codeClosed, true);
  const forgot = parseReply("<nexus><base>NEW</base><code>\n" + GOOD + "<explain>e</explain></nexus>");
  assert.equal(forgot.code.trim(), GOOD.trim()); assert.equal(forgot.codeClosed, true); assert.equal(forgot.explain, "e");
});
await t("parseReply: same-line deletion followed by another edit; cut-off edits are flagged", () => {
  const p = parseReply("<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\na = 1\n=======>>>>>>> END\n<<<<<<< FIND\nb = 2\n=======\nb = 3\n>>>>>>> END\n</edits></nexus>");
  assert.equal(p.edits.length, 2); assert.equal(p.edits[0].replace, ""); assert.equal(p.edits[1].replace, "b = 3");
  const cut = parseReply("<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\na = 1\n=======\na = 2\n>>>>>>> END\n<<<<<<< FIND\nlenInput = input.in");
  assert.equal(cut.edits.length, 1); assert.equal(cut.editsIncomplete, true);
});
await t("applyEdits: whole lines only, unique pieces of a line, literal replacement text", () => {
  let r = applyEdits("max := 1\nx := 1\n", [{ find: "x := 1", replace: "x := 5" }]);
  assert.equal(r.code, "max := 1\nx := 5\n"); assert.equal(r.applied, 1);
  r = applyEdits('plot(ta.ema(close, 20), "EMA")\n', [{ find: "ta.ema(close, 20)", replace: "ta.ema(close, 50)" }]);
  assert.equal(r.code, 'plot(ta.ema(close, 50), "EMA")\n');
  r = applyEdits("a = close\n", [{ find: "a = close", replace: "a = close // $& $1 $$" }]);
  assert.equal(r.code, "a = close // $& $1 $$\n");
  // An unindented FIND with an already-indented replacement is not indented twice.
  r = applyEdits("if x\n    y := 1\n", [{ find: "y := 1", replace: "    y := 2\n    z := 3" }]);
  assert.equal(r.code, "if x\n    y := 2\n    z := 3\n");
  r = applyEdits("if x\n    y := 1\n", [{ find: "y := 1", replace: "y := 2\nz := 3" }]);
  assert.equal(r.code, "if x\n    y := 2\n    z := 3\n");
  r = applyEdits("a = 1\n", [{ find: "b = 1", replace: "b = 2" }]);
  assert.equal(r.failed.length, 1); assert.equal(r.failed[0].replace, "b = 2");
});
await t("pipeline: a rewrite sent as <code> under CURRENT is used (not the unchanged script)", async () => {
  const RSI = GOOD.replace("ema = ta.ema(close, lenInput)", "ema = ta.rsi(close, lenInput)");
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "make it an RSI", currentCode: GOOD, callModel: mockStops([{ text: "<nexus><base>CURRENT</base><code>\n" + RSI + "</code><explain>Rewrote it.</explain></nexus>" }]) });
  assert.equal(r.kind, "script"); assert.match(r.code, /ta\.rsi/);
});
await t("pipeline: edits cut off by the length limit are not delivered as verified", async () => {
  const cutReply = { text: "<nexus><base>TEMPLATE:trend</base><edits>\n<<<<<<< FIND\nthis line does not matter", stop: "max_tokens" };
  const stuck = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "trend with changes", callModel: mockStops([cutReply, { text: "<nexus><base>NONE</base><explain>-</explain></nexus>" }]) });
  assert.equal(stuck.kind, "script"); assert.equal(stuck.report.verified, false); assert.ok(stuck.report.unappliedEdits >= 1);
  const tpl = TEMPLATE_BY_ID.get("trend").code.split("\n");
  const line = tpl.find((l) => /input\.int\(/.test(l));
  const done = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "trend with changes", callModel: mockStops([cutReply, { text: "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\n" + line + "\n=======\n" + line + " // tuned\n>>>>>>> END\n</edits><explain>-</explain></nexus>" }]) });
  assert.equal(done.report.verified, true); assert.equal(done.report.unappliedEdits, 0); assert.match(done.code, /\/\/ tuned/);
});
await t("pipeline: a repair reply that was cut off is never adopted", async () => {
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "ema", callModel: mockStops([
    { text: "<nexus><base>NEW</base><code>\n" + BAD + "</code><explain>e</explain></nexus>" },
    { text: "<nexus><base>NEW</base><code>\n" + GOOD.split("\n").slice(0, 3).join("\n") + "\n", stop: "max_tokens" },
  ]) });
  assert.equal(r.report.verified, false); assert.match(r.code, /plot\(ema/);
});
await t("pipeline: failed edits stay owed until their change is in the script", async () => {
  const first = "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nnot in the script A\n=======\nplot(close, \"A\")\n>>>>>>> END\n<<<<<<< FIND\nnot in the script B\n=======\nplot(open, \"B\")\n>>>>>>> END\n</edits><explain>e</explain></nexus>";
  const redoOne = "<nexus><base>CURRENT</base><edits>\n<<<<<<< FIND\nplot(ema, \"EMA\", color = color.teal)\n=======\nplot(ema, \"EMA\", color = color.teal)\nplot(close, \"A\")\n>>>>>>> END\n</edits><explain>-</explain></nexus>";
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "add two plots", currentCode: GOOD, callModel: mockStops([{ text: first }, { text: redoOne }, { text: "<nexus><base>NONE</base><explain>-</explain></nexus>" }]) });
  assert.match(r.code, /plot\(close, "A"\)/); assert.equal(r.report.unappliedEdits, 1); assert.equal(r.report.verified, false);
});
await t("pipeline: a round that only clears should-fix findings is adopted and counted", async () => {
  const REPAINT = GOOD + "htf = request.security(syminfo.tickerid, \"D\", close)\nplot(htf, \"HTF\")\n";
  const SAFE = GOOD + "htf = request.security(syminfo.tickerid, \"D\", close[1], lookahead = barmerge.lookahead_on)\nplot(htf, \"HTF\")\n";
  const cm = mockStops([{ text: "<nexus><base>NEW</base><code>\n" + REPAINT + "</code><explain>e</explain></nexus>" }, { text: "<nexus><base>NEW</base><code>\n" + SAFE + "</code><explain>-</explain></nexus>" }]);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "ema with daily close", callModel: cm });
  assert.equal(cm.calls.length, 2); assert.match(r.code, /close\[1\]/); assert.equal(r.report.fixed, 1); assert.equal(r.report.verified, true);
});
await t("pipeline: continuation restarts from the last complete line", async () => {
  const lines = GOOD.trimEnd().split("\n");
  const head = lines.slice(0, 4).join("\n") + "\nplot(ema, \"EMA\", color = colo";
  const cm = mockStops([{ text: "<nexus><title>T</title><file>t.pine</file><base>NEW</base><code>\n" + head, stop: "max_tokens" }, { text: lines[4] + "\n</code><explain>done</explain></nexus>" }]);
  const r = await runPipeline({ mode: "build", lang: "en", history: [], userContent: "ema", callModel: cm, deadline: Date.now() + 200000 });
  assert.equal(r.code, GOOD); assert.equal(r.report.verified, true);
  assert.ok(!/colo\n?$/.test(cm.calls[1].messages[0].content[0].text), "the half-written line is not sent back");
});
await t("pipeline: an empty reply is an error, and a cancelled request stops before calling the model", async () => {
  await assert.rejects(() => runPipeline({ mode: "build", lang: "en", history: [], userContent: "x", callModel: mockStops([{ text: "   " }]) }), (e) => e.kind === "empty");
  const ctl = new AbortController(); ctl.abort();
  const cm = mockStops([{ text: "<nexus><base>NONE</base><explain>x</explain></nexus>" }]);
  await assert.rejects(() => runPipeline({ mode: "build", lang: "en", history: [], userContent: "x", callModel: cm, signal: ctl.signal }), (e) => e.name === "AbortError");
  assert.equal(cm.calls.length, 0);
});
await t("buildMessages: attachments are rebuilt from validated fields; merged history stays bounded", () => {
  const big = "x".repeat(2900);
  const history = [];
  for (let i = 0; i < 600; i++) history.push({ role: "user", content: big });
  history.push({ role: "assistant", content: "ok" });
  const m = buildMessages({ mode: "build", lang: "en", history, userContent: [
    { type: "image", source: { type: "url", url: "https://example.com/a.png" } },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" }, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "document", source: { type: "text", media_type: "text/plain", data: "y".repeat(300000) }, citations: { enabled: true } },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
    { type: "text", text: "request" },
  ] });
  const last = m[m.length - 1].content;
  assert.deepEqual(last.slice(0, -1), [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } }]);
  const total = m.reduce((a, x) => a + (typeof x.content === "string" ? x.content.length : x.content.reduce((b, c) => b + (c.text ? c.text.length : 0), 0)), 0);
  assert.ok(total < 40000, "history size " + total);
});
await t("streamer: a template id is announced only when complete", () => {
  const ev = []; const s = makeStreamer((e) => ev.push(e));
  for (const ch of "<nexus><base>TEMPLATE:rsi_divergence</base><edits></edits>") s.push(ch);
  const st = ev.filter((e) => e.t === "stage" && e.id === "template");
  assert.equal(st.length, 1); assert.equal(st[0].template, "rsi_divergence");
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
