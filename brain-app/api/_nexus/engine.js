// Nexus engine: generate -> check -> repair. Pure orchestration; the model call is injected so it can be tested offline.
import { checkPine, sanitizeCode, describeDiagnostics, summarizeCheck, rtrimLine } from "./lint.js";
import { TEMPLATE_BY_ID } from "./templates.js";
import { modeInstructions } from "./knowledge.js";

export const MAX_REPAIR_ROUNDS = 3;

// ---------- reply parsing ----------

function tag(text, name) {
  const m = new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">", "i").exec(text);
  return m ? m[1] : null;
}

// Parses the body of an <edits> section line by line. A block that is cut off (no ">>>>>>> END") is dropped and
// reported through `incomplete`.
function parseEdits(body) {
  const edits = [];
  let state = 0, find = [], rep = [];
  for (const raw of body.split("\n")) {
    const l = rtrimLine(raw).trimStart();
    if (state === 0) {
      if (/^<{5,9} ?FIND$/.test(l)) { state = 1; find = []; rep = []; }
    } else if (state === 1) {
      const m = /^={5,9}[ \t]*(>{5,9} ?END)?$/.exec(l);
      if (!m) find.push(raw);
      else if (m[1]) { edits.push({ find: find.join("\n"), replace: "" }); state = 0; } // "=======>>>>>>> END": pure deletion
      else state = 2;
    } else if (/^>{5,9} ?END$/.test(l)) { edits.push({ find: find.join("\n"), replace: rep.join("\n") }); state = 0; }
    else rep.push(raw);
  }
  return { edits, incomplete: state !== 0 };
}

