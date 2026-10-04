// Nexus code checks: the pine-tools parser/type-checker plus a few Nexus-specific rules.
// Pure functions, no I/O - runs in the Edge runtime and in Node tests.
import { lintPine } from "./pine-lint.mjs";

// Warnings that describe real misbehaviour even though the script compiles: the engine repairs these.
const MUST_FIX_RULES = new Set([
  "CONDITIONAL_SERIES", // TV CW10002/3/4: history-dependent call not executed on every bar
  "LOCAL_HISTORY", // TV CW10018
  "LOOKAHEAD_BIAS",
  "ACCUMULATOR_LIFETIME",
  "PLOT_BUDGET",
  "REQUEST_BUDGET",
  "ARGUMENT_OUT_OF_RANGE",
  "ARGUMENT_NA_AT_RUNTIME",
  "SHADOW_BUILTIN",
  "NX_NON_ASCII",
  "NX_SHORTTITLE",
  "NX_UNUSED_INPUT",
]);
// Worth one repair attempt, but never block delivery on them.
const SHOULD_FIX_RULES = new Set(["REPAINTING_SECURITY", "SHADOW_VARIABLE", "ENTRY_WITHOUT_EXIT", "MULTILINE_STRING"]);

const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿­]/g;

// Normalises text that came out of a model or a paste so the checker and TradingView see the same thing.
export function sanitizeCode(input) {
  let code = String(input || "");
  code = code.replace(/\r\n?/g, "\n").replace(INVISIBLE, "");
  code = code.replace(/[   ]/g, " ");
  // Typographic quotes and dashes break the lexer; map them to ASCII.
  code = code.replace(/[“”„«»]/g, '"').replace(/[‘’‚]/g, "'").replace(/[–—−]/g, "-");
  // Strip markdown fences if a whole fenced block was passed in.
  code = code.replace(/^\s*```[a-zA-Z]*[ \t]*\n/, "").replace(/\n```[ \t]*\s*$/, "\n");
  code = code.replace(/^[ \t]*\/\/[ \t]*FILE:.*\n/i, "");
  code = code.split("\n").map((l) => l.replace(/\t/g, "    ").replace(/[ \t]+$/, "")).join("\n");
  return code.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
}

function stripStringsAndComments(line) {
  // Replaces string contents and comments with spaces so regex rules only see code.
  let out = "";
  let i = 0;
  let quote = null;
  while (i < line.length) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") { out += "  "; i += 2; continue; }
      if (ch === quote) { quote = null; out += ch; i++; continue; }
      out += " "; i++; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
    if (ch === "/" && line[i + 1] === "/") break;
    out += ch; i++;
  }
  return out;
}

function nexusRules(code) {
  const diags = [];
  const lines = code.split("\n");
  const push = (line, col, rule, message) => diags.push({ line, col, endLine: line, endCol: col + 1, message, stage: "nexus", rule });

  if (!/^\s*\/\/@version=6\s*$/m.test(code)) push(1, 1, "NX_VERSION", "The script must start with //@version=6.");
  if (/^\s*```/m.test(code)) push(1, 1, "NX_FENCE", "Markdown code fences are not Pine Script. Remove the ``` lines.");

  let declLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const codeOnly = stripStringsAndComments(raw);
    if (!declLine && /^(indicator|strategy|library)\s*\(/.test(codeOnly)) declLine = i + 1;
    // Non-ASCII anywhere on a code line (comments included: they survive copy/paste badly in RTL layouts).
    const m = /[^\x00-\x7F]/.exec(raw);
    if (m) push(i + 1, m.index + 1, "NX_NON_ASCII", `Non-ASCII character "${m[0]}" in the script. Use plain English ASCII in code, strings and comments.`);
  }
  if (!declLine) push(1, 1, "NX_NO_DECLARATION", "The script needs one indicator() or strategy() declaration at the top.");

  const st = /\bshorttitle\s*=\s*"([^"]*)"/.exec(code);
  if (st && st[1].length > 10) {
    const ln = code.slice(0, st.index).split("\n").length;
    push(ln, 1, "NX_SHORTTITLE", `The shorttitle is too long (${st[1].length} characters). It should be 10 characters or less.`);
  }
  return diags;
}

