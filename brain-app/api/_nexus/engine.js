// Nexus engine: generate -> check -> repair. Pure orchestration; the model call is injected so it can be tested offline.
import { checkPine, sanitizeCode, describeDiagnostics, summarizeCheck } from "./lint.js";
import { TEMPLATE_BY_ID } from "./templates.js";
import { modeInstructions } from "./knowledge.js";

export const MAX_REPAIR_ROUNDS = 3;

// ---------- reply parsing ----------

function tag(text, name) {
  const m = new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">", "i").exec(text);
  return m ? m[1] : null;
}

// Parses one <nexus> reply. Tolerates a missing closing tag on the last block (truncated output).
export function parseReply(text) {
  const src = String(text || "");
  const out = { title: "", file: "", base: "", templateId: "", code: null, codeClosed: false, edits: [], explain: "", raw: src };
  out.title = (tag(src, "title") || "").trim().slice(0, 120);
  out.file = (tag(src, "file") || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  const baseRaw = (tag(src, "base") || "").trim();
  const tm = /^TEMPLATE\s*:\s*([A-Za-z0-9_]+)/i.exec(baseRaw);
  if (tm) { out.base = "TEMPLATE"; out.templateId = tm[1].toLowerCase(); }
  else if (/^CURRENT/i.test(baseRaw)) out.base = "CURRENT";
  else if (/^NONE/i.test(baseRaw)) out.base = "NONE";
  else if (/^NEW/i.test(baseRaw)) out.base = "NEW";

  const cs = src.search(/<code>/i);
  if (cs >= 0) {
    const from = cs + 6;
    const ce = src.indexOf("</code>", from);
    out.code = ce >= 0 ? src.slice(from, ce) : src.slice(from);
    out.codeClosed = ce >= 0;
    if (!out.base) out.base = "NEW";
  }
  const editsBody = tag(src, "edits");
  if (editsBody !== null) {
    const re = /<{5,9} ?FIND[ \t]*\n([\s\S]*?)\n={5,9}[ \t]*\n([\s\S]*?)>{5,9} ?END/g;
    let m;
    while ((m = re.exec(editsBody)) !== null) out.edits.push({ find: m[1], replace: m[2].replace(/\n$/, "") });
    // "=======" directly followed by ">>>>>>> END" (pure deletion) has no newline between them.
    const reDel = /<{5,9} ?FIND[ \t]*\n([\s\S]*?)\n={5,9}[ \t]*>{5,9} ?END/g;
    while ((m = reDel.exec(editsBody)) !== null) out.edits.push({ find: m[1], replace: "" });
  }
  const ex = tag(src, "explain");
  if (ex !== null) out.explain = ex.trim();
  else {
    const es = src.search(/<explain>/i);
    if (es >= 0) out.explain = src.slice(es + 9).replace(/<\/nexus>\s*$/i, "").trim();
  }
  if (!out.base && !out.code && !out.edits.length) {
    // The model ignored the protocol. Accept a fenced Pine block as a NEW script, otherwise treat it as plain text.
    const f = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)(?:```|$)/.exec(src);
    if (f && /\/\/@version=/.test(f[1])) { out.base = "NEW"; out.code = f[1]; out.codeClosed = /```\s*$/.test(src.slice(f.index + 3)); out.explain = src.replace(f[0], "").trim(); }
    else { out.base = "NONE"; out.explain = out.explain || src.replace(/<\/?nexus>/gi, "").trim(); }
  }
  return out;
}

// ---------- edits ----------