// Parses one <nexus> reply. Tolerates a missing closing tag on the last block (truncated output).
export function parseReply(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const lower = src.toLowerCase();
  const out = { title: "", file: "", base: "", templateId: "", code: null, codeClosed: false, edits: [], editsIncomplete: false, explain: "", raw: src };
  out.title = (tag(src, "title") || "").trim().slice(0, 120);
  out.file = (tag(src, "file") || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  const baseRaw = (tag(src, "base") || "").trim();
  const tm = /^TEMPLATE\s*:\s*([A-Za-z0-9_]+)/i.exec(baseRaw);
  if (tm) { out.base = "TEMPLATE"; out.templateId = tm[1].toLowerCase(); }
  else if (/^CURRENT/i.test(baseRaw)) out.base = "CURRENT";
  else if (/^NONE/i.test(baseRaw)) out.base = "NONE";
  else if (/^NEW/i.test(baseRaw)) out.base = "NEW";

  // The code block follows <base>; a "<code>" mentioned earlier in prose is not the block.
  const baseEnd = lower.indexOf("</base>");
  let cs = lower.indexOf("<code>", baseEnd >= 0 ? baseEnd : 0);
  if (cs < 0) cs = lower.indexOf("<code>");
  if (cs >= 0) {
    const from = cs + 6;
    const explainAt = lower.indexOf("<explain>", from);
    // The block ends at the last </code> before <explain>, so a "</code>" inside the script does not cut it short.
    let ce = lower.lastIndexOf("</code>", explainAt >= 0 ? explainAt : src.length);
    if (ce < from) ce = -1;
    if (ce >= 0) { out.code = src.slice(from, ce); out.codeClosed = true; }
    else if (explainAt >= 0) { out.code = src.slice(from, explainAt); out.codeClosed = true; } // closing tag forgotten
    else out.code = src.slice(from);
    if (!out.base) out.base = "NEW";
  }
  const es = lower.indexOf("<edits>");
  if (es >= 0) {
    const ee = lower.indexOf("</edits>", es + 7);
    const pe = parseEdits(ee >= 0 ? src.slice(es + 7, ee) : src.slice(es + 7));
    out.edits = pe.edits;
    out.editsIncomplete = pe.incomplete || ee < 0;
  }
  const ex = tag(src, "explain");
  if (ex !== null) out.explain = ex.trim();
  else {
    const xs = lower.indexOf("<explain>");
    if (xs >= 0) out.explain = src.slice(xs + 9).replace(/<\/nexus>\s*$/i, "").trim();
  }
  if (!out.base && out.code === null && !out.edits.length) {
    // The model ignored the protocol. Accept a fenced Pine block as a NEW script, otherwise treat it as plain text.
    const f = /```(?:pine|pinescript)?[ \t]*\n([\s\S]*?)(?:```|$)/.exec(src);
    if (f && /\/\/@version=/.test(f[1])) { out.base = "NEW"; out.code = f[1]; out.codeClosed = /```\s*$/.test(src.slice(f.index + 3)); out.explain = src.replace(f[0], "").trim(); }
    else { out.base = "NONE"; out.explain = out.explain || src.replace(/<\/?nexus>/gi, "").trim(); }
  }
  return out;
}

// ---------- edits ----------

const toLines = (s) => String(s).replace(/\r\n?/g, "\n").split("\n").map(rtrimLine);
const indentOf = (l) => { let i = 0; while (i < l.length && l[i] === " ") i++; return i; };

function findBlock(lines, block, loose) {
  const want = loose ? block.map((l) => l.trim()) : block;
  const hits = [];
  for (let i = 0; i + want.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) { if ((loose ? lines[i + j].trim() : lines[i + j]) !== want[j]) { ok = false; break; } }
    if (ok) { hits.push(i); if (hits.length > 8) break; }
  }
  return hits;
}

/**
 * Applies search/replace edits in order. FIND must match whole lines exactly once (first as written, then ignoring
 * indentation); a single-line FIND may also match one unique piece of a line. Anything else is reported, not guessed.
 */
export function applyEdits(base, edits) {
  const lines = toLines(base);
  const failed = [];
  let applied = 0;
  for (let k = 0; k < edits.length; k++) {
    const find = toLines(edits[k].find);
    while (find.length && !find[0].trim()) find.shift();
    while (find.length && !find[find.length - 1].trim()) find.pop();
    const rep = edits[k].replace ? toLines(edits[k].replace) : [];
    while (rep.length && !rep[rep.length - 1].trim()) rep.pop();
    const fail = (reason) => failed.push({ index: k, reason, find: find.join("\n"), replace: rep.join("\n") });
    if (!find.length) { fail("empty FIND block"); continue; }

    let hits = findBlock(lines, find, false);
    let loose = false;
    if (!hits.length) { hits = findBlock(lines, find, true); loose = true; }
    if (hits.length > 1) { fail(`FIND text appears ${hits.length > 8 ? "many" : hits.length} times; include more surrounding lines so it is unique`); continue; }
    if (hits.length === 1) {
      let out = rep;
      if (loose) {
        // The model dropped (or added) indentation consistently: shift the replacement to the block it replaces.
        const shift = indentOf(lines[hits[0]]) - indentOf(find[0]);
        const firstRep = rep.find((l) => l.trim());
        if (shift !== 0 && firstRep !== undefined && indentOf(firstRep) === indentOf(find[0])) {
          out = rep.map((l) => (shift > 0 ? (l.length ? " ".repeat(shift) + l : l) : l.startsWith(" ".repeat(-shift)) ? l.slice(-shift) : l));
        }
      }
      lines.splice(hits[0], find.length, ...out);
      applied++;
      continue;
    }
    // A single-line FIND that is one unique piece of a line (bounded by non-identifier characters).
    if (find.length === 1 && rep.length <= 1) {
      const needle = find[0].trim();
      const isWord = (ch) => ch !== undefined && /[\w.]/.test(ch);
      let at = -1, col = -1, n = 0;
      for (let i = 0; i < lines.length && n < 2; i++) {
        for (let c = lines[i].indexOf(needle); c >= 0 && n < 2; c = lines[i].indexOf(needle, c + needle.length)) {
          if (isWord(lines[i][c - 1]) && /[\w.]/.test(needle[0])) continue;
          if (isWord(lines[i][c + needle.length]) && /\w/.test(needle[needle.length - 1])) continue;
          n++; at = i; col = c;
        }
      }
      if (n === 1) { lines[at] = lines[at].slice(0, col) + (rep[0] || "").trim() + lines[at].slice(col + needle.length); applied++; continue; }
      if (n > 1) { fail("FIND text appears several times; copy the whole line and its neighbours so it is unique"); continue; }
    }
    fail("FIND text not found in the script (copy the lines exactly as they are)");
  }
  return { code: lines.join("\n"), applied, failed };
}

// True when the change a failed edit asked for is visible in `codeLines` (a Set of trimmed lines).
function editIsPresent(edit, codeLines) {
  if (edit.synthetic) return false;
  const rep = String(edit.replace || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (rep.length) return rep.every((l) => codeLines.has(l));
  const first = String(edit.find || "").split("\n").map((l) => l.trim()).find(Boolean);
  return first ? !codeLines.has(first) : true; // a deletion: its first line is gone
}

// ---------- prompts ----------

const clip = (s, n) => (s.length > n ? s.slice(0, n) + "\n[... truncated ...]" : s);

function historyToMessages(history) {
  const msgs = [];
  for (const m of (history || []).slice(-24)) {
    const role = m.role === "assistant" ? "assistant" : "user";
    let text = "";
    if (typeof m.content === "string") text = m.content;
    else if (Array.isArray(m.content)) text = m.content.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
    text = clip(String(text || "").trim(), 3000);
    if (!text) continue;
    // Same-role turns are merged (the API needs alternating roles); the merged turn stays bounded.
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content = clip(msgs[msgs.length - 1].content + "\n\n" + text, 6000);
    else msgs.push({ role, content: text });
  }
  // The API needs the conversation to start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.slice(-8);
}

function scriptBlock(code) {
  return "CURRENT SCRIPT:\n```pine\n" + code.trimEnd() + "\n```";
}

// Attachments are rebuilt from validated fields: only inline base64 images and PDFs of a bounded size reach the
// model API (no URLs, no extra options).
const IMAGE_TYPES = /^image\/(?:jpeg|png|webp|gif)$/;
const MAX_IMAGE_B64 = 2_000_000; // ~1.5 MB
const MAX_PDF_B64 = 1_500_000; // ~1.1 MB
export function safeAttachment(b) {
  const s = b && b.source;
  if (!s || s.type !== "base64" || typeof s.data !== "string" || typeof s.media_type !== "string") return null;
  if (b.type === "image" && IMAGE_TYPES.test(s.media_type) && s.data.length <= MAX_IMAGE_B64) return { type: "image", source: { type: "base64", media_type: s.media_type, data: s.data } };
  if (b.type === "document" && s.media_type === "application/pdf" && s.data.length <= MAX_PDF_B64) return { type: "document", source: { type: "base64", media_type: "application/pdf", data: s.data } };
  return null;
}

// Builds the message list for a first-pass request.
export function buildMessages({ mode, lang, history, userContent, currentCode, tvError, check }) {
  const prior = historyToMessages(history);
  while (prior.length && prior[0].role !== "user") prior.shift();
  if (prior.length && prior[prior.length - 1].role === "user") prior.pop(); // never two user turns in a row
  const blocks = [];
  let text = "";
  let pdfs = 0;
  if (Array.isArray(userContent)) {
    for (const b of userContent) {
      if (!b) continue;
      if (b.type === "text") text += (text ? "\n" : "") + String(b.text || "");
      else if (blocks.length < 3) {
        const a = safeAttachment(b);
        if (a && (a.type !== "document" || ++pdfs <= 1)) blocks.push(a);
      }
    }
  } else text = String(userContent || "");
  const parts = [modeInstructions(mode, lang)];
  if (currentCode) parts.push(scriptBlock(currentCode));
  if (mode === "fix" && tvError) parts.push("TRADINGVIEW REPORTED (copied by the user from the Pine Editor):\n" + clip(String(tvError).trim(), 2500));
  // Findings on the current script are useful in every mode: an edit request should not leave them behind.
  if (currentCode && check && (check.errors.length || check.mustFix.length || (mode === "fix" && check.shouldFix.length))) parts.push("AUTOMATIC CHECKER FINDINGS for the current script (fix these too):\n" + describeDiagnostics(check));
  parts.push("USER REQUEST:\n" + (clip(text.trim(), 12000) || (mode === "fix" ? "Fix the script." : "Design an indicator from the attachment.")));
  blocks.push({ type: "text", text: parts.join("\n\n") });
  return prior.concat([{ role: "user", content: blocks }]);
}

function repairMessages({ lang, request, code, check, pending }) {
  const parts = [modeInstructions("repair", lang)];
  parts.push("WHAT THE USER ASKED FOR (context only):\n" + clip(request || "(no text)", 1500));
  parts.push(scriptBlock(code));
  const real = pending.filter((f) => !f.synthetic);
  if (real.length) {
    parts.push("YOUR PREVIOUS EDITS THAT COULD NOT BE APPLIED (redo them against the CURRENT SCRIPT above):\n" + real.slice(0, 6).map((f) => `- ${f.reason}:\n${clip(f.find, 400)}${f.replace ? "\n  wanted instead:\n" + clip(f.replace, 400) : "\n  (the lines were to be deleted)"}`).join("\n"));
  }
  if (pending.some((f) => f.synthetic)) parts.push("YOUR PREVIOUS REPLY WAS CUT OFF before all edits were written. Compare the CURRENT SCRIPT with what the user asked for and send the edits that are still missing.");
  if (check.errors.length || check.mustFix.length || check.shouldFix.length) parts.push("CHECKER FINDINGS:\n" + describeDiagnostics(check));
  return [{ role: "user", content: [{ type: "text", text: parts.join("\n\n") }] }];
}

// ---------- pipeline ----------

// Lower is better. Should-fix findings only break ties, so a round that clears them can be adopted.
function scoreOf(check, pending) { return check.errors.length * 100 + pending.length * 10 + check.mustFix.length + check.shouldFix.length * 0.01; }

function fileNameFor(parsed, fallback) {
  let f = parsed.file || fallback || "nexus_indicator.pine";
  if (!/\.pine$/i.test(f)) f += ".pine";
  return f;
}

function abortError() { const e = new Error("The request was cancelled."); e.name = "AbortError"; return e; }

/**
 * Runs one request.
 * opts: { mode: "build"|"fix", lang, history, userContent, currentCode, currentFile, tvError, callModel, emit, deadline, maxRounds, signal }
 * callModel({ messages, effort, maxTokens, onText, onThinking }) -> { text, stopReason, usage, model }
 * emit(event) receives stage / code / explain events for the UI.
 */
export async function runPipeline(opts) {
  const emit = opts.emit || (() => {});
  const maxRounds = opts.maxRounds ?? MAX_REPAIR_ROUNDS;
  const timeLeft = () => (opts.deadline ? opts.deadline - Date.now() : Infinity);
  const checkAbort = () => { if (opts.signal && opts.signal.aborted) throw abortError(); };
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
  const addUsage = (u) => { if (!u) return; usage.calls++; usage.input += u.input || 0; usage.output += u.output || 0; usage.cacheRead += u.cacheRead || 0; usage.cacheWrite += u.cacheWrite || 0; };

  const current = opts.currentCode ? sanitizeCode(opts.currentCode) : "";
  const currentCheck = current ? checkPine(current) : null;
  let requestText = "";
  if (Array.isArray(opts.userContent)) requestText = opts.userContent.filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
  else requestText = String(opts.userContent || "");

  // ---- pass 1: the model's answer ----
  checkAbort();
  emit({ t: "stage", id: "write" });
  const streamer = makeStreamer(emit);
  let thinkingAnnounced = false;
  const first = await opts.callModel({
    messages: buildMessages({ mode: opts.mode, lang: opts.lang, history: opts.history, userContent: opts.userContent, currentCode: current, tvError: opts.tvError, check: currentCheck }),
    effort: opts.effort,
    onText: streamer.push,
    onThinking: () => { if (!thinkingAnnounced) { thinkingAnnounced = true; emit({ t: "stage", id: "think" }); } },
  });
  addUsage(first.usage);
  let parsed = parseReply(first.text);
  const modelUsed = first.model;

  if (first.stopReason === "refusal") {
    return { kind: "text", explain: opts.lang === "en" ? "I can't help with that request. Describe the TradingView indicator you want and I'll build it." : "ما بقدر ساعد بهالطلب. وصّفلي مؤشر TradingView اللي بدك ياه وببنيه.", usage, model: modelUsed };
  }
  if (!String(first.text || "").trim()) { const e = new Error("empty reply"); e.kind = "empty"; throw e; }

  // Truncated NEW script: ask once for the remainder, from the last complete line.
  let codeTruncated = false;
  if (parsed.base === "NEW" && parsed.code !== null && !parsed.codeClosed && first.stopReason === "max_tokens") {
    codeTruncated = true;
    if (timeLeft() > 40000) {
      checkAbort();
      emit({ t: "stage", id: "continue" });
      const cut = parsed.code.lastIndexOf("\n");
      const head = cut >= 0 ? parsed.code.slice(0, cut + 1) : "";
      const cont = await opts.callModel({
        messages: [{ role: "user", content: [{ type: "text", text: "Your previous reply was cut off by the length limit. Below is the script up to its last complete line. Continue it: output ONLY the lines that come next, starting with a whole new line (do not repeat anything already written), then close with </code>, an <explain> block in the user's language, and </nexus>.\n\n<code>\n" + head }] }],
        effort: "low",
        maxTokens: 16000,
        onText: () => {},
      });
      addUsage(cont.usage);
      const rest = cont.text.replace(/\r\n?/g, "\n").replace(/^[\s\S]*?<code>\n?/i, "").replace(/^\n+/, "");
      const merged = "<nexus><base>NEW</base><title>" + parsed.title + "</title><file>" + parsed.file + "</file><code>" + head + rest;
      const p2 = parseReply(merged);
      if (p2.code !== null && p2.codeClosed && cont.stopReason !== "max_tokens") { parsed = { ...p2, title: parsed.title || p2.title, file: parsed.file || p2.file }; codeTruncated = false; }
    }
  }

  const hasCode = parsed.code !== null && parsed.code.trim() !== "";
  const editsCutOff = parsed.editsIncomplete && first.stopReason === "max_tokens";
  const noScript = parsed.base === "NONE"
    || (parsed.base === "NEW" && !hasCode)
    || (parsed.base === "CURRENT" && !hasCode && !parsed.edits.length && !editsCutOff)
    || (parsed.base === "CURRENT" && !current && !hasCode);
  if (noScript) {
    const explain = parsed.explain || first.text.replace(/<[^>]+>/g, "").trim();
    if (!explain) { const e = new Error("empty reply"); e.kind = "empty"; throw e; }
    return { kind: "text", explain, usage, model: modelUsed };
  }

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
  let pending = []; // changes that were asked for but are not in the script yet
  // A full script in <code> wins when there are no edits, whatever <base> says (the model rewrote instead of editing).
  if (hasCode && (parsed.base === "NEW" || !baseCode || !parsed.edits.length)) {
    code = sanitizeCode(parsed.code);
    if (codeTruncated) pending.push({ synthetic: true, reason: "the script was cut off by the length limit" });
  } else {
    const r = applyEdits(baseCode, parsed.edits);
    code = sanitizeCode(r.code);
    pending = r.failed;
    // Edits cut off by the length limit: what was written is applied, the rest is still owed.
    if (editsCutOff) pending.push({ synthetic: true, reason: "the reply was cut off before all edits were written" });
  }
  if (!code.trim()) {
    return { kind: "text", explain: parsed.explain || (opts.lang === "en" ? "I could not produce a script for that. Please describe the indicator again." : "ما قدرت اطلّع سكربت لهالطلب. وصّفلي المؤشر مرة تانية."), usage, model: modelUsed };
  }

  let check = checkPine(code);
  let best = { code: check.code, check, pending };
  emit({ t: "stage", id: "check", errors: check.errors.length, warnings: check.mustFix.length, round: 0 });

  // ---- repair loop ----
  let rounds = 0;
  let fixed = 0; // rounds whose result was adopted
  let shouldFixTried = false;
  let stagnant = 0;
  const history = [{ round: 0, errors: check.errors.length, mustFix: check.mustFix.length, failedEdits: pending.length }];
  while (rounds < maxRounds && timeLeft() > 25000) {
    const fixable = check.errors.length > 0 || check.mustFix.length > 0 || pending.length > 0;
    if (!fixable && (shouldFixTried || !check.shouldFix.length)) break;
    if (!fixable) shouldFixTried = true;
    checkAbort();
    rounds++;
    emit({ t: "stage", id: "fix", round: rounds, errors: check.errors.length, warnings: check.mustFix.length });
    let rep;
    try {
      rep = await opts.callModel({ messages: repairMessages({ lang: opts.lang, request: requestText, code: check.code, check, pending }), effort: "medium", maxTokens: 12000, onText: () => {} });
    } catch (e) {
      if (e && e.name === "AbortError" && opts.signal && opts.signal.aborted) throw e;
      history.push({ round: rounds, error: String((e && e.message) || e).slice(0, 200) });
      break;
    }
    addUsage(rep.usage);
    const rp = parseReply(rep.text);
    const cutOff = rep.stopReason === "max_tokens";
    let next = null;
    let nextFailed = [];
    // A rewritten script is only usable when it arrived whole.
    if (rp.code !== null && rp.code.trim() && (rp.base === "NEW" || !rp.edits.length)) { if (rp.codeClosed && !cutOff) next = sanitizeCode(rp.code); }
    else if (rp.edits.length) { const r = applyEdits(check.code, rp.edits); next = sanitizeCode(r.code); nextFailed = r.failed; }
    if (next === null) { history.push({ round: rounds, note: cutOff ? "reply cut off" : "no usable edits returned" }); stagnant++; if (stagnant >= 2) break; continue; }
    const nextCheck = checkPine(next);
    // Earlier failed edits stay owed until their change shows up in the script.
    const lineSet = new Set(nextCheck.code.split("\n").map((l) => l.trim()));
    const nextPending = pending.filter((e) => (e.synthetic ? cutOff : !editIsPresent(e, lineSet))).concat(nextFailed);
    history.push({ round: rounds, errors: nextCheck.errors.length, mustFix: nextCheck.mustFix.length, failedEdits: nextPending.length });
    emit({ t: "stage", id: "check", errors: nextCheck.errors.length, warnings: nextCheck.mustFix.length, round: rounds });
    if (scoreOf(nextCheck, nextPending) < scoreOf(best.check, best.pending)) {
      best = { code: nextCheck.code, check: nextCheck, pending: nextPending };
      fixed++;
      stagnant = 0;
    } else stagnant++;
    if (stagnant >= 2) break;
    // Always continue from the best version seen so far.
    check = best.check;
    pending = best.pending;
  }

  const final = best;
  const explain = parsed.explain || (template && (!parsed.edits.length) ? template.explain[opts.lang === "en" ? "en" : "ar"] : "");
  return {
    kind: "script",
    code: final.code,
    // An edit keeps the name of the script it edits.
    file: baseKind === "CURRENT" && opts.currentFile ? fileNameFor({ file: "" }, opts.currentFile) : fileNameFor(parsed, template ? template.file : opts.currentFile || ""),
    title: parsed.title || (template ? template.title.en : ""),
    explain,
    base: template && baseKind === "TEMPLATE" ? "template:" + template.id : baseKind === "CURRENT" ? "edit" : "new",
    report: { ...summarizeCheck(final.check), rounds, fixed, history, unappliedEdits: final.pending.length, verified: final.check.clean && final.pending.length === 0 },
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
      if (!c && !x && !announced) {
        // Wait for the closing "<" so a template id is never announced half-written.
        const b = /<base>\s*(TEMPLATE\s*:\s*\w+|CURRENT)\s*</i.exec(buf);
        if (b) { announced = true; emit({ t: "stage", id: /CURRENT/i.test(b[1]) ? "edit" : "template", template: /TEMPLATE/i.test(b[1]) ? b[1].split(":")[1].trim().toLowerCase() : undefined }); }
      }
    },
    text: () => buf,
  };
}