/**
 * Checks a script. Returns:
 *  errors    - compile errors (must be fixed)
 *  mustFix   - compiles, but will misbehave (repaired like errors)
 *  shouldFix - worth one attempt
 *  notes     - informational
 */
export function checkPine(input) {
  const code = sanitizeCode(input);
  const base = lintPine(code);
  const errors = [];
  const mustFix = [];
  const shouldFix = [];
  const notes = [];

  if (base.crashed) notes.push({ line: 1, col: 1, message: "Checker could not analyse the script: " + base.crashed, rule: "NX_CHECKER_CRASH", stage: "internal" });
  for (const e of base.errors || []) errors.push(e);

  const inputNames = new Set();
  for (const m of code.matchAll(/^[ \t]*(?:[A-Za-z_][\w.<>]*[ \t]+)?([A-Za-z_]\w*)[ \t]*=[ \t]*input(?:\.\w+)?\s*\(/gm)) inputNames.add(m[1]);

  for (const w of base.warnings || []) {
    const rule = w.rule || w.code || "";
    if (rule === "UNUSED_VARIABLE") {
      const nm = /'([^']+)'/.exec(w.message);
      if (nm && inputNames.has(nm[1])) {
        mustFix.push({ ...w, rule: "NX_UNUSED_INPUT", message: `Input '${nm[1]}' is declared but never used: the setting does nothing. Use it in the logic or remove it.` });
      } else notes.push(w);
      continue;
    }
    if (MUST_FIX_RULES.has(rule)) mustFix.push(w);
    else if (SHOULD_FIX_RULES.has(rule)) shouldFix.push(w);
    else if (w.stage === "analysis") mustFix.push(w);
    else notes.push(w);
  }

  for (const d of nexusRules(code)) {
    if (d.rule === "NX_VERSION" || d.rule === "NX_FENCE" || d.rule === "NX_NO_DECLARATION") {
      if (!errors.some((e) => e.line === d.line && e.message === d.message)) errors.push(d);
    } else if (MUST_FIX_RULES.has(d.rule)) {
      // Report each rule once per line, at most 5 lines per rule, to keep repair prompts short.
      if (mustFix.filter((x) => x.rule === d.rule).length < 5) mustFix.push(d);
    } else notes.push(d);
  }

  const byPos = (a, b) => a.line - b.line || a.col - b.col;
  errors.sort(byPos); mustFix.sort(byPos); shouldFix.sort(byPos);
  return { code, ok: errors.length === 0, clean: errors.length === 0 && mustFix.length === 0, version: base.version, errors, mustFix, shouldFix, notes, lines: code.split("\n").length - 1 };
}

// Renders diagnostics for a repair prompt: message plus the offending source line.
export function describeDiagnostics(check, maxItems = 14) {
  const lines = check.code.split("\n");
  const fmt = (d, kind) => {
    const src = (lines[d.line - 1] || "").trim();
    return `- [${kind}] line ${d.line}: ${d.message}${src ? `\n    > ${src.slice(0, 220)}` : ""}`;
  };
  const out = [];
  for (const e of check.errors.slice(0, maxItems)) out.push(fmt(e, "ERROR"));
  for (const w of check.mustFix.slice(0, Math.max(0, maxItems - out.length))) out.push(fmt(w, "MUST FIX"));
  for (const w of check.shouldFix.slice(0, Math.max(0, maxItems - out.length))) out.push(fmt(w, "SHOULD FIX"));
  const hidden = check.errors.length + check.mustFix.length + check.shouldFix.length - out.length;
  if (hidden > 0) out.push(`- (${hidden} more findings not shown; they are usually consequences of the ones above)`);
  return out.join("\n");
}

// Compact, user-safe summary for the UI.
export function summarizeCheck(check) {
  const pick = (d) => ({ line: d.line, message: d.message, rule: d.rule || d.code || undefined });
  return { ok: check.ok, clean: check.clean, lines: check.lines, errors: check.errors.slice(0, 8).map(pick), warnings: check.mustFix.concat(check.shouldFix).slice(0, 8).map(pick) };
}