const rtrimLines = (s) => String(s).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n");

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// Applies search/replace edits in order. An edit must match exactly once; otherwise it is reported, not guessed.
export function applyEdits(base, edits) {
  let code = rtrimLines(base);
  const failed = [];
  let applied = 0;
  for (let k = 0; k < edits.length; k++) {
    const find = rtrimLines(edits[k].find).replace(/^\n+|\n+$/g, "");
    const replace = rtrimLines(edits[k].replace).replace(/\n+$/g, "");
    if (!find.trim()) { failed.push({ index: k, reason: "empty FIND block", find }); continue; }
    let n = countOccurrences(code, find);
    if (n === 1) { code = code.replace(find, () => replace); applied++; continue; }
    if (n > 1) { failed.push({ index: k, reason: `FIND text appears ${n} times; include more surrounding lines so it is unique`, find }); continue; }
    // Not found verbatim: retry ignoring indentation differences, line by line.
    const fl = find.split("\n").map((l) => l.trim());
    const cl = code.split("\n");
    const hits = [];
    for (let i = 0; i + fl.length <= cl.length; i++) {
      let ok = true;
      for (let j = 0; j < fl.length; j++) { if (cl[i + j].trim() !== fl[j]) { ok = false; break; } }
      if (ok) hits.push(i);
    }
    if (hits.length === 1) {
      // Re-indent the replacement to the block it replaces when the model dropped the indentation.
      const baseIndent = /^[ ]*/.exec(cl[hits[0]])[0];
      const repLines = replace.length ? replace.split("\n") : [];
      const findIndent = /^[ ]*/.exec(edits[k].find.replace(/^\n+/, "").split("\n")[0] || "")[0];
      const shift = baseIndent.length - findIndent.length;
      const fixed = shift > 0 ? repLines.map((l) => (l.length ? " ".repeat(shift) + l : l)) : shift < 0 ? repLines.map((l) => (l.startsWith(" ".repeat(-shift)) ? l.slice(-shift) : l)) : repLines;
      cl.splice(hits[0], fl.length, ...fixed);
      code = cl.join("\n");
      applied++;
      continue;
    }
    failed.push({ index: k, reason: hits.length > 1 ? `FIND text appears ${hits.length} times; include more surrounding lines` : "FIND text not found in the script (copy the lines exactly as they are)", find });
  }
  return { code, applied, failed };
}

// ---------- prompts ----------

const clip = (s, n) => (s.length > n ? s.slice(0, n) + "\n[... truncated ...]" : s);

function historyToMessages(history) {
  const msgs = [];
  for (const m of history || []) {
    const role = m.role === "assistant" ? "assistant" : "user";
    let text = "";
    if (typeof m.content === "string") text = m.content;
    else if (Array.isArray(m.content)) text = m.content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
    text = clip(String(text || "").trim(), 3000);
    if (!text) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n\n" + text;
    else msgs.push({ role, content: text });
  }
  // The API needs the conversation to start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.slice(-8);
}

function scriptBlock(code) {
  return "CURRENT SCRIPT:\n```pine\n" + code.trimEnd() + "\n```";
}

// Builds the message list for a first-pass request.
export function buildMessages({ mode, lang, history, userContent, currentCode, tvError, check }) {
  const prior = historyToMessages(history);
  while (prior.length && prior[0].role !== "user") prior.shift();
  if (prior.length && prior[prior.length - 1].role === "user") prior.pop(); // never two user turns in a row
  const blocks = [];
  let text = "";
  if (Array.isArray(userContent)) {
    for (const b of userContent) {
      if (!b) continue;
      if (b.type === "text") text += (text ? "\n" : "") + b.text;
      else if (b.type === "image" || b.type === "document") blocks.push(b);
    }
  } else text = String(userContent || "");
  const parts = [modeInstructions(mode, lang)];
  if (currentCode) parts.push(scriptBlock(currentCode));
  if (mode === "fix") {
    if (tvError) parts.push("TRADINGVIEW REPORTED (copied by the user from the Pine Editor):\n" + clip(String(tvError).trim(), 2500));
    if (check && (!check.clean || check.shouldFix.length)) parts.push("AUTOMATIC CHECKER FINDINGS for the current script:\n" + describeDiagnostics(check));
  }
  parts.push("USER REQUEST:\n" + (clip(text.trim(), 12000) || (mode === "fix" ? "Fix the script." : "Design an indicator from the attachment.")));
  blocks.push({ type: "text", text: parts.join("\n\n") });
  return prior.concat([{ role: "user", content: blocks }]);
}

function repairMessages({ lang, request, code, check, failedEdits }) {
  const parts = [modeInstructions("repair", lang)];
  parts.push("WHAT THE USER ASKED FOR (context only):\n" + clip(request || "(no text)", 1500));
  parts.push(scriptBlock(code));
  if (failedEdits && failedEdits.length) {
    parts.push("YOUR PREVIOUS EDITS THAT COULD NOT BE APPLIED (redo them against the CURRENT SCRIPT above):\n" + failedEdits.slice(0, 6).map((f) => `- ${f.reason}:\n${clip(f.find, 400)}`).join("\n"));
  }
  if (check.errors.length || check.mustFix.length || check.shouldFix.length) parts.push("CHECKER FINDINGS:\n" + describeDiagnostics(check));
  return [{ role: "user", content: [{ type: "text", text: parts.join("\n\n") }] }];
}

// ---------- pipeline ----------

function scoreOf(check, failedEdits) { return check.errors.length * 100 + (failedEdits ? failedEdits.length : 0) * 10 + check.mustFix.length; }

function fileNameFor(parsed, fallback) {
  let f = parsed.file || fallback || "nexus_indicator.pine";
  if (!/\.pine$/i.test(f)) f += ".pine";
  return f;
}

