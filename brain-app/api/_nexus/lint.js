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
  "NX_IMPORT",
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

// ---------- const-string arguments ----------
// TradingView requires a "const string" for titles, plotshape/plotchar text and alertcondition messages. The type
// checker reports the direct cases; this pass adds the ones that go through a variable (for example
// `string txt = up ? "A" : "B"` followed by `plotchar(..., text = txt)`).

const CONST_STRING_PARAMS = {
  indicator: { names: ["title", "shorttitle"], pos: { 0: "title", 1: "shorttitle" } },
  strategy: { names: ["title", "shorttitle"], pos: { 0: "title", 1: "shorttitle" } },
  plot: { names: ["title"], pos: { 1: "title" } },
  plotshape: { names: ["title", "text"], pos: { 1: "title", 6: "text" } },
  plotchar: { names: ["title", "text"], pos: { 1: "title", 6: "text" } },
  plotarrow: { names: ["title"], pos: { 1: "title" } },
  plotcandle: { names: ["title"], pos: { 4: "title" } },
  plotbar: { names: ["title"], pos: { 4: "title" } },
  hline: { names: ["title"], pos: { 1: "title" } },
  fill: { names: ["title"], pos: {} },
  bgcolor: { names: ["title"], pos: { 4: "title" } },
  barcolor: { names: ["title"], pos: { 4: "title" } },
  alertcondition: { names: ["title", "message"], pos: { 1: "title", 2: "message" } },
  input: { names: ["title", "tooltip", "inline", "group"], pos: { 1: "title" } },
};
const RUNTIME_NAMESPACES = new Set(["syminfo", "timeframe", "barstate", "session", "chart", "strategy", "earnings", "dividends", "splits", "ta", "request", "str", "math", "array", "map", "matrix", "input"]);
const RUNTIME_NAMES = new Set(["open", "high", "low", "close", "volume", "time", "hl2", "hlc3", "ohlc4", "hlcc4", "bar_index", "timenow", "last_bar_index", "last_bar_time", "time_close", "time_tradingday", "dayofmonth", "dayofweek", "hour", "minute", "month", "year", "weekofyear", "second", "ask", "bid"]);
const WORD_OPERATORS = new Set(["and", "or", "not", "true", "false", "na"]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Returns the name that makes `expr` (strings already blanked) change at runtime, or "" when it looks constant.
function runtimeCulprit(expr, masked, depth, seen) {
  const src = expr.replace(/"[^"]*"|'[^']*'/g, " ");
  const re = /[A-Za-z_][\w.]*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[0];
    const after = src.slice(m.index + name.length).trimStart();
    const dot = name.indexOf(".");
    if (after.startsWith("(")) {
      // Built-in calls never return a const string. A user function may (its arguments are scanned next).
      if (name === "input" || (dot > 0 && RUNTIME_NAMESPACES.has(name.slice(0, dot)))) return name + "()";
      continue;
    }
    if (WORD_OPERATORS.has(name)) continue;
    if (dot > 0) { if (RUNTIME_NAMESPACES.has(name.slice(0, dot))) return name; continue; } // color.red, shape.* ... are constants
    if (RUNTIME_NAMES.has(name)) return name;
    if (depth >= 4 || seen.has(name)) continue;
    seen.add(name);
    const n = escapeRe(name);
    if (new RegExp("(^|[^\\w.])" + n + "[ \\t]*(?::=|\\+=|-=|\\*=|/=)", "m").test(masked)) return name;
    const decl = new RegExp("^[ \\t]*(?:(?:var|varip)[ \\t]+)?(?:(const|simple|series|input)[ \\t]+)?(?:[A-Za-z_][\\w.<>]*[ \\t]+)?" + n + "[ \\t]*=(?!=)[ \\t]*(.*)$", "gm");
    const found = [];
    let d;
    while ((d = decl.exec(masked)) !== null) found.push(d);
    if (found.length !== 1) continue; // a parameter, a tuple element or several scopes: unknown, stay quiet
    const qualifier = found[0][1];
    const rhs = found[0][2];
    if (qualifier && qualifier !== "const") return name;
    if (/^(?:switch|if|for|while)\b/.test(rhs.trim())) return name;
    if (runtimeCulprit(rhs, masked, depth + 1, seen)) return name;
  }
  return "";
}

function constStringRule(lines, push) {
  const maskedLines = lines.map(stripStringsAndComments);
  const masked = maskedLines.join("\n");
  const callRe = /(^|[^\w.])(plotshape|plotchar|plotarrow|plotcandle|plotbar|plot|hline|fill|bgcolor|barcolor|alertcondition|indicator|strategy|input(?:\.\w+)?)[ \t]*\(/gm;
  let m;
  while ((m = callRe.exec(masked)) !== null) {
    const fn = m[2];
    const spec = CONST_STRING_PARAMS[fn.startsWith("input") ? "input" : fn];
    const open = m.index + m[0].length - 1;
    // Walk to the matching parenthesis, splitting top-level arguments.
    const args = [];
    let depth = 0, start = open + 1, end = -1;
    for (let i = open; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '"' || ch === "'") { const q = masked.indexOf(ch, i + 1); if (q < 0) break; i = q; continue; }
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") { depth--; if (depth === 0) { args.push(masked.slice(start, i)); end = i; break; } }
      else if (ch === "," && depth === 1) { args.push(masked.slice(start, i)); start = i + 1; }
    }
    if (end < 0) continue;
    let positional = true;
    for (let k = 0; k < args.length; k++) {
      const named = /^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(args[k]);
      let param = "", expr = args[k];
      if (named) { positional = false; param = named[1]; expr = named[2]; }
      else if (positional) param = spec.pos[k] || "";
      if (!param || !spec.names.includes(param)) continue;
      const culprit = runtimeCulprit(expr, masked, 0, new Set());
      if (!culprit) continue;
      const line = masked.slice(0, m.index + m[1].length).split("\n").length;
      const hint = param === "message" ? "For a changing message call alert() instead of alertcondition(), or use placeholders such as {{ticker}} and {{close}}."
        : param === "text" ? "Use a literal string here; for text that changes use label.new(), or one " + fn + "() call per fixed text."
        : "Use a literal string.";
      push(line, 1, "NX_CONST_STRING", `Cannot call "${fn}" with argument "${param}": a "const string" is required but the value depends on "${culprit}", which can change at runtime. ${hint}`);
    }
  }
}

function nexusRules(code) {
  const diags = [];
  const lines = code.split("\n");
  const push = (line, col, rule, message) => diags.push({ line, col, endLine: line, endCol: col + 1, message, stage: "nexus", rule });
  try { constStringRule(lines, push); } catch (e) { /* a heuristic must never break the check */ }

  for (let i = 0; i < lines.length; i++) {
    if (/^import[ \t]+[\w-]+\/[\w-]+\/\d+/.test(lines[i])) push(i + 1, 1, "NX_IMPORT", "Imported libraries cannot be verified by the checker. Do not import libraries: write the needed logic directly in the script.");
  }

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
    } else if (d.rule === "NX_CONST_STRING") {
      // The type checker already reports the direct cases; only add what it missed.
      if (!errors.some((e) => e.line === d.line)) errors.push(d);
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
