// Nexus chart preview: runs a Pine Script v6 indicator over real candles and returns what it draws.
//
// Our own interpreter (no third-party runtime): the script is parsed with the Pine parser already bundled in
// pine-lint.mjs, then executed bar by bar with Pine's series semantics (history with [n], var / varip, ta.* state per
// call site, user functions and types, arrays, maps, drawings with their max counts, tables, request.security on
// higher timeframes built from the chart candles, time() sessions in IANA time zones, a small strategy simulator).
// The result is an approximation of TradingView: anything the runner does not support is listed in `unsupported`,
// and the page says so. TradingView stays the final check.

import { PineParser } from "./pine-lint.mjs";

const NA = NaN;
const isNa = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
const MAX_MS = 2500;
const MAX_STEPS = 4e6;

class PineError extends Error { constructor(msg, line) { super(msg); this.pineLine = line || 0; } }
class Break { } class Continue { }
const BREAK = new Break(), CONTINUE = new Continue();

// ---------- values ----------
class Slot { constructor(v) { this.v = v; this.h = []; } }
class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
  lookup(n) { for (let e = this; e; e = e.parent) { const s = e.vars.get(n); if (s) return s; } return null; }
}
class PArr { constructor(a) { this.a = a || []; } }
class PMap { constructor() { this.m = new Map(); } }
class Obj { constructor(type, f) { this.__t = type; this.f = f; } }
class Drawing { constructor(kind, id, props) { this.kind = kind; this.id = id; this.p = props; this.deleted = false; } }
class PTable { constructor(id, p) { this.kind = "table"; this.id = id; this.p = p; this.cells = {}; this.deleted = false; this.merges = []; } }
class PlotRef { constructor(kind, idx) { this.kind = kind; this.idx = idx; } }

// ---------- colors ----------
const C = (hex) => parseHex(hex);
function parseHex(s) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(s || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16), a = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, t: Math.round((1 - a) * 100) };
}
const COLORS = {
  aqua: "#00BCD4", black: "#363A45", blue: "#2962FF", fuchsia: "#E040FB", gray: "#787B86", green: "#4CAF50", lime: "#00E676",
  maroon: "#880E4F", navy: "#311B92", olive: "#808000", orange: "#FF9800", purple: "#9C27B0", red: "#FF5252", silver: "#B2B5BE",
  teal: "#00897B", white: "#FFFFFF", yellow: "#FFEB3B",
};
const isColor = (v) => v && typeof v === "object" && "r" in v && "t" in v && !(v instanceof Obj);
function cssColor(c) {
  if (!isColor(c)) return null;
  const a = Math.max(0, Math.min(1, 1 - c.t / 100));
  return a >= 0.999 ? `rgb(${c.r},${c.g},${c.b})` : `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`;
}
function toColor(v) { if (isColor(v)) return v; if (typeof v === "string") return parseHex(v); return null; }

// ---------- time ----------
const fmtCache = new Map();
function tzName(tz) {
  if (!tz) return "UTC";
  const m = /^(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(tz);
  if (m) { if (m[3] && m[3] !== "00") return "UTC"; const h = +m[2]; return h === 0 ? "UTC" : "Etc/GMT" + (m[1] === "+" ? "-" : "+") + h; }
  return tz;
}
function localParts(ms, tz) {
  const name = tzName(tz);
  let f = fmtCache.get(name);
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-US", { timeZone: name, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }); }
    catch (e) { f = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }); }
    fmtCache.set(name, f);
  }
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const wd = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 }[p.weekday] || 1;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, dow: wd };
}
function inSession(ms, sess, tz) {
  const s = String(sess || "").trim();
  if (!s || s === "24x7") return true;
  const [ranges, days] = s.split(":");
  const lp = localParts(ms, tz);
  if (days && !days.includes(String(lp.dow))) {
    // An overnight session that started the day before still counts on that day's list.
  }
  const m = lp.hour * 60 + lp.minute;
  for (const r of ranges.split(",")) {
    const mm = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(r.trim());
    if (!mm) continue;
    const a = +mm[1] * 60 + +mm[2], b = +mm[3] * 60 + +mm[4];
    const hit = a < b ? m >= a && m < b : a === b ? true : m >= a || m < b;
    if (!hit) continue;
    if (days) { const d = a < b || m >= a ? lp.dow : ((lp.dow + 5) % 7) + 1; if (!days.includes(String(d))) continue; }
    return true;
  }
  return false;
}
// "5" -> 300, "60" -> 3600, "1D"/"D" -> 86400, "1W" -> 604800, "1M" -> 2592000, "30S" -> 30
function tfSeconds(tf) {
  const m = /^(\d*)([SDWM]?)$/i.exec(String(tf || "").trim());
  if (!m) return 0;
  const n = m[1] ? +m[1] : 1, u = m[2].toUpperCase();
  return u === "S" ? n : u === "D" ? n * 86400 : u === "W" ? n * 604800 : u === "M" ? n * 2592000 : n * 60;
}
function tfString(sec) { if (sec % 2592000 === 0 && sec >= 2592000) return sec / 2592000 + "M"; if (sec % 604800 === 0) return sec / 604800 + "W"; if (sec % 86400 === 0) return sec / 86400 + "D"; if (sec < 60) return sec + "S"; return String(sec / 60); }
function bucketOf(ms, sec, tz) {
  if (sec >= 2592000) { const p = localParts(ms, tz); return p.year * 12 + p.month - 1; }
  if (sec >= 86400) {
    const p = localParts(ms, tz); const day = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
    if (sec % 604800 === 0) return Math.floor((day + 3) / (7 * (sec / 604800))); // weeks start on Monday
    return Math.floor(day / (sec / 86400));
  }
  return Math.floor(ms / 1000 / sec);
}

