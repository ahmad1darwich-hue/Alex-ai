// Run: node nexus-engine/tests/lint.test.mjs
import assert from "node:assert/strict";
import { checkPine, sanitizeCode, describeDiagnostics, summarizeCheck } from "../../brain-app/api/_nexus/lint.js";
import { TEMPLATES } from "../../brain-app/api/_nexus/templates.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("FAIL", name, "\n ", e.message); process.exitCode = 1; } };

for (const tpl of TEMPLATES) {
  t(`template ${tpl.id} is clean`, () => {
    const c = checkPine(tpl.code);
    assert.equal(c.errors.length, 0, JSON.stringify(c.errors.slice(0, 3)));
    assert.equal(c.mustFix.length, 0, JSON.stringify(c.mustFix.slice(0, 3)));
    assert.equal(c.shouldFix.length, 0, JSON.stringify(c.shouldFix.slice(0, 3)));
    assert.equal(c.code, tpl.code, "sanitize must not change a template");
  });
}

t("syntax error is reported with TradingView wording", () => {
  const c = checkPine('//@version=6\nindicator("x")\na = ta.sma(close, 14\nplot(a)\n');
  assert.ok(!c.ok);
  assert.match(c.errors[0].message, /Missing closing parenthesis/);
});
t("undeclared identifier, unknown function, bool na, numeric condition, transp", () => {
  const c = checkPine('//@version=6\nindicator("x", overlay=true)\nx = ta.sma(close, 14)\ny = nope + 1\nz = ta.notAFunction(close)\nbool b = na\nif x\n    label.new(bar_index, high, "a")\nplot(x, transp=50)\n');
  const msgs = c.errors.map((e) => e.message).join(" | ");
  assert.match(msgs, /nope/);
  assert.match(msgs, /ta\.notAFunction/);
  assert.match(msgs, /"b" variable/);
  assert.match(msgs, /must evaluate to a "bool" value/);
  assert.match(msgs, /argument with the name "transp"/);
});
t("plot in local scope and series text are errors", () => {
  const c = checkPine('//@version=6\nindicator("x", overlay=true)\nif close > open\n    plot(close)\nplotshape(close > open, text=str.tostring(close))\n');
  assert.ok(c.errors.length >= 2);
});
t("conditional ta call is must-fix", () => {
  const c = checkPine('//@version=6\nindicator("x", overlay=true)\nshow = input.bool(true, "Show")\nup = show and ta.crossover(close, ta.sma(close, 20))\nplotshape(up)\n');
  assert.ok(c.ok);
  assert.ok(c.mustFix.some((w) => /CW1000[234]/.test(w.code || "") || w.rule === "CONDITIONAL_SERIES"), JSON.stringify(c.mustFix));
});
t("unused input is must-fix, unused plain variable is only a note", () => {
  const c = checkPine('//@version=6\nindicator("x")\nlenInput = input.int(14, "Length")\nunusedThing = 5\nplot(close)\n');
  assert.ok(c.mustFix.some((w) => w.rule === "NX_UNUSED_INPUT"));
  assert.ok(!c.mustFix.some((w) => /unusedThing/.test(w.message)));
});
t("long shorttitle and non-ASCII are must-fix", () => {
  const c = checkPine('//@version=6\nindicator("My indicator", shorttitle = "Much too long title", overlay = true)\nplotshape(close > open, text = "↑")\n');
  assert.ok(c.mustFix.some((w) => w.rule === "NX_SHORTTITLE"));
  assert.ok(c.mustFix.some((w) => w.rule === "NX_NON_ASCII"));
});
t("missing version is an error", () => {
  const c = checkPine('indicator("x")\nplot(close)\n');
  assert.ok(!c.ok);
});
t("sanitize strips fences, tabs, smart quotes, bidi marks", () => {
  const s = sanitizeCode('```pine\n// FILE: a.pine\n//@version=6\r\nindicator(“x”)‏\n\tplot(close)   \n```');
  assert.equal(s, '//@version=6\nindicator("x")\n    plot(close)\n');
});
t("describeDiagnostics quotes the source line", () => {
  const c = checkPine('//@version=6\nindicator("x")\ny = nope + 1\nplot(y)\n');
  const d = describeDiagnostics(c);
  assert.match(d, /line 3/); assert.match(d, /> y = nope \+ 1/);
  assert.equal(summarizeCheck(c).ok, false);
});
t("const string through a variable is an error; constants and user functions are not", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  const bad1 = checkPine(H + 'bool up = close > open\nstring txt = up ? "A" : "B"\nplotchar(up, title = "t", char = "R", text = txt)\n');
  // Reported by the type checker itself (typed declarations keep the series qualifier) or by the Nexus rule.
  assert.ok(bad1.errors.some((e) => (e.rule === "NX_CONST_STRING" || e.code === "CE10123") && e.line === 5), JSON.stringify(bad1.errors));
  const bad1b = checkPine(H + 'up = close > open\ntxt = up ? "A" : "B"\nplotchar(up, title = "t", char = "R", text = txt)\n');
  assert.ok(bad1b.errors.some((e) => e.line === 5), JSON.stringify(bad1b.errors));
  const bad2 = checkPine(H + 'msg = "Up on " + syminfo.ticker\nalertcondition(close > open, "Up", msg)\n');
  assert.ok(bad2.errors.some((e) => e.rule === "NX_CONST_STRING" && /alert\(\)/.test(e.message)));
  const good = checkPine(H + 'GRP = "Main"\nTT = "Tip " + "more"\nmk(a, b) => a + b\nstring ttl = mk("My", " plot")\nlen = input.int(10, "Len", group = GRP, tooltip = TT)\nplot(ta.sma(close, len), title = ttl)\nalertcondition(close > open, "Up", "Up {{ticker}}")\n');
  assert.equal(good.errors.length, 0, JSON.stringify(good.errors));
  // The type checker reports the direct case itself: no duplicate from the Nexus rule.
  const direct = checkPine(H + 'plotshape(close > open, text = str.tostring(close))\n');
  assert.equal(direct.errors.filter((e) => e.line === 3).length, 1);
});
t("library imports are must-fix", () => {
  const c = checkPine('//@version=6\nindicator("x")\nimport TradingView/ta/9 as tav\nplot(close)\n');
  assert.ok(c.mustFix.some((w) => w.rule === "NX_IMPORT"));
});
// --- Rules calibrated against TradingView's compiler (each case below was compiled there) ---
t("series values are rejected where TradingView needs a simple argument", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  const bad = [
    'int len = bar_index % 2 == 0 ? 10 : 20\nplot(ta.rsi(close, len))',                       // typed declaration keeps the series qualifier
    'len = close > open ? 10 : 20\nplot(ta.ema(close, len))',
    'float x = close\nplot(ta.ema(close, int(x)))',
    'mult = close > open ? 2.0 : 3.0\n[b, u, l] = ta.bb(close, 20, mult)\nplot(u)',           // "simple int/float" parameters
    'var lens = array.from(10, 20)\nplot(ta.atr(lens.get(0)))',                                // collection elements are series
    'type Cfg\n    int len\nvar c = Cfg.new(10)\nplot(ta.ema(close, c.len))',                  // object fields are series
    'f(float src, int len) =>\n    ta.ema(src, len)\nint n = close > open ? 10 : 20\nplot(f(close, n))',      // typed parameter inferred as simple
    'f(float src, int len) =>\n    int half = math.max(len, 2)\n    ta.ema(src, half)\nn = close > open ? 5 : 7\nplot(f(close, n))',
    'calcLen(int base) =>\n    base * 2\nlenInput = input.int(10)\nplot(ta.ema(close, calcLen(lenInput)))', // typed parameter makes the result series
    'w = close > open ? 1 : 3\nplot(close, linewidth = w)',                                    // "input" parameters
    'hline(50, color = close > open ? color.red : color.green)',
    's = close > open ? shape.circle : shape.cross\nplotshape(close > open, style = s)',
  ];
  for (const body of bad) {
    const c = checkPine(H + body + "\n");
    assert.ok(c.errors.some((e) => /was used but a "(simple|input) /.test(e.message)), body + " -> " + JSON.stringify(c.errors));
  }
  const good = [
    'lenInput = input.int(14, "Len")\nlen = timeframe.isintraday ? lenInput : lenInput * 2\nplot(ta.ema(close, len))',
    'int len = 10\nif timeframe.isintraday\n    len := 20\nplot(ta.ema(close, len))',
    'len = close > open ? 10 : 20\nplot(ta.sma(close, len))',                                  // series length is fine for ta.sma
    'f(float src, int len) =>\n    ta.ema(src, len)\nplot(f(close, 14))',
    'f(src, len) =>\n    ta.ema(src, len)\nn = close > open ? 10 : 20\nplot(f(close, n))',      // untyped parameters: accepted by TradingView
    'calcLen(simple int base) =>\n    base * 2\nlenInput = input.int(10)\nplot(ta.ema(close, calcLen(lenInput)))',
    'show = input.bool(true)\nplot(close, display = show ? display.all : display.none)',
    't = close > open ? 50 : 80\nplot(close, color = color.new(color.red, t))',
    'f = close > open ? 2.0 : 3.0\n[st, d] = ta.supertrend(f, 10)\nplot(st)',
    'p1 = plot(high)\np2 = plot(low)\nfill(p1, p2, high, low, color.new(color.green, 80), color.new(color.red, 80))',
  ];
  for (const body of good) {
    const c = checkPine(H + body + "\n");
    assert.equal(c.errors.length, 0, body + " -> " + JSON.stringify(c.errors));
  }
});
t("reserved words cannot name variables, parameters or fields", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  for (const body of ['range = high - low\nplot(range)', 'text = "abc"\nplot(close)', 'f(range) =>\n    range * 2\nplot(f(high - low))', 'type Z\n    float range\nvar z = Z.new(1.0)\nplot(z.range)']) {
    const c = checkPine(H + body + "\n");
    assert.ok(c.errors.some((e) => /cannot be used as a variable or function name/.test(e.message)), body + " -> " + JSON.stringify(c.errors));
  }
  // Named arguments called "text" stay valid, and "default" / "case" are ordinary identifiers.
  const ok = checkPine(H + 'string default = "a"\ncase = 1\nif barstate.islast\n    label.new(bar_index, high, text = default + str.tostring(case))\n');
  assert.equal(ok.errors.length, 0, JSON.stringify(ok.errors));
});
t("methods and fields that do not exist on drawing objects and collections are errors", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  const bad = [
    'var l = label.new(0, 0.0, "x")\nl.set_bgcolor(color.red)\nplot(close)',
    'var b = box.new(0, 1.0, 10, 0.0)\nb.set_color(color.red)\nplot(close)',
    'var line ln = na\nln.set_x(bar_index)\nplot(close)',
    'type Zone\n    box bx\nvar z = Zone.new(box.new(0, 1.0, 10, 0.0))\nz.bx.set_color(color.red)\nplot(close)',
    'var a = array.new<float>()\nplot(a.length)',
  ];
  for (const body of bad) {
    const c = checkPine(H + body + "\n");
    assert.ok(c.errors.some((e) => /Could not find method|has no field/.test(e.message)), body + " -> " + JSON.stringify(c.errors));
  }
  const good = checkPine(H + 'type Zone\n    box bx\nmethod paint(box this, color c) =>\n    this.set_bgcolor(c)\nvar z = Zone.new(box.new(0, 1.0, 10, 0.0))\nz.bx.set_right(bar_index)\nz.bx.paint(color.red)\nvar l = label.new(0, 0.0, "x")\nl.set_xy(bar_index, high)\nl.set_textcolor(color.white)\nvar t = table.new(position.top_right, 1, 1)\nt.cell(0, 0, "x")\nplot(close)\n');
  assert.equal(good.errors.length, 0, JSON.stringify(good.errors));
});
t("compiler gaps: fill kinds, tostring format, declaration limits, array indexing", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  const fill = checkPine(H + 'h = hline(100)\np = plot(close)\nfill(h, p, color = color.red)\n');
  assert.ok(fill.errors.some((e) => e.rule === "NX_FILL_KINDS"), JSON.stringify(fill.errors));
  const fillOk = checkPine(H + 'h1 = hline(70)\nh2 = hline(30)\nfill(h1, h2, color.new(color.blue, 90))\np1 = plot(high)\np2 = plot(low)\nfill(p1, p2, color.new(color.red, 90))\n');
  assert.equal(fillOk.errors.length, 0, JSON.stringify(fillOk.errors));
  const fmt = checkPine(H + 'if barstate.islast\n    label.new(bar_index, high, str.tostring(close, 2))\n');
  assert.ok(fmt.errors.some((e) => e.rule === "NX_TOSTRING_FORMAT"), JSON.stringify(fmt.errors));
  const fmtOk = checkPine(H + 'if barstate.islast\n    label.new(bar_index, high, str.tostring(close, "#.##") + str.tostring(math.round(close, 2)) + str.tostring(volume, format.volume))\n');
  assert.equal(fmtOk.errors.length, 0, JSON.stringify(fmtOk.errors));
  const lim = checkPine('//@version=6\nindicator("x", overlay = true, max_bars_back = 6000)\nplot(close)\n');
  assert.ok(lim.errors.some((e) => e.rule === "NX_DECLARATION_LIMIT"), JSON.stringify(lim.errors));
  const dup = checkPine(H + 'n = input.int(1, "N", title = "N")\nplot(n)\n');
  assert.ok(dup.errors.some((e) => /Two or more arguments/.test(e.message)), JSON.stringify(dup.errors));
  const fld = checkPine(H + 'type Zone\n    float top\nvar z = Zone.new(high)\nz.top = low\nplot(z.top)\n');
  assert.ok(fld.errors.some((e) => e.rule === "NX_FIELD_ASSIGN"), JSON.stringify(fld.errors));
  const fldOk = checkPine(H + 'type Zone\n    float top\nvar z = Zone.new(high)\nz.top := low\nbool same = z.top == low\nif barstate.islast\n    label.new(bar_index, high,\n         text = "x")\nplot(z.top)\n');
  assert.equal(fldOk.errors.length, 0, JSON.stringify(fldOk.errors));
  const semi = checkPine(H + 'x = 1;\nplot(x)\n');
  assert.ok(semi.errors.some((e) => e.rule === "NX_FOREIGN_SYNTAX" || e.line === 3), JSON.stringify(semi.errors));
  const brace = checkPine(H + 'if (close > open) {\n    x = 1\n}\nplot(close)\n');
  assert.ok(brace.errors.length > 0, JSON.stringify(brace.errors));
  const placeholders = checkPine(H + 'alertcondition(close > open, "Up", "Up on {{ticker}}; price {{close}}")\nplot(close)\n');
  assert.equal(placeholders.errors.length, 0, JSON.stringify(placeholders.errors));
  const idx = checkPine(H + 'var levels = array.new<float>()\nlevels.push(close)\nplot(levels[0])\n');
  assert.ok(idx.mustFix.some((e) => e.rule === "NX_ARRAY_INDEX") || idx.errors.length > 0, JSON.stringify(idx));
  const idxOk = checkPine(H + 'var levels = array.new<float>()\nlevels.push(close)\nfloat prev = close[1]\nplot(levels.get(0) + prev)\n');
  assert.ok(!idxOk.mustFix.some((e) => e.rule === "NX_ARRAY_INDEX") && idxOk.errors.length === 0, JSON.stringify(idxOk));
});
t("known checker false positives are dropped", () => {
  const H = '//@version=6\nindicator("x", overlay = true)\n';
  const c = checkPine(H + 'if barstate.islast\n    label.new(bar_index, high, "x", text_formatting = text.format_bold + text.format_italic)\n');
  assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
});
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