/**
 * Runs one request.
 * opts: { mode: "build"|"fix", lang, history, userContent, currentCode, tvError, callModel, emit, deadline, maxRounds }
 * callModel({ messages, effort, onText }) -> { text, stopReason, usage, model }
 * emit(event) receives stage / code / explain events for the UI.
 */
export async function runPipeline(opts) {
  const emit = opts.emit || (() => {});
  const maxRounds = opts.maxRounds ?? MAX_REPAIR_ROUNDS;
  const timeLeft = () => (opts.deadline ? opts.deadline - Date.now() : Infinity);
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
  const addUsage = (u) => { if (!u) return; usage.calls++; usage.input += u.input || 0; usage.output += u.output || 0; usage.cacheRead += u.cacheRead || 0; usage.cacheWrite += u.cacheWrite || 0; };

  const current = opts.currentCode ? sanitizeCode(opts.currentCode) : "";
  const currentCheck = current ? checkPine(current) : null;
  let requestText = "";
  if (Array.isArray(opts.userContent)) requestText = opts.userContent.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
  else requestText = String(opts.userContent || "");

  // ---- pass 1: the model's answer ----
  emit({ t: "stage", id: "write" });
  const streamer = makeStreamer(emit);
  const first = await opts.callModel({
    messages: buildMessages({ mode: opts.mode, lang: opts.lang, history: opts.history, userContent: opts.userContent, currentCode: current, tvError: opts.tvError, check: currentCheck }),
    effort: opts.effort,
    onText: streamer.push,
  });
  addUsage(first.usage);
  let parsed = parseReply(first.text);
  let modelUsed = first.model;

  if (first.stopReason === "refusal") {
    return { kind: "text", explain: opts.lang === "en" ? "I can't help with that request. Describe the TradingView indicator you want and I'll build it." : "ما بقدر ساعد بهالطلب. وصّفلي مؤشر TradingView اللي بدك ياه وببنيه.", usage, model: modelUsed };
  }

  // Truncated NEW script: ask once for the remainder.
  if (parsed.base === "NEW" && parsed.code !== null && !parsed.codeClosed && first.stopReason === "max_tokens" && timeLeft() > 40000) {
    emit({ t: "stage", id: "continue" });
    const cont = await opts.callModel({
      messages: [{ role: "user", content: [{ type: "text", text: "Your previous reply was cut off by the length limit. Below is the script as far as it got. Continue it from exactly where it stops: output ONLY the remaining lines (no repetition of what is already written), then close with </code>, an <explain> block in the user's language, and </nexus>.\n\n<code>\n" + parsed.code + "" }] }],
      effort: "low",
      onText: () => {},
    });
    addUsage(cont.usage);
    const rest = cont.text.replace(/^[\s\S]*?<code>\n?/i, "");
    const merged = "<nexus><base>NEW</base><title>" + parsed.title + "</title><file>" + parsed.file + "</file><code>" + parsed.code + (rest.startsWith("\n") || parsed.code.endsWith("\n") ? "" : "\n") + rest;
    const p2 = parseReply(merged.includes("</code>") ? merged : merged + "</code>");
    if (p2.code) parsed = { ...p2, title: parsed.title || p2.title, file: parsed.file || p2.file };
  }

  const noScript = parsed.base === "NONE"
    || (parsed.base === "NEW" && parsed.code === null)
    || (parsed.base === "CURRENT" && parsed.code === null && !parsed.edits.length)
    || (parsed.base === "CURRENT" && !current && parsed.code === null);
  if (noScript) return { kind: "text", explain: parsed.explain || first.text.replace(/<[^>]+>/g, "").trim(), usage, model: modelUsed };

  // ---- materialise the script ----
  let baseCode = "";
  let baseKind = parsed.base;
  let template = null;
  if (parsed.base === "TEMPLATE") {
    template = TEMPLATE_BY_ID.get(parsed.templateId) || null;
    if (!template) { baseKind = "NEW"; baseCode = ""; }
    else baseCode = template.code;
  } else if (parsed.base === "CURRENT") baseCode = current;

  let code = "";
  let failedEdits = [];
  if (parsed.code !== null && (parsed.base === "NEW" || !baseCode)) code = sanitizeCode(parsed.code);
  else {
    const r = applyEdits(baseCode, parsed.edits);
    code = sanitizeCode(r.code);
    failedEdits = r.failed;
  }
  if (!code.trim()) {
    return { kind: "text", explain: parsed.explain || (opts.lang === "en" ? "I could not produce a script for that. Please describe the indicator again." : "ما قدرت اطلّع سكربت لهالطلب. وصّفلي المؤشر مرة تانية."), usage, model: modelUsed };
  }

  let check = checkPine(code);
  let best = { code: check.code, check, failedEdits };
  emit({ t: "stage", id: "check", errors: check.errors.length, warnings: check.mustFix.length, round: 0 });

  // ---- repair loop ----
  let rounds = 0;
  let shouldFixTried = false;
  let stagnant = 0;
  const history = [{ round: 0, errors: check.errors.length, mustFix: check.mustFix.length, failedEdits: failedEdits.length }];
  while (rounds < maxRounds && timeLeft() > 25000) {
    const needs = !check.clean || failedEdits.length > 0 || (!shouldFixTried && check.shouldFix.length > 0);
    if (!needs) break;
    if (check.clean && !failedEdits.length) shouldFixTried = true;
    rounds++;
    emit({ t: "stage", id: "fix", round: rounds, errors: check.errors.length, warnings: check.mustFix.length });
    let rep;
    try {
      rep = await opts.callModel({ messages: repairMessages({ lang: opts.lang, request: requestText, code: check.code, check, failedEdits }), effort: "medium", onText: () => {} });
    } catch (e) { history.push({ round: rounds, error: String((e && e.message) || e) }); break; }
    addUsage(rep.usage);
    const rp = parseReply(rep.text);
    let next = check.code;
    let nextFailed = [];
    if (rp.code !== null && rp.base === "NEW") next = sanitizeCode(rp.code);
    else if (rp.edits.length) { const r = applyEdits(check.code, rp.edits); next = sanitizeCode(r.code); nextFailed = r.failed; }
    else { history.push({ round: rounds, note: "no edits returned" }); break; }
    const nextCheck = checkPine(next);
    history.push({ round: rounds, errors: nextCheck.errors.length, mustFix: nextCheck.mustFix.length, failedEdits: nextFailed.length });
    emit({ t: "stage", id: "check", errors: nextCheck.errors.length, warnings: nextCheck.mustFix.length, round: rounds });
    if (scoreOf(nextCheck, nextFailed) < scoreOf(best.check, best.failedEdits)) {
      best = { code: nextCheck.code, check: nextCheck, failedEdits: nextFailed };
      stagnant = 0;
    } else stagnant++;
    if (stagnant >= 2) break;
    // Always continue from the best version seen so far.
    check = best.check;
    failedEdits = best.failedEdits;
  }

  const final = best;
  const explain = parsed.explain || (template && (!parsed.edits.length) ? template.explain[opts.lang === "en" ? "en" : "ar"] : "");
  return {
    kind: "script",
    code: final.code,
    file: fileNameFor(parsed, template ? template.file : ""),
    title: parsed.title || (template ? template.title.en : ""),
    explain,
    base: template && baseKind === "TEMPLATE" ? "template:" + template.id : baseKind === "CURRENT" ? "edit" : "new",
    report: { ...summarizeCheck(final.check), rounds, history, unappliedEdits: final.failedEdits.length, verified: final.check.clean && final.failedEdits.length === 0 },
    usage,
    model: modelUsed,
  };
}