// ---------- string helpers ----------
function unquote(raw) {
  const q = raw[0];
  let s = raw.slice(1, -1);
  return s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c)).replace(q === '"' ? /\\"/g : /\\'/g, q);
}
function decimalsOf(mintick) { const s = String(mintick); return s.includes("e-") ? +s.split("e-")[1] : (s.split(".")[1] || "").length; }
function fmtNum(v, fmt, mintick) {
  if (isNa(v)) return "NaN";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v !== "number") return String(v);
  if (fmt === "format.mintick") return v.toFixed(decimalsOf(mintick));
  if (fmt === "format.percent") return (v).toFixed(2) + "%";
  if (fmt === "format.volume") { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : a >= 1e3 ? (v / 1e3).toFixed(2) + "K" : v.toFixed(2); }
  if (fmt === "format.price" || fmt === "format.inherit") return v.toFixed(decimalsOf(mintick));
  if (typeof fmt === "string" && /[#0]/.test(fmt)) {
    const pct = fmt.endsWith("%"); const f = fmt.replace(/[^#0.]/g, ""); const dec = (f.split(".")[1] || ""); const req = (dec.match(/0/g) || []).length; const max = dec.length;
    let s = (pct ? v * 100 : v).toFixed(max);
    if (max > req) s = s.replace(new RegExp("0{1," + (max - req) + "}$"), "").replace(/\.$/, "");
    return s + (pct ? "%" : "");
  }
  if (Number.isInteger(v)) return String(v);
  return String(+v.toFixed(8));
}

// ---------- the runner ----------
export class PreviewRunner {
  constructor(code, candles, opts = {}) {
    this.code = String(code || "");
    this.opts = opts;
    this.sym = opts.symbol || { tickerid: "BINANCE:BTCUSDT", ticker: "BTCUSDT", mintick: 0.01, type: "crypto", timezone: "Etc/UTC", currency: "USD" };
    this.tfSec = opts.tfSec || 300;
    const c = candles;
    this.main = { o: c.map((x) => x.o), h: c.map((x) => x.h), l: c.map((x) => x.l), c: c.map((x) => x.c), v: c.map((x) => x.v || 0), t: c.map((x) => x.t), n: c.length, tfSec: this.tfSec };
    this.D = this.main;
    this.i = 0;
    this.ctx = "";
    this.inSec = false;
    this.ids = new WeakMap(); this.nextId = 1;
    this.state = new Map();
    this.fnEnvs = new Map();
    this.secCache = new Map();
    this.funcs = new Map();
    this.types = new Map();
    this.unsupported = new Set();
    this.steps = 0;
    this.t0 = 0;
    // Time / work budget: callers can give big scripts more room (the preview endpoint) or less (the design review).
    this.maxMs = (opts && opts.maxMs) || MAX_MS;
    this.maxSteps = (opts && opts.maxSteps) || MAX_STEPS;
    this.decl = { kind: "indicator", title: "", overlay: false, maxLabels: 50, maxLines: 50, maxBoxes: 50 };
    this.out = { plots: [], hlines: [], fills: [], shapes: [], bg: [], barcolor: [], labels: [], lines: [], boxes: [], tables: [], trades: [] };
    this.drawSeq = 1;
    this.live = { label: [], line: [], box: [] };
    this.plotSites = new Map(); // call node -> plot index
    this.strat = { pos: 0, avg: NA, entries: [], closed: 0, wins: 0, net: 0, pendingExits: new Map(), lastId: "" };
  }

  id(node) { let v = this.ids.get(node); if (!v) { v = this.nextId++; this.ids.set(node, v); } return v; }
  key(node) { return this.ctx + "|" + this.id(node); }
  st(node, init) { const k = this.key(node); let s = this.state.get(k); if (!s) { s = init(); this.state.set(k, s); } return s; }
  tick() { if (++this.steps > this.maxSteps || (this.steps % 20000 === 0 && Date.now() - this.t0 > this.maxMs)) throw new PineError("the script is too heavy to preview (stopped after " + this.maxMs / 1000 + " s)"); }
  miss(name) { this.unsupported.add(name); return NA; }

  run() {
    this.t0 = Date.now();
    let ast;
    const errs = [];
    try { const p = new PineParser(this.code, () => {}); ast = p.parse(); for (const e of [...(p.getLexerErrors() || []), ...(p.getParserErrors() || [])]) errs.push(e); }
    catch (e) { return { ok: false, error: "parse: " + (e && e.message || e) }; }
    if (errs.length) return { ok: false, error: "syntax error on line " + (errs[0].line || "?") + ": " + String(errs[0].message || "").slice(0, 160) };
    this.global = new Env(null);
    for (const st of ast.body) {
      if (st.type === "FunctionDeclaration") this.funcs.set(st.name, st);
      else if (st.type === "TypeDeclaration") this.types.set(st.name, st);
      else if (st.type === "ExpressionStatement" && st.expression.type === "CallExpression" && st.expression.callee.type === "Identifier" && /^(indicator|strategy|library)$/.test(st.expression.callee.name)) this.readDecl(st.expression);
    }
    const body = ast.body.filter((s) => s.type !== "FunctionDeclaration" && s.type !== "TypeDeclaration");
    let error = null, errorLine = 0;
    const n = this.main.n;
    for (this.i = 0; this.i < n; this.i++) {
      try { this.stratBar(); this.block(body, this.global); }
      catch (e) {
        if (e === BREAK || e === CONTINUE) continue;
        error = e instanceof PineError ? e.message : "runtime: " + String(e && e.message || e);
        errorLine = e && e.pineLine || 0;
        break;
      }
      for (const s of this.global.vars.values()) s.h[this.i] = s.v;
    }
    return this.result(error, errorLine);
  }

  readDecl(call) {
    const a = this.bind(call.arguments, ["title", "shorttitle", "overlay"], true);
    this.decl.kind = call.callee.name;
    const v = (x, d) => (x && x.type === "Literal" ? (typeof x.value === "string" && /^["']/.test(x.raw) ? unquote(x.raw) : x.value) : d);
    this.decl.title = v(a.title, "") || v(a.shorttitle, "");
    this.decl.overlay = v(a.overlay, call.callee.name === "strategy" ? false : false) === true;
    this.decl.maxLabels = Math.min(500, +v(a.max_labels_count, 50) || 50);
    this.decl.maxLines = Math.min(500, +v(a.max_lines_count, 50) || 50);
    this.decl.maxBoxes = Math.min(500, +v(a.max_boxes_count, 50) || 50);
  }

  // Maps call arguments to parameter names: positional first, then named. With raw = true the nodes are returned.
  bind(args, names, raw) {
    const out = {}; let pos = 0;
    for (const a of args || []) {
      if (a.name) out[a.name] = raw ? a.value : this.ev(a.value, this.curEnv);
      else { const nm = names[pos++] || "_" + pos; out[nm] = raw ? a.value : this.ev(a.value, this.curEnv); }
    }
    return out;
  }

  // ---------- statements ----------
  block(stmts, env) {
    let last = NA;
    for (const s of stmts || []) { this.tick(); last = this.stmt(s, env); }
    return last;
  }
  stmt(s, env) {
    switch (s.type) {
      case "ExpressionStatement": return this.ev(s.expression, env);
      case "VariableDeclaration": {
        const persistent = s.varType === "var" || s.varType === "varip";
        let slot = env.vars.get(s.name);
        if (persistent && slot && slot.inited) return slot.v;
        const v = s.init ? this.ev(s.init, env) : NA;
        if (!slot) { slot = new Slot(v); env.vars.set(s.name, slot); } else slot.v = v;
        slot.inited = true;
        return v;
      }
      case "TupleDeclaration": {
        const v = this.ev(s.init, env);
        const arr = Array.isArray(v) ? v : [v];
        s.names.forEach((nm, k) => {
          if (nm === "_") return;
          const val = arr[k] === undefined ? NA : arr[k];
          let slot = s.isReassignment ? env.lookup(nm) : env.vars.get(nm);
          if (!slot) { slot = new Slot(val); env.vars.set(nm, slot); } else slot.v = val;
          slot.inited = true;
        });
        return NA;
      }
      case "AssignmentStatement": return this.assign(s, env);
      case "IfStatement": return this.ifStmt(s, env);
      case "ForStatement": return this.forStmt(s, env);
      case "ForInStatement": return this.forIn(s, env);
      case "WhileStatement": { let last = NA, guard = 0; while (this.truthy(this.ev(s.condition, env))) { this.tick(); if (++guard > 100000) throw new PineError("loop too long", s.line); try { last = this.block(s.body, env); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; } } return last; }
      case "BreakStatement": throw BREAK;
      case "ContinueStatement": throw CONTINUE;
      case "FunctionDeclaration": this.funcs.set(s.name, s); return NA;
      case "TypeDeclaration": this.types.set(s.name, s); return NA;
      default:
        if (s.expression) return this.ev(s.expression, env);
        this.unsupported.add(s.type);
        return NA;
    }
  }
  assign(s, env) {
    const val = this.ev(s.value, env);
    const op = s.operator;
    const apply = (old) => op === ":=" || op === "=" ? val : op === "+=" ? this.bin("+", old, val) : op === "-=" ? old - val : op === "*=" ? old * val : op === "/=" ? old / val : op === "%=" ? old % val : val;
    if (s.target.type === "Identifier") {
      let slot = env.lookup(s.target.name);
      if (!slot) { slot = new Slot(NA); env.vars.set(s.target.name, slot); }
      slot.v = apply(slot.v); slot.inited = true; return slot.v;
    }
    if (s.target.type === "MemberExpression") {
      const obj = this.ev(s.target.object, env);
      if (obj instanceof Obj) { const k = s.target.property.name; obj.f[k] = apply(obj.f[k]); return obj.f[k]; }
      return NA;
    }
    return NA;
  }
  ifStmt(s, env) {
    if (this.truthy(this.ev(s.condition, env))) return this.block(s.consequent, env);
    const alt = s.alternate;
    if (!alt) return NA;
    if (Array.isArray(alt)) return this.block(alt, env);
    if (alt.type === "IfStatement" || alt.type === "IfExpression") return this.ifStmt(alt, env);
    return this.block([alt], env);
  }
  forStmt(s, env) {
    const from = this.ev(s.from, env), to = this.ev(s.to, env);
    if (isNa(from) || isNa(to)) return NA;
    let step = s.step ? Math.abs(this.ev(s.step, env)) : 1;
    if (!step || isNa(step)) step = 1;
    const dir = to >= from ? 1 : -1;
    let slot = env.vars.get(s.iterator); if (!slot) { slot = new Slot(from); env.vars.set(s.iterator, slot); }
    let last = NA, guard = 0;
    for (let k = from; dir > 0 ? k <= to : k >= to; k += dir * step) {
      if (++guard > 100000) throw new PineError("loop too long", s.line);
      this.tick(); slot.v = k;
      try { last = this.block(s.body, env); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
    }
    return last;
  }
  forIn(s, env) {
    const coll = this.ev(s.collection, env);
    const list = coll instanceof PArr ? coll.a.slice() : coll instanceof PMap ? [...coll.m.keys()] : [];
    const names = Array.isArray(s.iterator) ? s.iterator : s.iterators || (typeof s.iterator === "string" ? [s.iterator] : [s.iterator && s.iterator.name]);
    const slots = names.map((nm) => { let sl = env.vars.get(nm); if (!sl) { sl = new Slot(NA); env.vars.set(nm, sl); } return sl; });
    let last = NA;
    for (let k = 0; k < list.length; k++) {
      this.tick();
      if (slots.length === 2) { slots[0].v = k; slots[1].v = list[k]; } else slots[0].v = list[k];
      try { last = this.block(s.body, env); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
    }
    return last;
  }

  truthy(v) { if (typeof v === "boolean") return v; if (isNa(v)) return false; if (typeof v === "number") return v !== 0; return !!v; }

  // ---------- expressions ----------
  ev(n, env) {
    env = env || this.global;
    switch (n.type) {
      case "Literal": {
        if (typeof n.value === "string") { const r = n.raw || n.value; if (r[0] === "#") return parseHex(r) || NA; if (r[0] === '"' || r[0] === "'") return unquote(r); return n.value; }
        return n.value;
      }
      case "Identifier": return this.ident(n.name, env, n);
      case "MemberExpression": return this.member(n, env);
      case "IndexExpression": return this.index(n, env);
      case "CallExpression": return this.call(n, env);
      case "BinaryExpression": {
        if (n.operator === "and") { const l = this.ev(n.left, env); return this.truthy(l) ? this.truthy(this.ev(n.right, env)) : false; }
        if (n.operator === "or") { const l = this.ev(n.left, env); return this.truthy(l) ? true : this.truthy(this.ev(n.right, env)); }
        return this.bin(n.operator, this.ev(n.left, env), this.ev(n.right, env));
      }
      case "UnaryExpression": { const v = this.ev(n.argument, env); return n.operator === "not" ? !this.truthy(v) : n.operator === "-" ? (isNa(v) ? NA : -v) : v; }
      case "TernaryExpression": return this.truthy(this.ev(n.condition, env)) ? this.ev(n.consequent, env) : this.ev(n.alternate, env);
      case "IfExpression": return this.ifStmt(n, env);
      case "SwitchExpression": return this.sw(n, env);
      case "ArrayExpression": return n.elements.map((e) => this.ev(e, env));
      case "ForStatement": return this.forStmt(n, env);
      case "ForInStatement": return this.forIn(n, env);
      case "WhileStatement": return this.stmt(n, env);
      default: this.unsupported.add(n.type); return NA;
    }
  }
  sw(n, env) {
    const has = !!n.discriminant; const d = has ? this.ev(n.discriminant, env) : null;
    for (const c of n.cases) {
      const hit = !c.condition || (has ? this.bin("==", d, this.ev(c.condition, env)) : this.truthy(this.ev(c.condition, env)));
      if (hit) return Array.isArray(c.result) ? this.block(c.result, env) : c.body ? this.block(c.body, env) : this.ev(c.result, env);
    }
    return NA;
  }
  bin(op, a, b) {
    switch (op) {
      case "+": if (typeof a === "string" || typeof b === "string") return (isNa(a) ? "" : typeof a === "string" ? a : fmtNum(a)) + (isNa(b) ? "" : typeof b === "string" ? b : fmtNum(b)); return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? NA : a / b;
      case "%": return b === 0 ? NA : a % b;
      case "==": if (isColor(a) && isColor(b)) return a.r === b.r && a.g === b.g && a.b === b.b && a.t === b.t; if (isNa(a) || isNa(b)) return false; return a === b;
      case "!=": if (isColor(a) && isColor(b)) return !(a.r === b.r && a.g === b.g && a.b === b.b && a.t === b.t); if (isNa(a) || isNa(b)) return typeof a === "string" || typeof b === "string" ? a !== b : false; return a !== b;
      case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
      default: this.unsupported.add("operator " + op); return NA;
    }
  }

  // Builtin series and constants.
  ident(name, env, node) {
    const slot = env.lookup(name);
    if (slot) return slot.v;
    // The parser reads a bare break / continue inside an if block as an identifier: treat it as the statement.
    if (name === "break") throw BREAK;
    if (name === "continue") throw CONTINUE;
    const D = this.D, i = this.i;
    switch (name) {
      case "open": return D.o[i]; case "high": return D.h[i]; case "low": return D.l[i]; case "close": return D.c[i]; case "volume": return D.v[i];
      case "time": return D.t[i]; case "time_close": return D.t[i] + D.tfSec * 1000; case "timenow": return Date.now();
      case "bar_index": return i; case "last_bar_index": return D.n - 1;
      case "hl2": return (D.h[i] + D.l[i]) / 2; case "hlc3": return (D.h[i] + D.l[i] + D.c[i]) / 3; case "ohlc4": return (D.o[i] + D.h[i] + D.l[i] + D.c[i]) / 4; case "hlcc4": return (D.h[i] + D.l[i] + 2 * D.c[i]) / 4;
      case "na": return NA; case "true": return true; case "false": return false;
      case "year": return localParts(D.t[i], this.sym.timezone).year; case "month": return localParts(D.t[i], this.sym.timezone).month;
      case "dayofmonth": return localParts(D.t[i], this.sym.timezone).day; case "dayofweek": return localParts(D.t[i], this.sym.timezone).dow;
      case "hour": return localParts(D.t[i], this.sym.timezone).hour; case "minute": return localParts(D.t[i], this.sym.timezone).minute;
      case "weekofyear": { const p = localParts(D.t[i], this.sym.timezone); const d0 = Date.UTC(p.year, 0, 1), d = Date.UTC(p.year, p.month - 1, p.day); return Math.ceil(((d - d0) / 86400000 + new Date(d0).getUTCDay() + 1) / 7); }
    }
    if (this.funcs.has(name) || this.types.has(name)) return { __fn: name };
    return this.miss(name);
  }

  member(n, env) {
    const o = n.object, p = n.property.name;
    if (o.type === "Identifier" && !env.lookup(o.name)) {
      const ns = o.name;
      const D = this.D, i = this.i;
      switch (ns) {
        case "color": if (COLORS[p]) return C(COLORS[p]); break;
        case "barstate": {
          const last = i === D.n - 1;
          return { isfirst: i === 0, islast: last, isconfirmed: !last || this.inSec, isrealtime: last && !this.inSec, ishistory: !last, isnew: true, islastconfirmedhistory: i === D.n - 2 }[p] ?? this.miss("barstate." + p);
        }
        case "syminfo": return { tickerid: this.sym.tickerid, ticker: this.sym.ticker, mintick: this.sym.mintick, type: this.sym.type, timezone: this.sym.timezone, currency: this.sym.currency, basecurrency: this.sym.ticker.slice(0, 3), pointvalue: 1, root: this.sym.ticker, description: this.sym.ticker, session: "24x7", prefix: this.sym.tickerid.split(":")[0], volumetype: "base", main_tickerid: this.sym.tickerid }[p] ?? this.miss("syminfo." + p);
        case "timeframe": {
          const s = this.D.tfSec;
          return { period: tfString(s), main_period: tfString(this.main.tfSec), multiplier: s % 86400 === 0 ? s / 86400 : s % 60 === 0 ? s / 60 : s, isintraday: s < 86400, isdaily: s >= 86400 && s < 604800, isweekly: s >= 604800 && s < 2592000, ismonthly: s >= 2592000, isminutes: s < 86400 && s >= 60, isseconds: s < 60, isdwm: s >= 86400, isticks: false }[p] ?? this.miss("timeframe." + p);
        }
        case "math": if (p === "pi") return Math.PI; if (p === "e") return Math.E; if (p === "phi") return 1.618033988749895; if (p === "rphi") return 0.618033988749895; break;
        case "ta": {
          if (p === "tr") return this.trueRange(false);
          if (p === "vwap") return this.vwap(n, D.c[i] !== undefined ? (D.h[i] + D.l[i] + D.c[i]) / 3 : NA);
          if (p === "obv") { const s = this.st(n, () => ({ v: 0, prev: NA })); if (!isNa(s.prev)) s.v += Math.sign(D.c[i] - s.prev) * D.v[i]; s.prev = D.c[i]; return s.v; }
          if (p === "accdist") { const s = this.st(n, () => ({ v: 0 })); const r = D.h[i] - D.l[i]; s.v += r ? ((D.c[i] - D.l[i]) - (D.h[i] - D.c[i])) / r * D.v[i] : 0; return s.v; }
          break;
        }
        case "strategy": {
          const S = this.strat;
          const m = { long: "long", short: "short", position_size: S.pos, position_avg_price: S.avg, closedtrades: S.closed, wintrades: S.wins, losstrades: S.closed - S.wins, netprofit: S.net, equity: 10000 + S.net, initial_capital: 10000, opentrades: S.pos ? 1 : 0, fixed: "fixed", percent_of_equity: "percent_of_equity", cash: "cash" };
          if (p in m) return m[p];
          break;
        }
        case "label": case "line": case "box": case "table":
          if (p === "all") return new PArr(this.live[ns] ? this.live[ns].filter((d) => !d.deleted) : []);
          return ns + "." + p;
        case "chart": if (p === "bg_color") return C("#131722"); if (p === "fg_color") return C("#D1D4DC"); if (p === "is_standard") return true; break;
        case "xloc": case "yloc": case "extend": case "shape": case "location": case "size": case "position": case "plot": case "hline": case "text": case "font": case "format": case "display": case "alert": case "barmerge": case "order": case "currency": case "scale": case "adjustment": case "dayofweek": case "session": case "settlement_as_close": case "backadjustment": case "xloc.bar_index":
          if (ns === "dayofweek") return { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 }[p] ?? ns + "." + p;
          if (ns === "barmerge") return ns + "." + p;
          return ns + "." + p;
      }
      if (this.types.has(ns)) return { __type: ns, member: p };
    }
    const obj = this.ev(o, env);
    if (obj instanceof Obj) return p in obj.f ? obj.f[p] : NA;
    if (isColor(obj)) return { r: obj.r, g: obj.g, b: obj.b, t: obj.t }[p];
    if (isNa(obj)) return NA;
    return this.miss("." + p);
  }

  index(n, env) {
    const off = Math.floor(this.ev(n.index, env));
    if (isNa(off) || off < 0) return NA;
    const D = this.D, i = this.i, j = i - off;
    const o = n.object;
    if (o.type === "Identifier") {
      const slot = env.lookup(o.name);
      if (slot) return off === 0 ? slot.v : j < 0 ? NA : (slot.h[j] === undefined ? NA : slot.h[j]);
      if (j < 0) return NA;
      switch (o.name) {
        case "open": return D.o[j]; case "high": return D.h[j]; case "low": return D.l[j]; case "close": return D.c[j]; case "volume": return D.v[j];
        case "time": return D.t[j]; case "bar_index": return j;
        case "hl2": return (D.h[j] + D.l[j]) / 2; case "hlc3": return (D.h[j] + D.l[j] + D.c[j]) / 3; case "ohlc4": return (D.o[j] + D.h[j] + D.l[j] + D.c[j]) / 4;
      }
    }
    // Any other expression: keep its own history per call site.
    const s = this.st(n, () => ({ h: [] }));
    const v = this.ev(o, env);
    s.h[i] = v;
    if (Array.isArray(v)) return v;
    return j < 0 ? NA : s.h[j] === undefined ? NA : s.h[j];
  }

  // ---------- calls ----------
  call(n, env) {
    this.tick();
    const prev = this.curEnv; this.curEnv = env;
    try { return this.call2(n, env); } finally { this.curEnv = prev; }
  }
  call2(n, env) {
    const cal = n.callee;
    if (cal.type === "Identifier") {
      const name = cal.name;
      const slot = env.lookup(name);
      if (!slot && this.funcs.has(name)) return this.userCall(this.funcs.get(name), n, env, null);
      return this.builtin("", name, n, env);
    }
    if (cal.type === "MemberExpression") {
      const o = cal.object, p = cal.property.name;
      if (o.type === "Identifier" && !env.lookup(o.name)) {
        if (this.types.has(o.name)) return this.typeCall(o.name, p, n, env);
        if (NAMESPACES.has(o.name)) return this.builtin(o.name, p, n, env);
      }
      if (o.type === "MemberExpression" && o.object.type === "Identifier" && o.object.name === "array" && !env.lookup("array")) return this.builtin("array", o.property.name + "." + p, n, env);
      const obj = this.ev(o, env);
      return this.method(obj, p, n, env);
    }
    this.unsupported.add("call"); return NA;
  }
  userCall(fn, n, env, self) {
    const k = this.ctx + "/" + this.id(n);
    let fenv = this.fnEnvs.get(k);
    if (!fenv) { fenv = new Env(this.global); this.fnEnvs.set(k, fenv); }
    const params = fn.params || [];
    const vals = [];
    let pos = 0;
    if (self !== null && self !== undefined) vals[pos++] = self;
    const named = {};
    for (const a of n.arguments || []) { if (a.name) named[a.name] = this.ev(a.value, env); else vals[pos++] = this.ev(a.value, env); }
    params.forEach((p, idx) => {
      let v = idx < vals.length ? vals[idx] : p.name in named ? named[p.name] : p.defaultValue ? this.ev(p.defaultValue, env) : NA;
      let sl = fenv.vars.get(p.name); if (!sl) { sl = new Slot(v); fenv.vars.set(p.name, sl); } else sl.v = v; sl.inited = true;
    });
    const saved = this.ctx; this.ctx = k;
    let r;
    try { r = this.block(fn.body, fenv); } finally { this.ctx = saved; }
    for (const s of fenv.vars.values()) s.h[this.i] = s.v;
    return r;
  }
  typeCall(tname, p, n, env) {
    const td = this.types.get(tname);
    if (p === "new") {
      const f = {}; const fields = td.fields || [];
      const vals = []; const named = {};
      for (const a of n.arguments || []) { if (a.name) named[a.name] = this.ev(a.value, env); else vals.push(this.ev(a.value, env)); }
      fields.forEach((fd, k) => { f[fd.name] = k < vals.length ? vals[k] : fd.name in named ? named[fd.name] : fd.defaultValue ? this.ev(fd.defaultValue, env) : NA; });
      return new Obj(tname, f);
    }
    if (p === "copy") { const o = this.ev(n.arguments[0].value, env); return o instanceof Obj ? new Obj(o.__t, { ...o.f }) : NA; }
    return this.miss(tname + "." + p);
  }
  method(obj, p, n, env) {
    if (obj instanceof PArr) return this.arrayFn(p, [obj, ...this.posArgs(n, env)], n);
    if (obj instanceof PMap) return this.mapFn(p, [obj, ...this.posArgs(n, env)]);
    if (obj instanceof Drawing) return this.drawFn(obj.kind, p, [obj, ...this.posArgs(n, env)], n, env, true);
    if (obj instanceof PTable) return this.tableFn(p, n, env, obj);
    if (obj instanceof Obj && p === "copy") return new Obj(obj.__t, { ...obj.f });
    if (this.funcs.has(p)) return this.userCall(this.funcs.get(p), n, env, obj);
    if (isNa(obj)) return NA; // method on na (deleted drawing etc.)
    if (typeof obj === "string" && this.builtinsStr.has(p)) return this.strFn(p, [obj, ...this.posArgs(n, env)]);
    return this.miss("method ." + p);
  }
  posArgs(n, env) { return (n.arguments || []).map((a) => this.ev(a.value, env)); }

  builtin(ns, name, n, env) {
    const A = (names) => this.bind(n.arguments, names);
    const full = ns ? ns + "." + name : name;
    switch (ns) {
      case "": return this.globalFn(name, n, env, A);
      case "ta": return this.taFn(name, n, env);
      case "math": return this.mathFn(name, n, env);
      case "input": { const a = A(["defval", "title"]); return a.defval === undefined ? NA : a.defval; }
      case "request": return this.request(name, n, env);
      case "str": return this.strFn(name, this.posArgs(n, env), n, env);
      case "array": return this.arrayFn(name, this.posArgs(n, env), n);
      case "map": if (name === "new") return new PMap(); return this.mapFn(name, this.posArgs(n, env));
      case "color": return this.colorFn(name, A);
      case "label": case "line": case "box": return this.drawFn(ns, name, null, n, env, false);
      case "table": return this.tableFn(name, n, env, null);
      case "timeframe": return this.tfFn(name, A);
      case "strategy": return this.strategyFn(name, n, env, A);
      case "runtime": if (name === "error") { const a = A(["message"]); throw new PineError(String(a.message)); } break;
      case "log": return NA;
      case "ticker": if (name === "new" || name === "modify" || name === "standard" || name === "heikinashi") return this.sym.tickerid; break;
      case "chart": if (name === "point") return NA; break;
      case "matrix": break;
    }
    return this.miss(full);
  }

  globalFn(name, n, env, A) {
    const D = this.D, i = this.i;
    switch (name) {
      case "indicator": case "strategy": case "library": case "alertcondition": case "alert": case "max_bars_back": return NA;
      case "na": { const a = this.posArgs(n, env); return isNa(a[0]); }
      case "nz": { const a = this.posArgs(n, env); return isNa(a[0]) ? (a.length > 1 ? a[1] : 0) : a[0]; }
      case "fixnan": { const v = this.posArgs(n, env)[0]; const s = this.st(n, () => ({ last: NA })); if (!isNa(v)) s.last = v; return s.last; }
      case "int": { const v = this.posArgs(n, env)[0]; return isNa(v) ? NA : Math.trunc(v); }
      case "float": return this.posArgs(n, env)[0];
      case "bool": return this.truthy(this.posArgs(n, env)[0]);
      case "string": return String(this.posArgs(n, env)[0]);
      case "input": { const a = A(["defval", "title"]); return a.defval === undefined ? NA : a.defval; }
      case "time": case "time_close": {
        const a = A(["timeframe", "session", "timezone", "bars_back"]);
        const tfS = a.timeframe ? tfSeconds(a.timeframe) || D.tfSec : D.tfSec;
        const t = D.t[i];
        if (a.session && !inSession(t, a.session, a.timezone || this.sym.timezone)) return NA;
        if (tfS > D.tfSec) {
          const s = this.st(n, () => ({ b: null, start: NA }));
          const b = bucketOf(t, tfS, a.timezone || this.sym.timezone);
          if (b !== s.b) { s.b = b; s.start = t; }
          return name === "time" ? s.start : s.start + tfS * 1000;
        }
        return name === "time" ? t : t + D.tfSec * 1000;
      }
      case "timestamp": {
        const a = this.posArgs(n, env);
        let tz = "UTC"; if (typeof a[0] === "string" && a.length >= 6) tz = a.shift();
        if (typeof a[0] === "string") { const d = Date.parse(a[0]); return isNaN(d) ? NA : d; }
        const [y, mo, d, h = 0, mi = 0, s = 0] = a;
        const utc = Date.UTC(y, mo - 1, d, h, mi, s);
        const lp = localParts(utc, tz); const back = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
        return utc - (back - utc);
      }
      case "year": case "month": case "dayofmonth": case "dayofweek": case "hour": case "minute": case "second": case "weekofyear": {
        const a = A(["time", "timezone"]); const p = localParts(isNa(a.time) || a.time === undefined ? D.t[i] : a.time, a.timezone || this.sym.timezone);
        return { year: p.year, month: p.month, dayofmonth: p.day, dayofweek: p.dow, hour: p.hour, minute: p.minute, second: 0, weekofyear: NA }[name];
      }
      case "plot": return this.plot(n, env);
      case "plotshape": case "plotchar": case "plotarrow": return this.shape(name, n, env);
      case "hline": {
        const a = this.bind(n.arguments, ["price", "title", "color", "linestyle", "linewidth", "editable", "display"]);
        if (this.inSec) return NA;
        let idx = this.plotSites.get(n);
        if (idx === undefined) { idx = this.out.hlines.length; this.plotSites.set(n, idx); this.out.hlines.push({ price: a.price, title: a.title || "", color: cssColor(toColor(a.color)) || "rgba(120,123,134,.8)", style: a.linestyle || "hline.style_dashed", width: a.linewidth || 1, hidden: a.display === "display.none" }); }
        return new PlotRef("hline", idx);
      }
      case "fill": return this.fill(n, env);
      case "bgcolor": { const a = this.bind(n.arguments, ["color", "offset"]); if (!this.inSec) { const c = cssColor(toColor(a.color)); if (c) this.out.bg[i + (a.offset || 0)] = c; } return NA; }
      case "barcolor": { const a = this.bind(n.arguments, ["color", "offset"]); if (!this.inSec) { const c = cssColor(toColor(a.color)); if (c) this.out.barcolor[i + (a.offset || 0)] = c; } return NA; }
      case "plotcandle": case "plotbar": return this.miss(name);
    }
    return this.miss(name);
  }

  plot(n, env) {
    const a = this.bind(n.arguments, ["series", "title", "color", "linewidth", "style", "trackprice", "histbase", "offset", "join", "editable", "show_last", "display", "format", "precision", "force_overlay"]);
    if (this.inSec) return NA;
    let idx = this.plotSites.get(n);
    if (idx === undefined) {
      idx = this.out.plots.length; this.plotSites.set(n, idx);
      this.out.plots.push({ title: typeof a.title === "string" ? a.title : "", style: a.style || "plot.style_line", width: a.linewidth || 1, values: [], colors: [], offset: a.offset || 0, histbase: a.histbase || 0, hidden: a.display === "display.none" || a.display === "display.data_window" || a.display === "display.status_line", forceOverlay: a.force_overlay === true });
    }
    const p = this.out.plots[idx];
    const v = typeof a.series === "boolean" ? (a.series ? 1 : 0) : a.series;
    p.values[this.i] = isNa(v) ? null : +v;
    const c = a.color === undefined ? C("#2962FF") : toColor(a.color);
    p.colors[this.i] = cssColor(c);
    return new PlotRef("plot", idx);
  }
  shape(kind, n, env) {
    const names = kind === "plotchar" ? ["series", "title", "char", "location", "color", "offset", "text", "textcolor", "editable", "size", "show_last", "display", "format", "precision", "force_overlay"]
      : kind === "plotarrow" ? ["series", "title", "colorup", "colordown", "offset", "minheight", "maxheight"]
        : ["series", "title", "style", "location", "color", "offset", "text", "textcolor", "editable", "size", "show_last", "display", "format", "precision", "force_overlay"];
    const a = this.bind(n.arguments, names);
    if (this.inSec) return NA;
    const v = a.series;
    if (isNa(v) || v === false || (kind === "plotarrow" && v === 0)) return NA;
    if (a.display === "display.none") return NA;
    const i = this.i + (a.offset || 0);
    if (kind === "plotarrow") { this.out.shapes.push({ bar: i, style: v > 0 ? "shape.arrowup" : "shape.arrowdown", location: v > 0 ? "location.belowbar" : "location.abovebar", color: cssColor(toColor(v > 0 ? a.colorup : a.colordown)) || (v > 0 ? "#26a69a" : "#ef5350"), size: "size.small" }); return NA; }
    this.out.shapes.push({
      bar: i, style: kind === "plotchar" ? "char" : a.style || "shape.xcross", char: kind === "plotchar" ? (a.char || "★") : undefined,
      location: a.location || (kind === "plotchar" ? "location.abovebar" : "location.abovebar"), price: typeof v === "number" ? v : null,
      color: cssColor(a.color === undefined ? C("#2962FF") : toColor(a.color)), text: typeof a.text === "string" ? a.text : "", textcolor: cssColor(toColor(a.textcolor)) || null, size: a.size || "size.auto",
    });
    if (this.out.shapes.length > 4000) this.out.shapes.shift();
    return NA;
  }
  fill(n, env) {
    const args = n.arguments || [];
    const a1 = this.ev(args[0].value, env), a2 = this.ev(args[1].value, env);
    if (this.inSec || !(a1 instanceof PlotRef) || !(a2 instanceof PlotRef)) return NA;
    const named = {}; const pos = [];
    for (let k = 2; k < args.length; k++) { if (args[k].name) named[args[k].name] = this.ev(args[k].value, env); else pos.push(this.ev(args[k].value, env)); }
    let col;
    if ("top_color" in named || pos.length >= 4) { const tc = named.top_color ?? pos[2]; col = toColor(tc); }
    else col = toColor(named.color ?? pos[0]);
    let idx = this.plotSites.get(n);
    if (idx === undefined) { idx = this.out.fills.length; this.plotSites.set(n, idx); this.out.fills.push({ a: { kind: a1.kind, idx: a1.idx }, b: { kind: a2.kind, idx: a2.idx }, colors: [] }); }
    this.out.fills[idx].colors[this.i] = cssColor(col);
    return NA;
  }

  // ---------- ta ----------
  taFn(name, n, env) {
    const D = this.D, i = this.i;
    const P = (names) => this.bind(n.arguments, names);
    const s = (init) => this.st(n, init);
    const push = (st, v) => { st.v.push(v); if (st.v.length > 5000) st.v.shift(); };
    const last = (st, len) => st.v.slice(Math.max(0, st.v.length - len));
    switch (name) {
      case "sma": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length); if (w.length < a.length || w.some(isNa)) return NA; return w.reduce((x, y) => x + y, 0) / a.length; }
      case "wma": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length); if (w.length < a.length || w.some(isNa)) return NA; let num = 0, den = 0; w.forEach((x, k) => { num += x * (k + 1); den += k + 1; }); return num / den; }
      case "vwma": { const a = P(["source", "length"]); const st = s(() => ({ v: [], w: [] })); push(st, a.source * D.v[i]); st.w.push(D.v[i]); const w = last(st, a.length), vv = st.w.slice(-a.length); const sv = vv.reduce((x, y) => x + y, 0); return w.length < a.length || !sv ? NA : w.reduce((x, y) => x + y, 0) / sv; }
      case "ema": case "rma": { const a = P(["source", "length"]); return this.ma(s(() => ({ v: [], prev: NA })), a.source, a.length, name === "ema" ? 2 / (a.length + 1) : 1 / a.length); }
      case "hma": { const a = P(["source", "length"]); const st = s(() => ({ a: { v: [] }, b: { v: [] }, c: { v: [] } })); const half = Math.floor(a.length / 2), sq = Math.floor(Math.sqrt(a.length)); const w1 = this.wmaState(st.a, a.source, half), w2 = this.wmaState(st.b, a.source, a.length); return this.wmaState(st.c, 2 * w1 - w2, sq); }
      case "rsi": {
        const a = P(["source", "length"]); const st = s(() => ({ prev: NA, up: { v: [], prev: NA }, dn: { v: [], prev: NA } }));
        const ch = isNa(st.prev) ? NA : a.source - st.prev; st.prev = a.source;
        const u = this.ma(st.up, isNa(ch) ? NA : Math.max(ch, 0), a.length, 1 / a.length), d = this.ma(st.dn, isNa(ch) ? NA : Math.max(-ch, 0), a.length, 1 / a.length);
        if (isNa(u) || isNa(d)) return NA; return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d);
      }
      case "tr": { const a = P(["handle_na"]); return this.trueRange(a.handle_na === true); }
      case "atr": { const a = P(["length"]); return this.ma(s(() => ({ v: [], prev: NA })), this.trueRange(true), a.length, 1 / a.length); }
      case "crossover": case "crossunder": case "cross": {
        const a = P(["source1", "source2"]); const st = s(() => ({ a: NA, b: NA }));
        const r = name === "crossover" ? a.source1 > a.source2 && st.a <= st.b : name === "crossunder" ? a.source1 < a.source2 && st.a >= st.b : (a.source1 > a.source2 && st.a <= st.b) || (a.source1 < a.source2 && st.a >= st.b);
        st.a = a.source1; st.b = a.source2; return !!r;
      }
      case "highest": case "lowest": case "highestbars": case "lowestbars": {
        const args = n.arguments || []; let src, len;
        if (args.length === 1 && !args[0].name) { len = this.ev(args[0].value, env); src = name.startsWith("highest") ? D.h[i] : D.l[i]; } else { const a = P(["source", "length"]); src = a.source; len = a.length; }
        const st = s(() => ({ v: [] })); push(st, src); const w = last(st, len); if (w.length < len) return NA;
        let best = w[0], bi = 0; const hi = name.startsWith("highest");
        w.forEach((x, k) => { if (hi ? x >= best : x <= best) { best = x; bi = k; } });
        return name.endsWith("bars") ? -(w.length - 1 - bi) : best;
      }
      case "change": { const a = P(["source", "length"]); const len = a.length === undefined ? 1 : a.length; const st = s(() => ({ v: [] })); push(st, a.source); if (st.v.length <= len) return NA; const old = st.v[st.v.length - 1 - len]; return typeof a.source === "boolean" ? a.source !== old : a.source - old; }
      case "mom": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); return st.v.length <= a.length ? NA : a.source - st.v[st.v.length - 1 - a.length]; }
      case "roc": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); if (st.v.length <= a.length) return NA; const old = st.v[st.v.length - 1 - a.length]; return 100 * (a.source - old) / old; }
      case "stdev": case "variance": case "dev": {
        const a = P(["source", "length", "biased"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length); if (w.length < a.length || w.some(isNa)) return NA;
        const m = w.reduce((x, y) => x + y, 0) / w.length;
        if (name === "dev") return w.reduce((x, y) => x + Math.abs(y - m), 0) / w.length;
        const v = w.reduce((x, y) => x + (y - m) ** 2, 0) / (a.biased === false ? w.length - 1 : w.length);
        return name === "variance" ? v : Math.sqrt(v);
      }
      case "cum": { const a = P(["source"]); const st = s(() => ({ v: 0 })); if (!isNa(a.source)) st.v += a.source; return st.v; }
      case "rising": case "falling": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length + 1); if (w.length <= a.length) return false; for (let k = 1; k < w.length; k++) if (name === "rising" ? !(w[w.length - 1] > w[k - 1]) : !(w[w.length - 1] < w[k - 1])) return false; return true; }
      case "pivothigh": case "pivotlow": {
        const args = n.arguments || []; let src, lb, rb;
        if (args.length === 2) { const a = P(["leftbars", "rightbars"]); lb = a.leftbars; rb = a.rightbars; src = name === "pivothigh" ? D.h[i] : D.l[i]; }
        else { const a = P(["source", "leftbars", "rightbars"]); src = a.source; lb = a.leftbars; rb = a.rightbars; }
        const st = s(() => ({ v: [] })); push(st, src);
        const w = last(st, lb + rb + 1); if (w.length < lb + rb + 1) return NA;
        const c = w[lb]; if (isNa(c)) return NA;
        for (let k = 0; k < w.length; k++) { if (k === lb) continue; if (name === "pivothigh" ? (k < lb ? w[k] >= c : w[k] > c) : (k < lb ? w[k] <= c : w[k] < c)) return NA; }
        return c;
      }
      case "barssince": { const a = P(["condition"]); const st = s(() => ({ last: -1, n: 0 })); st.n++; if (this.truthy(a.condition)) st.last = st.n; return st.last < 0 ? NA : st.n - st.last; }
      case "valuewhen": { const a = P(["condition", "source", "occurrence"]); const st = s(() => ({ v: [] })); if (this.truthy(a.condition)) { st.v.push(a.source); if (st.v.length > 500) st.v.shift(); } const k = st.v.length - 1 - (a.occurrence || 0); return k >= 0 ? st.v[k] : NA; }
      case "macd": {
        const a = P(["source", "fastlen", "slowlen", "siglen"]); const st = s(() => ({ f: { v: [], prev: NA }, sl: { v: [], prev: NA }, sg: { v: [], prev: NA } }));
        const f = this.ma(st.f, a.source, a.fastlen, 2 / (a.fastlen + 1)), sl = this.ma(st.sl, a.source, a.slowlen, 2 / (a.slowlen + 1));
        const m = f - sl; const sg = this.ma(st.sg, m, a.siglen, 2 / (a.siglen + 1)); return [m, sg, m - sg];
      }
      case "bb": { const a = P(["series", "length", "mult"]); const st = s(() => ({ v: [] })); push(st, a.series); const w = last(st, a.length); if (w.length < a.length) return [NA, NA, NA]; const m = w.reduce((x, y) => x + y, 0) / w.length; const sd = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / w.length); return [m, m + a.mult * sd, m - a.mult * sd]; }
      case "bbw": { const a = P(["series", "length", "mult"]); const st = s(() => ({ v: [] })); push(st, a.series); const w = last(st, a.length); if (w.length < a.length) return NA; const m = w.reduce((x, y) => x + y, 0) / w.length; const sd = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / w.length); return (2 * a.mult * sd) / m * 100; }
      case "kc": { const a = P(["series", "length", "mult", "useTrueRange"]); const st = s(() => ({ m: { v: [], prev: NA }, r: { v: [], prev: NA } })); const m = this.ma(st.m, a.series, a.length, 2 / (a.length + 1)); const r = this.ma(st.r, a.useTrueRange === false ? D.h[i] - D.l[i] : this.trueRange(true), a.length, 2 / (a.length + 1)); return [m, m + a.mult * r, m - a.mult * r]; }
      case "stoch": { const a = P(["source", "high", "low", "length"]); const st = s(() => ({ h: [], l: [] })); st.h.push(a.high); st.l.push(a.low); const hh = Math.max(...st.h.slice(-a.length)), ll = Math.min(...st.l.slice(-a.length)); if (st.h.length < a.length) return NA; return hh === ll ? NA : 100 * (a.source - ll) / (hh - ll); }
      case "cci": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length); if (w.length < a.length) return NA; const m = w.reduce((x, y) => x + y, 0) / w.length; const md = w.reduce((x, y) => x + Math.abs(y - m), 0) / w.length; return md ? (a.source - m) / (0.015 * md) : 0; }
      case "mfi": { const a = P(["series", "length"]); const st = s(() => ({ prev: NA, p: [], ng: [] })); const mf = a.series * D.v[i]; st.p.push(!isNa(st.prev) && a.series > st.prev ? mf : 0); st.ng.push(!isNa(st.prev) && a.series < st.prev ? mf : 0); st.prev = a.series; if (st.p.length < a.length + 1) return NA; const up = st.p.slice(-a.length).reduce((x, y) => x + y, 0), dn = st.ng.slice(-a.length).reduce((x, y) => x + y, 0); return dn === 0 ? 100 : 100 - 100 / (1 + up / dn); }
      case "supertrend": {
        const a = P(["factor", "atrPeriod"]); const st = s(() => ({ atr: { v: [], prev: NA }, up: NA, dn: NA, dir: 1, prevST: NA, prevClose: NA }));
        const atr = this.ma(st.atr, this.trueRange(true), a.atrPeriod, 1 / a.atrPeriod);
        const src = (D.h[i] + D.l[i]) / 2; let up = src - a.factor * atr, dn = src + a.factor * atr;
        const pUp = st.up, pDn = st.dn, pc = st.prevClose;
        up = !isNa(pUp) && pc > pUp ? Math.max(up, pUp) : up;
        dn = !isNa(pDn) && pc < pDn ? Math.min(dn, pDn) : dn;
        let dir;
        if (isNa(atr) || isNa(st.prevST)) dir = 1;
        else if (st.prevST === pDn) dir = D.c[i] > dn ? -1 : 1;
        else dir = D.c[i] < up ? 1 : -1;
        const stv = dir === -1 ? up : dn;
        st.up = up; st.dn = dn; st.prevST = isNa(atr) ? NA : stv; st.prevClose = D.c[i];
        return [isNa(atr) ? NA : stv, dir];
      }
      case "dmi": {
        const a = P(["diLength", "adxSmoothing"]); const st = s(() => ({ ph: NA, pl: NA, tr: { v: [], prev: NA }, p: { v: [], prev: NA }, m: { v: [], prev: NA }, adx: { v: [], prev: NA } }));
        const upM = isNa(st.ph) ? NA : D.h[i] - st.ph, dnM = isNa(st.pl) ? NA : st.pl - D.l[i]; st.ph = D.h[i]; st.pl = D.l[i];
        const plusDM = isNa(upM) ? NA : upM > dnM && upM > 0 ? upM : 0, minusDM = isNa(dnM) ? NA : dnM > upM && dnM > 0 ? dnM : 0;
        const tr = this.ma(st.tr, this.trueRange(true), a.diLength, 1 / a.diLength);
        const p = 100 * this.ma(st.p, plusDM, a.diLength, 1 / a.diLength) / tr, m = 100 * this.ma(st.m, minusDM, a.diLength, 1 / a.diLength) / tr;
        const sum = p + m; const adx = this.ma(st.adx, sum === 0 ? 0 : 100 * Math.abs(p - m) / sum, a.adxSmoothing, 1 / a.adxSmoothing);
        return [p, m, adx];
      }
      case "vwap": { const a = P(["source", "anchor", "stdev_mult"]); return this.vwap(n, a.source, a.anchor, a.stdev_mult); }
      case "linreg": { const a = P(["source", "length", "offset"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length); if (w.length < a.length) return NA; const L = w.length; let sx = 0, sy = 0, sxy = 0, sxx = 0; w.forEach((y, k) => { sx += k; sy += y; sxy += k * y; sxx += k * k; }); const slope = (L * sxy - sx * sy) / (L * sxx - sx * sx); const icp = (sy - slope * sx) / L; return icp + slope * (L - 1 - (a.offset || 0)); }
      case "percentrank": { const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length + 1); if (w.length <= a.length) return NA; const cur = w[w.length - 1]; return 100 * w.slice(0, -1).filter((x) => x <= cur).length / a.length; }
      case "median": case "max": case "min": {
        if (name !== "median") { const a = P(["source"]); const st = s(() => ({ v: NA })); if (!isNa(a.source)) st.v = isNa(st.v) ? a.source : name === "max" ? Math.max(st.v, a.source) : Math.min(st.v, a.source); return st.v; }
        const a = P(["source", "length"]); const st = s(() => ({ v: [] })); push(st, a.source); const w = last(st, a.length).slice().sort((x, y) => x - y); if (w.length < a.length) return NA; const h = Math.floor(w.length / 2); return w.length % 2 ? w[h] : (w[h - 1] + w[h]) / 2;
      }
    }
    return this.miss("ta." + name);
  }
  wmaState(st, src, len) { st.v.push(src); if (st.v.length > 5000) st.v.shift(); const w = st.v.slice(-len); if (w.length < len || w.some(isNa)) return NA; let num = 0, den = 0; w.forEach((x, k) => { num += x * (k + 1); den += k + 1; }); return num / den; }
  // EMA / RMA seeded with the SMA of the first `len` values (as TradingView does).
  ma(st, src, len, alpha) {
    if (isNa(src)) return st.prev;
    if (isNa(st.prev)) {
      st.v.push(src);
      if (st.v.length < len) return NA;
      st.prev = st.v.slice(-len).reduce((x, y) => x + y, 0) / len; st.v = [];
      return st.prev;
    }
    st.prev = alpha * src + (1 - alpha) * st.prev;
    return st.prev;
  }
  trueRange(handleNa) {
    const D = this.D, i = this.i;
    if (i === 0) return handleNa ? D.h[i] - D.l[i] : NA;
    const pc = D.c[i - 1];
    return Math.max(D.h[i] - D.l[i], Math.abs(D.h[i] - pc), Math.abs(D.l[i] - pc));
  }
  vwap(n, src, anchor, mult) {
    const D = this.D, i = this.i;
    const st = this.st(n, () => ({ pv: 0, vv: 0, pv2: 0, day: null }));
    const day = anchor === undefined ? bucketOf(D.t[i], 86400, this.sym.timezone) : null;
    const reset = anchor === undefined ? day !== st.day : this.truthy(anchor);
    if (reset || i === 0) { st.pv = 0; st.vv = 0; st.pv2 = 0; st.day = day; }
    const v = D.v[i] || 1;
    st.pv += src * v; st.vv += v; st.pv2 += src * src * v;
    const vw = st.pv / st.vv;
    if (mult === undefined || isNa(mult)) return vw;
    const sd = Math.sqrt(Math.max(0, st.pv2 / st.vv - vw * vw));
    return [vw, vw + mult * sd, vw - mult * sd];
  }

  // ---------- math ----------
  mathFn(name, n, env) {
    const a = this.posArgs(n, env);
    switch (name) {
      case "abs": return Math.abs(a[0]); case "sqrt": return Math.sqrt(a[0]); case "pow": return Math.pow(a[0], a[1]);
      case "log": return Math.log(a[0]); case "log10": return Math.log10(a[0]); case "exp": return Math.exp(a[0]); case "sign": return Math.sign(a[0]);
      case "floor": return Math.floor(a[0]); case "ceil": return Math.ceil(a[0]);
      case "round": { if (isNa(a[0])) return NA; if (a.length > 1 && !isNa(a[1])) { const f = 10 ** a[1]; return Math.round(a[0] * f) / f; } return Math.round(a[0]); }
      case "round_to_mintick": { const m = this.sym.mintick; return Math.round(a[0] / m) * m; }
      case "max": return a.some(isNa) ? NA : Math.max(...a); case "min": return a.some(isNa) ? NA : Math.min(...a);
      case "avg": return a.some(isNa) ? NA : a.reduce((x, y) => x + y, 0) / a.length;
      case "sin": return Math.sin(a[0]); case "cos": return Math.cos(a[0]); case "tan": return Math.tan(a[0]); case "atan": return Math.atan(a[0]); case "asin": return Math.asin(a[0]); case "acos": return Math.acos(a[0]);
      case "todegrees": return a[0] * 180 / Math.PI; case "toradians": return a[0] * Math.PI / 180;
      case "random": { const lo = a[0] ?? 0, hi = a[1] ?? 1; return lo + Math.random() * (hi - lo); }
      case "sum": { const st = this.st(n, () => ({ v: [] })); st.v.push(a[0]); if (st.v.length > 5000) st.v.shift(); const w = st.v.slice(-a[1]); return w.length < a[1] || w.some(isNa) ? NA : w.reduce((x, y) => x + y, 0); }
    }
    return this.miss("math." + name);
  }

  // ---------- request.security ----------
  request(name, n, env) {
    if (name !== "security") return this.miss("request." + name);
    const args = n.arguments || [];
    const named = {}; const pos = [];
    for (const a of args) { if (a.name) named[a.name] = a.value; else pos.push(a.value); }
    const tfNode = named.timeframe || pos[1], exprNode = named.expression || pos[2];
    const lookNode = named.lookahead || pos[4];
    const tf = tfNode ? this.ev(tfNode, env) : "";
    const look = lookNode ? this.ev(lookNode, env) : "barmerge.lookahead_off";
    const symNode = named.symbol || pos[0]; const sym = symNode ? this.ev(symNode, env) : this.sym.tickerid;
    if (sym !== this.sym.tickerid && typeof sym === "string" && !sym.endsWith(this.sym.ticker)) this.unsupported.add("request.security on another symbol (" + String(sym).slice(0, 30) + ")");
    const sec = tf ? tfSeconds(tf) : this.main.tfSec;
    if (!exprNode) return NA;
    if (this.inSec || !sec || sec <= this.main.tfSec) return this.ev(exprNode, env);
    const k = this.ctx + "|sec" + this.id(n);
    let c = this.secCache.get(k);
    if (!c) {
      const M = this.main, tz = this.sym.timezone;
      const H = { o: [], h: [], l: [], c: [], v: [], t: [], n: 0, tfSec: sec }, map = [], lastIn = [];
      let cur = null;
      for (let j = 0; j < M.n; j++) {
        const b = bucketOf(M.t[j], sec, tz);
        if (b !== cur) { cur = b; H.o.push(M.o[j]); H.h.push(M.h[j]); H.l.push(M.l[j]); H.c.push(M.c[j]); H.v.push(M.v[j]); H.t.push(M.t[j]); H.n++; }
        else { const q = H.n - 1; H.h[q] = Math.max(H.h[q], M.h[j]); H.l[q] = Math.min(H.l[q], M.l[j]); H.c[q] = M.c[j]; H.v[q] += M.v[j]; }
        map[j] = H.n - 1;
      }
      for (let j = 0; j < M.n; j++) lastIn[j] = j === M.n - 1 || map[j + 1] !== map[j];
      c = { H, map, lastIn, res: [], done: -1 };
      this.secCache.set(k, c);
    }
    const kb = c.map[this.i];
    while (c.done < kb) {
      c.done++;
      const saved = { D: this.D, i: this.i, ctx: this.ctx, inSec: this.inSec };
      this.D = c.H; this.i = c.done; this.ctx = k; this.inSec = true;
      try { c.res[c.done] = this.ev(exprNode, env); } finally { Object.assign(this, saved); }
    }
    if (look === "barmerge.lookahead_on") return c.res[kb];
    return c.lastIn[this.i] ? c.res[kb] : kb > 0 ? c.res[kb - 1] : (Array.isArray(c.res[0]) ? c.res[0].map(() => NA) : NA);
  }

  // ---------- strings ----------
  get builtinsStr() { return STR_FNS; }
  strFn(name, a) {
    switch (name) {
      case "tostring": return typeof a[0] === "string" ? a[0] : isNa(a[0]) ? "NaN" : fmtNum(a[0], a[1], this.sym.mintick);
      case "format": { const f = String(a[0]); return f.replace(/\{(\d+)(?:,\s*number,\s*([^}]+))?\}/g, (_, k, pat) => { const v = a[+k + 1]; return typeof v === "number" ? fmtNum(v, pat ? pat.trim() : undefined, this.sym.mintick) : String(v); }); }
      case "length": return String(a[0]).length; case "upper": return String(a[0]).toUpperCase(); case "lower": return String(a[0]).toLowerCase();
      case "contains": return String(a[0]).includes(a[1]); case "startswith": return String(a[0]).startsWith(a[1]); case "endswith": return String(a[0]).endsWith(a[1]);
      case "pos": { const k = String(a[0]).indexOf(a[1]); return k < 0 ? NA : k; }
      case "replace_all": return String(a[0]).split(a[1]).join(a[2]); case "replace": return String(a[0]).replace(a[1], a[2]);
      case "substring": return String(a[0]).substring(a[1], a[2]); case "trim": return String(a[0]).trim(); case "repeat": return String(a[0]).repeat(Math.max(0, a[1] || 0)) ;
      case "split": return new PArr(String(a[0]).split(a[1])); case "tonumber": { const v = parseFloat(a[0]); return isNaN(v) ? NA : v; }
      case "format_time": return new Date(a[0]).toISOString().slice(0, 16).replace("T", " ");
    }
    return this.miss("str." + name);
  }

  // ---------- arrays / maps ----------
  arrayFn(name, a, n) {
    if (name === "new" || name.startsWith("new_")) { const size = a[0] || 0; const init = a.length > 1 ? a[1] : NA; return new PArr(Array.from({ length: Math.max(0, Math.min(100000, size)) }, () => init)); }
    if (name === "from") return new PArr(a.slice());
    const arr = a[0];
    if (!(arr instanceof PArr)) { if (isNa(arr)) return NA; return this.miss("array." + name); }
    const A = arr.a;
    const idx = (k) => { if (isNa(k)) throw new PineError("array index is na"); const j = k < 0 ? A.length + k : k; if (j < 0 || j >= A.length) throw new PineError("array index " + k + " is out of bounds (size " + A.length + ")"); return j; };
    const nums = () => A.filter((x) => !isNa(x));
    switch (name) {
      case "push": A.push(a[1]); if (A.length > 100000) throw new PineError("array too large"); return NA;
      case "unshift": A.unshift(a[1]); return NA;
      case "pop": if (!A.length) throw new PineError("cannot pop from an empty array"); return A.pop();
      case "shift": if (!A.length) throw new PineError("cannot shift from an empty array"); return A.shift();
      case "get": return A[idx(a[1])]; case "set": A[idx(a[1])] = a[2]; return NA;
      case "size": return A.length; case "clear": A.length = 0; return NA;
      case "remove": return A.splice(idx(a[1]), 1)[0];
      case "insert": A.splice(a[1], 0, a[2]); return NA;
      case "first": if (!A.length) throw new PineError("array is empty"); return A[0];
      case "last": if (!A.length) throw new PineError("array is empty"); return A[A.length - 1];
      case "includes": return A.some((x) => this.bin("==", x, a[1]) || x === a[1]); case "indexof": { const k = A.findIndex((x) => x === a[1]); return k; } case "lastindexof": { for (let k = A.length - 1; k >= 0; k--) if (A[k] === a[1]) return k; return -1; }
      case "max": { const v = nums(); return v.length ? Math.max(...v) : NA; } case "min": { const v = nums(); return v.length ? Math.min(...v) : NA; }
      case "sum": return nums().reduce((x, y) => x + y, 0); case "avg": { const v = nums(); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NA; }
      case "median": { const v = nums().sort((x, y) => x - y); if (!v.length) return NA; const h = Math.floor(v.length / 2); return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; }
      case "stdev": { const v = nums(); if (!v.length) return NA; const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length); }
      case "sort": { const desc = a[1] === "order.descending"; A.sort((x, y) => (desc ? y - x : x - y)); return NA; }
      case "sort_indices": { const desc = a[1] === "order.descending"; return new PArr(A.map((x, k) => k).sort((p, q) => (desc ? A[q] - A[p] : A[p] - A[q]))); }
      case "reverse": A.reverse(); return NA; case "copy": return new PArr(A.slice());
      case "slice": return new PArr(A.slice(a[1], a[2])); case "concat": if (a[1] instanceof PArr) A.push(...a[1].a); return arr;
      case "fill": { const from = a[2] || 0, to = a[3] === undefined ? A.length : a[3]; for (let k = from; k < to; k++) A[k] = a[1]; return NA; }
      case "join": return A.map((x) => (typeof x === "number" ? fmtNum(x) : String(x))).join(a[1] === undefined ? "," : a[1]);
      case "range": { const v = nums(); return v.length ? Math.max(...v) - Math.min(...v) : NA; }
      case "abs": return new PArr(A.map((x) => Math.abs(x)));
      case "every": return A.every((x) => this.truthy(x)); case "some": return A.some((x) => this.truthy(x));
      case "binary_search": return A.indexOf(a[1]);
      case "percentile_linear_interpolation": case "percentile_nearest_rank": { const v = nums().sort((x, y) => x - y); if (!v.length) return NA; const k = Math.min(v.length - 1, Math.max(0, Math.round((a[1] / 100) * (v.length - 1)))); return v[k]; }
    }
    return this.miss("array." + name);
  }
  mapFn(name, a) {
    const m = a[0]; if (!(m instanceof PMap)) return NA;
    switch (name) {
      case "put": { const old = m.m.has(a[1]) ? m.m.get(a[1]) : NA; m.m.set(a[1], a[2]); return old; }
      case "get": return m.m.has(a[1]) ? m.m.get(a[1]) : NA; case "contains": return m.m.has(a[1]);
      case "remove": { const old = m.m.get(a[1]); m.m.delete(a[1]); return old === undefined ? NA : old; }
      case "size": return m.m.size; case "clear": m.m.clear(); return NA;
      case "keys": return new PArr([...m.m.keys()]); case "values": return new PArr([...m.m.values()]); case "copy": { const c = new PMap(); c.m = new Map(m.m); return c; }
    }
    return this.miss("map." + name);
  }

  // ---------- colors ----------
  colorFn(name, A) {
    switch (name) {
      case "new": { const a = A(["color", "transp"]); const c = toColor(a.color); if (!c) return NA; return { r: c.r, g: c.g, b: c.b, t: isNa(a.transp) || a.transp === undefined ? c.t : Math.max(0, Math.min(100, a.transp)) }; }
      case "rgb": { const a = A(["red", "green", "blue", "transp"]); return { r: Math.round(a.red), g: Math.round(a.green), b: Math.round(a.blue), t: a.transp || 0 }; }
      case "from_gradient": {
        const a = A(["value", "bottom_value", "top_value", "bottom_color", "top_color"]);
        const b = toColor(a.bottom_color), t = toColor(a.top_color); if (!b || !t || isNa(a.value)) return NA;
        let f = (a.value - a.bottom_value) / (a.top_value - a.bottom_value); f = Math.max(0, Math.min(1, isNaN(f) ? 0 : f));
        const L = (x, y) => Math.round(x + (y - x) * f); return { r: L(b.r, t.r), g: L(b.g, t.g), b: L(b.b, t.b), t: L(b.t, t.t) };
      }
      case "r": case "g": case "b": case "t": { const a = A(["color"]); const c = toColor(a.color); return c ? c[name] : NA; }
    }
    return this.miss("color." + name);
  }
  tfFn(name, A) {
    switch (name) {
      case "in_seconds": { const a = A(["timeframe"]); return a.timeframe ? tfSeconds(a.timeframe) : this.D.tfSec; }
      case "from_seconds": { const a = A(["seconds"]); return tfString(a.seconds); }
      case "change": { const a = A(["timeframe"]); const sec = tfSeconds(a.timeframe); const i = this.i, D = this.D; if (i === 0) return true; return bucketOf(D.t[i], sec, this.sym.timezone) !== bucketOf(D.t[i - 1], sec, this.sym.timezone); }
    }
    return this.miss("timeframe." + name);
  }

  // ---------- drawings ----------
  newDrawing(kind, props) {
    if (this.inSec) return NA;
    const d = new Drawing(kind, this.drawSeq++, props);
    const live = this.live[kind]; live.push(d);
    const max = kind === "label" ? this.decl.maxLabels : kind === "line" ? this.decl.maxLines : this.decl.maxBoxes;
    let alive = live.filter((x) => !x.deleted);
    while (alive.length > max) { alive[0].deleted = true; alive = alive.slice(1); }
    if (live.length > max * 4) this.live[kind] = live.filter((x) => !x.deleted);
    return d;
  }
  drawFn(kind, name, pre, n, env, isMethod) {
    const PN = {
      label: ["x", "y", "text", "xloc", "yloc", "color", "style", "textcolor", "size", "textalign", "tooltip", "text_font_family", "force_overlay"],
      line: ["x1", "y1", "x2", "y2", "xloc", "extend", "color", "style", "width", "force_overlay"],
      box: ["left", "top", "right", "bottom", "border_color", "border_width", "border_style", "extend", "xloc", "bgcolor", "text", "text_size", "text_color", "text_halign", "text_valign", "text_wrap", "text_font_family", "force_overlay"],
    }[kind];
    if (name === "new") {
      const a = this.bind(n.arguments, PN);
      if (kind === "label") return this.newDrawing("label", { x: a.x, y: a.y, text: a.text ?? "", xloc: a.xloc || "xloc.bar_index", yloc: a.yloc || "yloc.price", color: a.color === undefined ? C("#2962FF") : toColor(a.color), style: a.style || "label.style_label_down", textcolor: a.textcolor === undefined ? C("#FFFFFF") : toColor(a.textcolor), size: a.size || "size.normal", textalign: a.textalign || "text.align_center", tooltip: a.tooltip || "", fo: a.force_overlay === true });
      if (kind === "line") return this.newDrawing("line", { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, xloc: a.xloc || "xloc.bar_index", extend: a.extend || "extend.none", color: a.color === undefined ? C("#2962FF") : toColor(a.color), style: a.style || "line.style_solid", width: a.width || 1, fo: a.force_overlay === true });
      return this.newDrawing("box", { left: a.left, top: a.top, right: a.right, bottom: a.bottom, border_color: a.border_color === undefined ? C("#2962FF") : toColor(a.border_color), border_width: a.border_width ?? 1, border_style: a.border_style || "line.style_solid", extend: a.extend || "extend.none", xloc: a.xloc || "xloc.bar_index", bgcolor: a.bgcolor === undefined ? C("#2962FF") : toColor(a.bgcolor), text: a.text || "", text_size: a.text_size || "size.auto", text_color: a.text_color === undefined ? C("#000000") : toColor(a.text_color), text_halign: a.text_halign || "text.align_center", text_valign: a.text_valign || "text.align_center", fo: a.force_overlay === true });
    }
    const vals = pre || this.posArgs(n, env);
    const d = vals[0];
    if (name === "delete") { if (d instanceof Drawing) d.deleted = true; return NA; }
    if (!(d instanceof Drawing)) return NA;
    if (name === "copy") return this.newDrawing(kind, { ...d.p });
    const v = vals[1], v2 = vals[2];
    const p = d.p;
    const setters = {
      label: { set_x: () => (p.x = v), set_y: () => (p.y = v), set_xy: () => { p.x = v; p.y = v2; }, set_text: () => (p.text = v), set_color: () => (p.color = toColor(v)), set_textcolor: () => (p.textcolor = toColor(v)), set_style: () => (p.style = v), set_size: () => (p.size = v), set_yloc: () => (p.yloc = v), set_xloc: () => { p.x = v; p.xloc = v2; }, set_tooltip: () => (p.tooltip = v), set_textalign: () => (p.textalign = v), set_text_font_family: () => 0, get_x: () => p.x, get_y: () => p.y, get_text: () => p.text, set_point: () => 0 },
      line: { set_x1: () => (p.x1 = v), set_x2: () => (p.x2 = v), set_y1: () => (p.y1 = v), set_y2: () => (p.y2 = v), set_xy1: () => { p.x1 = v; p.y1 = v2; }, set_xy2: () => { p.x2 = v; p.y2 = v2; }, set_color: () => (p.color = toColor(v)), set_style: () => (p.style = v), set_width: () => (p.width = v), set_extend: () => (p.extend = v), set_xloc: () => { p.x1 = v; p.x2 = v2; p.xloc = vals[3]; }, get_x1: () => p.x1, get_x2: () => p.x2, get_y1: () => p.y1, get_y2: () => p.y2, get_price: () => { const x = v; if (p.x2 === p.x1) return p.y1; return p.y1 + (p.y2 - p.y1) * (x - p.x1) / (p.x2 - p.x1); } },
      box: { set_left: () => (p.left = v), set_right: () => (p.right = v), set_top: () => (p.top = v), set_bottom: () => (p.bottom = v), set_lefttop: () => { p.left = v; p.top = v2; }, set_rightbottom: () => { p.right = v; p.bottom = v2; }, set_top_left_point: () => 0, set_bottom_right_point: () => 0, set_bgcolor: () => (p.bgcolor = toColor(v)), set_border_color: () => (p.border_color = toColor(v)), set_border_width: () => (p.border_width = v), set_border_style: () => (p.border_style = v), set_extend: () => (p.extend = v), set_text: () => (p.text = v), set_text_color: () => (p.text_color = toColor(v)), set_text_size: () => (p.text_size = v), set_text_halign: () => (p.text_halign = v), set_text_valign: () => (p.text_valign = v), set_text_wrap: () => 0, set_text_font_family: () => 0, set_xloc: () => { p.left = v; p.right = v2; p.xloc = vals[3]; }, get_left: () => p.left, get_right: () => p.right, get_top: () => p.top, get_bottom: () => p.bottom },
    }[kind];
    const f = setters[name];
    if (!f) return this.miss(kind + "." + name);
    const r = f();
    return name.startsWith("get_") ? r : NA;
  }
  tableFn(name, n, env, self) {
    if (name === "new") {
      const a = this.bind(n.arguments, ["position", "columns", "rows", "bgcolor", "frame_color", "frame_width", "border_color", "border_width", "force_overlay"]);
      if (this.inSec) return NA;
      const t = new PTable(this.drawSeq++, { position: a.position || "position.top_right", columns: a.columns, rows: a.rows, bgcolor: cssColor(toColor(a.bgcolor)), frame_color: cssColor(toColor(a.frame_color)), frame_width: a.frame_width || 0, border_color: cssColor(toColor(a.border_color)), border_width: a.border_width || 0 });
      this.out.tables.push(t);
      return t;
    }
    const args = self ? [{ value: null, self: true }, ...(n.arguments || [])] : n.arguments || [];
    const evArgs = (names) => { const out = {}; let pos = 0; for (const a of args) { if (a.self) { out[names[pos++]] = self; continue; } if (a.name) out[a.name] = this.ev(a.value, env); else out[names[pos++]] = this.ev(a.value, env); } return out; };
    if (name === "cell") {
      const a = evArgs(["table_id", "column", "row", "text", "width", "height", "text_color", "text_halign", "text_valign", "text_size", "bgcolor", "tooltip", "text_font_family"]);
      const t = a.table_id; if (!(t instanceof PTable)) return NA;
      t.cells[a.column + ":" + a.row] = { text: a.text === undefined ? "" : String(a.text), text_color: cssColor(toColor(a.text_color)), bgcolor: cssColor(toColor(a.bgcolor)), text_size: a.text_size || "size.normal", text_halign: a.text_halign || "text.align_center", mono: a.text_font_family === "font.family_monospace" };
      return NA;
    }
    if (name === "delete") { const a = evArgs(["table_id"]); if (a.table_id instanceof PTable) a.table_id.deleted = true; return NA; }
    if (name === "clear") { const a = evArgs(["table_id", "start_column", "start_row", "end_column", "end_row"]); if (a.table_id instanceof PTable) a.table_id.cells = {}; return NA; }
    if (name === "merge_cells") { const a = evArgs(["table_id", "start_column", "start_row", "end_column", "end_row"]); if (a.table_id instanceof PTable) { const key = [a.start_column, a.start_row, a.end_column, a.end_row].join(","); if (!a.table_id.merges.includes(key)) a.table_id.merges.push(key); } return NA; }
    if (name.startsWith("cell_set_")) {
      const field = name.slice(9);
      const a = evArgs(["table_id", "column", "row", "value"]);
      const t = a.table_id; if (!(t instanceof PTable)) return NA;
      const c = t.cells[a.column + ":" + a.row] || (t.cells[a.column + ":" + a.row] = { text: "", text_size: "size.normal" });
      if (field === "text") c.text = String(a.value); else if (field === "bgcolor" || field === "text_color") c[field] = cssColor(toColor(a.value)); else c[field] = a.value;
      return NA;
    }
    if (name.startsWith("set_")) return NA;
    return this.miss("table." + name);
  }

  // ---------- strategy (simple simulator: market orders at the next bar's open, stop / limit exits) ----------
  stratBar() {
    const S = this.strat, D = this.main, i = this.i;
    if (!S.queue || this.inSec) return;
    // Fill orders queued on the previous bar at this bar's open.
    for (const o of S.queue.splice(0)) {
      const px = D.o[i];
      if (o.type === "entry") {
        if (S.pos !== 0 && Math.sign(S.pos) !== o.dir) this.closeTrade(px, i, "reverse");
        if (S.pos === 0) { S.pos = o.dir; S.avg = px; S.entryBar = i; S.entryId = o.id; this.out.trades.push({ bar: i, price: px, dir: o.dir, id: o.id, kind: "entry" }); }
      } else if (o.type === "close" && S.pos !== 0) this.closeTrade(px, i, o.id || "close");
    }
    if (S.pos !== 0 && S.exit) {
      const { stop, limit } = S.exit;
      const long = S.pos > 0;
      const hitStop = !isNa(stop) && (long ? D.l[i] <= stop : D.h[i] >= stop);
      const hitLim = !isNa(limit) && (long ? D.h[i] >= limit : D.l[i] <= limit);
      if (hitStop) this.closeTrade(stop, i, "SL"); else if (hitLim) this.closeTrade(limit, i, "TP");
    }
  }
  closeTrade(px, i, why) {
    const S = this.strat;
    const pnl = (px - S.avg) * S.pos;
    S.closed++; if (pnl > 0) S.wins++; S.net += pnl;
    this.out.trades.push({ bar: i, price: px, dir: -S.pos, id: why, kind: "exit", pnl });
    S.pos = 0; S.avg = NA; S.exit = null;
  }
  strategyFn(name, n, env, A) {
    const S = this.strat; S.queue = S.queue || [];
    if (this.inSec) return NA;
    switch (name) {
      case "entry": { const a = A(["id", "direction", "qty", "limit", "stop"]); const dir = a.direction === "short" ? -1 : 1; if (Math.sign(S.pos) !== dir) S.queue.push({ type: "entry", dir, id: a.id }); return NA; }
      case "order": { const a = A(["id", "direction"]); S.queue.push({ type: "entry", dir: a.direction === "short" ? -1 : 1, id: a.id }); return NA; }
      case "exit": { const a = A(["id", "from_entry", "qty", "qty_percent", "profit", "limit", "loss", "stop"]); const m = this.sym.mintick; let stop = a.stop, limit = a.limit; if (S.pos && isNa(stop ?? NA) && a.loss !== undefined) stop = S.avg - Math.sign(S.pos) * a.loss * m; if (S.pos && isNa(limit ?? NA) && a.profit !== undefined) limit = S.avg + Math.sign(S.pos) * a.profit * m; S.exit = { stop: stop === undefined ? NA : stop, limit: limit === undefined ? NA : limit }; return NA; }
      case "close": case "close_all": { const a = A(["id"]); if (S.pos) S.queue.push({ type: "close", id: a.id }); return NA; }
      case "cancel": case "cancel_all": return NA;
    }
    return this.miss("strategy." + name);
  }

  // ---------- result ----------
  result(error, errorLine) {
    const n = this.main.n;
    const toX = (x, xloc) => (xloc === "xloc.bar_time" ? this.timeToBar(x) : x);
    const pick = (kind, f) => this.live[kind].filter((d) => !d.deleted).map(f);
    const out = this.out;
    const labels = pick("label", (d) => ({ x: toX(d.p.x, d.p.xloc), y: d.p.y, yloc: d.p.yloc, text: String(d.p.text ?? ""), color: cssColor(d.p.color), textcolor: cssColor(d.p.textcolor), style: d.p.style, size: d.p.size, tooltip: d.p.tooltip, fo: !!d.p.fo }))
      .filter((l) => !isNa(l.x) && (l.yloc !== "yloc.price" || !isNa(l.y)));
    const lines = pick("line", (d) => ({ x1: toX(d.p.x1, d.p.xloc), y1: d.p.y1, x2: toX(d.p.x2, d.p.xloc), y2: d.p.y2, extend: d.p.extend, color: cssColor(d.p.color), style: d.p.style, width: d.p.width, fo: !!d.p.fo }))
      .filter((l) => [l.x1, l.y1, l.x2, l.y2].every((v) => !isNa(v)));
    const boxes = pick("box", (d) => ({ left: toX(d.p.left, d.p.xloc), right: toX(d.p.right, d.p.xloc), top: d.p.top, bottom: d.p.bottom, extend: d.p.extend, bg: cssColor(d.p.bgcolor), border: cssColor(d.p.border_color), bw: d.p.border_width, bs: d.p.border_style, text: d.p.text, tc: cssColor(d.p.text_color), ts: d.p.text_size, th: d.p.text_halign, tv: d.p.text_valign, fo: !!d.p.fo }))
      .filter((b) => [b.left, b.right, b.top, b.bottom].every((v) => !isNa(v)));
    const tables = out.tables.filter((t) => !t.deleted && Object.keys(t.cells).length).map((t) => ({ ...t.p, cells: t.cells, merges: t.merges }));
    const plots = out.plots.map((p) => ({ ...p, values: Array.from({ length: n }, (_, k) => (p.values[k - p.offset] === undefined ? null : p.values[k - p.offset])), colors: Array.from({ length: n }, (_, k) => p.colors[k - p.offset] || null) }));
    return {
      ok: !error, error: error || undefined, errorLine: errorLine || undefined,
      title: this.decl.title, kind: this.decl.kind, overlay: this.decl.overlay,
      plots, hlines: out.hlines, fills: out.fills.map((f) => ({ ...f, colors: Array.from({ length: n }, (_, k) => f.colors[k] || null) })),
      shapes: out.shapes.filter((s) => s.bar >= 0 && s.bar < n + 50),
      bg: Array.from({ length: n }, (_, k) => out.bg[k] || null), barcolor: Array.from({ length: n }, (_, k) => out.barcolor[k] || null),
      labels: labels.slice(-500), lines: lines.slice(-500), boxes: boxes.slice(-500), tables,
      trades: out.trades.slice(-400), stats: this.decl.kind === "strategy" ? { closed: this.strat.closed, wins: this.strat.wins, net: this.strat.net } : undefined,
      unsupported: [...this.unsupported].slice(0, 12), ms: Date.now() - this.t0, bars: n,
    };
  }
  timeToBar(t) {
    const T = this.main.t; if (isNa(t)) return NA;
    if (t > T[T.length - 1]) return T.length - 1 + Math.round((t - T[T.length - 1]) / (this.main.tfSec * 1000));
    let lo = 0, hi = T.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m + 1; else hi = m; } return lo;
  }
}

const NAMESPACES = new Set(["ta", "math", "input", "request", "str", "array", "map", "color", "label", "line", "box", "table", "timeframe", "strategy", "runtime", "log", "ticker", "chart", "matrix"]);
const STR_FNS = new Set(["tostring", "format", "length", "upper", "lower", "contains", "startswith", "endswith", "pos", "replace_all", "replace", "substring", "trim", "repeat", "split", "tonumber"]);

export function runPreview(code, candles, opts) {
  return new PreviewRunner(code, candles, opts).run();
}
