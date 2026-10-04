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
console.log(process.exitCode ? "SOME TESTS FAILED" : `ok - ${n} checks passed`);