// Streams <code> and <explain> content to the UI while the model is still writing.
export function makeStreamer(emit) {
  let buf = "";
  let codeSent = 0;
  let explainSent = 0;
  let announced = false;
  const HOLD = 10; // keep a few characters back so a closing tag is never emitted
  const section = (open, close) => {
    const s = buf.indexOf(open);
    if (s < 0) return null;
    const from = s + open.length;
    const e = buf.indexOf(close, from);
    return { from, to: e >= 0 ? e : Math.max(from, buf.length - HOLD), closed: e >= 0 };
  };
  return {
    push(delta) {
      buf += delta;
      const c = section("<code>", "</code>");
      if (c && c.to - c.from > codeSent) { const d = buf.slice(c.from + codeSent, c.to); codeSent += d.length; if (d) emit({ t: "code", d }); }
      const x = section("<explain>", "</explain>");
      if (x && x.to - x.from > explainSent) { const d = buf.slice(x.from + explainSent, x.to); explainSent += d.length; if (d) emit({ t: "explain", d }); }
      if (!c && !x) {
        const b = /<base>\s*(TEMPLATE\s*:\s*\w+|CURRENT)/i.exec(buf);
        if (b && !announced) { announced = true; emit({ t: "stage", id: /CURRENT/i.test(b[1]) ? "edit" : "template", template: /TEMPLATE/i.test(b[1]) ? b[1].split(":")[1].trim().toLowerCase() : undefined }); }
      }
    },
    text: () => buf,
  };
}
