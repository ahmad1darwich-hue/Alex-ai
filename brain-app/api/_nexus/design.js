// Design review: scores how premium a Pine script will LOOK, the way the compile checker scores whether it works.
// Static rules read the code (theme, default colors, bare plots, triangle markers, glow, fills, opaque zones,
// dashboard); a dry run on sample candles (our own preview runner) measures clutter on the chart.
// Used by the engine for one "design polish" round after the script compiles, and reported to the UI.
import { runPreview } from "./preview-run.js";
import { sampleCandles } from "../_brain/candles.js";

const GOLD = { tickerid: "OANDA:XAUUSD", ticker: "XAUUSD", mintick: 0.01, type: "cfd", timezone: "America/New_York", currency: "USD" };
let SAMPLE = null;

// Splits top-level calls like plot(...) into their argument text (handles nested parentheses and strings).
function calls(code, name) {
  const out = [];
  const re = new RegExp("(^|[^\\w.])" + name.replace(".", "\\.") + "\\s*\\(", "g");
  let m;
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length, depth = 1, str = null;
    const start = i;
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i];
      if (str) { if (ch === str && code[i - 1] !== "\\") str = null; continue; }
      if (ch === '"' || ch === "'") str = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    out.push({ args: code.slice(start, i - 1), line: code.slice(0, m.index).split("\n").length + (m[1] === "\n" ? 1 : 0) });
  }
  return out;
}

const stripComments = (code) => code.split("\n").map((l) => { let s = null; for (let i = 0; i < l.length; i++) { const c = l[i]; if (s) { if (c === s) s = null; continue; } if (c === '"' || c === "'") s = c; else if (c === "/" && l[i + 1] === "/") return l.slice(0, i); } return l; }).join("\n");

/**
 * Returns { score 0-100, findings: [{ rule, weight, message }], stats }.
 * A finding's message is written for the model (what to change, concretely).
 */
export function designReview(input, { preview = true } = {}) {
  const code = stripComments(String(input || ""));
  const findings = [];
  const add = (rule, weight, message) => findings.push({ rule, weight, message });
  const overlay = !/indicator\s*\([^)]*overlay\s*=\s*false/.test(code) && !/strategy\s*\([^)]*overlay\s*=\s*false/.test(code);

  const plots = calls(code, "plot").filter((p) => !/display\s*=\s*display\.none/.test(p.args));
  const visiblePlots = plots.filter((p) => !/color\s*=\s*na\b/.test(p.args));
  const bare = visiblePlots.filter((p) => !/\bcolor\s*=/.test(p.args) && !/^[^,]+,\s*[^,=]+,\s*[^,=]+/.test(p.args));
  const shapes = calls(code, "plotshape").concat(calls(code, "plotchar"));
  const boxes = calls(code, "box.new");
  const labels = calls(code, "label.new");
  const fills = calls(code, "fill");
  const hasTheme = /input\.string\([^)]*"(Theme|Style|Color theme|Palette)"[^)]*options\s*=/.test(code);
  const hasTable = /table\.new\s*\(/.test(code);
  const hasSignals = shapes.length > 0 || labels.some((l) => /BUY|SELL|LONG|SHORT|▲|▼/.test(l.args)) || /alertcondition\s*\(|alert\s*\(/.test(code);
  const rawColors = (code.match(/\bcolor\.(blue|red|green|yellow|orange|purple|lime|aqua|fuchsia|navy|maroon|olive|teal)\b/g) || []).length;

  if (!hasTheme) add("NX_DESIGN_THEME", 18, 'No Theme input. Add input.string("Neon", "Theme", options = ["Neon", "Classic", "Minimal", "Mono"], group = "Style") and a pick() function that returns coherent bull / bear / accent / neutral / text colors (DESIGN DIRECTOR rule 1); use those colors everywhere.');
  if (bare.length) add("NX_DESIGN_BARE_PLOT", 14, `${bare.length} plot(s) without a color (default blue line), first at line ${bare[0].line}. Give every visible plot a theme color, linewidth 2 for the main line and 1 for secondary lines.`);
  if (rawColors >= 3 && !hasTheme) add("NX_DESIGN_RAW_COLORS", 8, `Built-in color constants (color.red / color.green / color.blue ...) used ${rawColors} times. Replace them with the theme palette (hex colors from DESIGN DIRECTOR rule 1) and color.new(c, transparency) for fills.`);
  const triangles = shapes.filter((s) => /shape\.(triangleup|triangledown|arrowup|arrowdown|circle|cross|xcross)/.test(s.args));
  if (triangles.length) add("NX_DESIGN_TRIANGLES", 12, `Signals drawn as plain plotshape markers (line ${triangles[0].line}). Draw signals as designed labels instead: label.new on the confirmed signal bar, style label.style_label_up / label_down, text "▲ BUY" / "▼ SELL", theme color background, white text, size.small (DESIGN DIRECTOR rule 3). Do not keep both.`);
  const mainLines = visiblePlots.filter((p) => /linewidth\s*=\s*[2-4]\b/.test(p.args) || !/linewidth/.test(p.args));
  const glow = plots.some((p) => /linewidth\s*=\s*([5-9]|1\d)\b/.test(p.args));
  if (overlay && mainLines.length && !glow && !boxes.length) add("NX_DESIGN_GLOW", 6, "Main line has no glow. Add a soft copy behind it: the same series, linewidth 7, transparency 85, display = display.pane (DESIGN DIRECTOR rule 2).");
  if (visiblePlots.length >= 2 && !fills.length && !boxes.length) add("NX_DESIGN_FILL", 6, "Two or more lines but no fill. Fill between the fast and slow line (or band edges) with color.new(theme color, 85-92), colored by direction or with color.from_gradient by strength.");
  const opaque = boxes.filter((b) => /bgcolor\s*=\s*(color\.\w+|#[0-9A-Fa-f]{6})\s*[,)]/.test(b.args + ")"));
  if (opaque.length) add("NX_DESIGN_OPAQUE_ZONES", 10, `Zone boxes with an opaque fill (line ${opaque[0].line}). Use bgcolor = color.new(c, 80-90), border color.new(c, 40-60), border_width 1, small right-aligned text (text_size = size.tiny), and fade touched zones (DESIGN DIRECTOR rule 4).`);
  if (/(bgcolor|color)\s*=\s*(color\.black|color\.white|#000000|#FFFFFF)\b/i.test(code.replace(/text_?color\s*=\s*\S+/gi, ""))) add("NX_DESIGN_PURE_BW", 4, "Pure black / white fills look harsh on one of the chart themes. Use #131722-style dark navy with transparency, or the theme's neutral color.");
  if (hasSignals && !hasTable && code.split("\n").length > 40) add("NX_DESIGN_NO_DASH", 10, 'The script has a state to read (signals / trend / levels) but no dashboard. Add a compact table (var table, filled on barstate.islast, position input, default top right): header "NEXUS • <tool>" in the accent color, label / value rows with bull / bear colored values, text_size size.small, a track-record row (hits / fails, %) for signal tools (rules 6 and 6b).');
  if (!overlay && /hline\s*\(/.test(code) && !fills.length) add("NX_DESIGN_OSC_ZONES", 6, "Oscillator levels without zones. Add a faint OB / OS band and a heat fill between the line and the level when it is stretched (DESIGN DIRECTOR rule 8).");

  // Premium finish (2026-10-24): what separates a "works" chart from a vendor-grade one.
  const gradient = /color\.from_gradient\s*\(/.test(code);
  if ((visiblePlots.length || fills.length || boxes.length) && !gradient) add("NX_DESIGN_NO_GRADIENT", 5, "Nothing changes color with strength. Use color.from_gradient(strength, lo, hi, faintColor, fullColor) for the main line / fill / candles / zone fills (strength = ATR distance, ER, RSI, volume or zone score) so strong moves and strong zones look stronger (DESIGN DIRECTOR rule 13).");
  if (boxes.length && !/\.set_bgcolor\s*\(|box\.set_bgcolor\s*\(|\.set_border_style\s*\(|box\.set_border_style\s*\(|\.delete\s*\(|box\.delete\s*\(/.test(code)) add("NX_DESIGN_STATIC_ZONES", 6, "Zones never change once drawn. Give them a life cycle you can SEE: fresh = confident fill, touched = faded fill + dashed border (set_bgcolor / set_border_style), broken = deleted or turned into a faint breaker - keep only live information (rule 4, ZONE ENGINE RULES).");
  const plainLabels = labels.filter((l) => !/style\s*=/.test(l.args) || !/size\s*=/.test(l.args));
  if (labels.length && plainLabels.length * 2 > labels.length) add("NX_DESIGN_PLAIN_LABELS", 5, `label.new without a style and size (line ${plainLabels[0].line}) draws TradingView's big default bubble. Set style (label.style_label_up / down for signals, label.style_label_left for right-edge price tags, label.style_none for zone text), size.small or size.tiny, theme background or color.new(c, 100) with theme text, and put details in tooltip = instead of long text.`);
  if (hasTable && (!/frame_color\s*=/.test(calls(code, "table.new").map((x) => x.args).join(" ")) || !/\.cell\s*\([^)]*bgcolor\s*=|table\.cell\s*\([^)]*bgcolor\s*=/.test(code))) add("NX_DESIGN_PLAIN_TABLE", 5, 'The dashboard looks like a plain grid. Give it a frame (frame_color = accent at 40, frame_width 1, border_color neutral at 85), a header row "NEXUS • <tool>" on an accent background with white text, dark cells color.new(#131722, 10), monospace values colored bull / bear (rule 6).');
  const widths = visiblePlots.map((p) => (/linewidth\s*=\s*(\d+)/.exec(p.args) || [0, "1"])[1]);
  if (visiblePlots.length >= 3 && new Set(widths).size === 1) add("NX_DESIGN_NO_HIERARCHY", 4, `All ${visiblePlots.length} lines have the same weight, so nothing leads the eye. Make ONE hero line (linewidth 2 + glow), secondary lines linewidth 1 and 30-50 transparency (rule 13).`);

  const stats = { plots: visiblePlots.length, labels: 0, shapes: 0, boxes: 0, lines: 0, bars: 0 };
  if (preview) {
    try {
      SAMPLE = SAMPLE || sampleCandles(900, 600, 2400);
      const r = runPreview(String(input || ""), SAMPLE, { tfSec: 900, symbol: GOLD, maxMs: 1500 });
      if (r && r.ok) {
        const markers = r.labels.length + r.shapes.length;
        Object.assign(stats, { labels: r.labels.length, shapes: r.shapes.length, boxes: r.boxes.length, lines: r.lines.length, bars: SAMPLE.length, markers });
        const per1000 = (markers * 1000) / SAMPLE.length;
        if (per1000 > 120) add("NX_DESIGN_CLUTTER", 16, `Chart clutter: about ${Math.round(per1000)} markers per 1000 bars on a 15m gold sample. Add a filter, a cooldown in bars or "signal only on a change of direction" so a clean chart shows roughly 10-60 per 1000 bars.`);
        if (r.boxes.length > 40) add("NX_DESIGN_TOO_MANY_ZONES", 10, `${r.boxes.length} boxes stay on the chart at the end of the sample. Keep only the newest N per side (input, default 4-6), delete broken / mitigated ones.`);
        if (r.lines.length > 60) add("NX_DESIGN_TOO_MANY_LINES", 8, `${r.lines.length} lines stay on the chart. Stop or delete levels once taken and keep the newest N.`);
        // Color budget: count the distinct hues the chart actually shows (plots, labels, boxes, lines).
        const hues = new Set();
        const hueOf = (c) => { const p = parseColor(c); if (!p || p.a < 0.08) return; const mx = Math.max(p.r, p.g, p.b), mn = Math.min(p.r, p.g, p.b); if (mx - mn < 30) return; let h; if (mx === p.r) h = ((p.g - p.b) / (mx - mn) + 6) % 6; else if (mx === p.g) h = (p.b - p.r) / (mx - mn) + 2; else h = (p.r - p.g) / (mx - mn) + 4; hues.add(Math.round(h * 2) % 12); };
        for (const pl of (r.plots || []).filter((x) => !x.hidden)) for (const c of new Set((pl.colors || []).slice(-300))) hueOf(c);
        for (const d of [...(r.labels || []), ...(r.boxes || []), ...(r.lines || [])]) hueOf(d.color || d.bgcolor);
        stats.hues = hues.size;
        if (hues.size > 6) add("NX_DESIGN_RAINBOW", 6, `About ${hues.size} different hues on the chart - it reads as a rainbow. Keep a budget: bull + bear + one accent + neutral grays; express strength with transparency / gradients of those hues, not new colors (rule 13).`);
        const texts = r.labels.map((l) => l.text).filter(Boolean);
        let repeats = 0;
        for (let i = 1; i < texts.length; i++) if (texts[i] === texts[i - 1] && /BUY|SELL|LONG|SHORT/.test(texts[i])) repeats++;
        if (texts.length > 6 && repeats / texts.length > 0.4) add("NX_DESIGN_REPEATS", 10, "The same signal prints several times in a row. Make signals alternate (remember the last direction) or require a reset before the next one.");
      }
    } catch (e) { /* the design review never blocks a script */ }
  }
  const lost = findings.reduce((a, f) => a + f.weight, 0);
  findings.sort((a, b) => b.weight - a.weight);
  return { score: Math.max(0, 100 - lost), findings, stats };
}

// A polish round is worth a model call when the look is clearly below the bar.
export function needsPolish(review) { return review.score < 85 || review.findings.some((f) => f.weight >= 14); }

export function describeDesign(review, max = 6) {
  return review.findings.slice(0, max).map((f) => `- [DESIGN ${f.rule.replace("NX_DESIGN_", "")}] ${f.message}`).join("\n");
}

// ---------- chart dry run summary: what the user will actually SEE ----------
// The model writes Pine blind. This turns a dry run on sample candles into a short description of the chart (lines,
// colors, labels, zones, table, tints), so a review round can compare it with what the user asked for.
function parseColor(c) {
  const s = String(c || "").trim();
  let m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) { const v = parseInt(m[1], 16); return { r: v >> 16, g: (v >> 8) & 255, b: v & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  return null;
}
// A plain color word (so "make it gold / purple" can be checked) + hex + how solid it is.
export function colorName(c) {
  const p = parseColor(c);
  if (!p) return String(c || "none");
  const { r, g, b, a } = p;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = mx - mn;
  let name;
  if (d < 25) name = l > 0.85 ? "white" : l < 0.15 ? "black" : "gray";
  else {
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    name = h < 15 || h >= 340 ? "red" : h < 40 ? "orange" : h < 55 ? "gold" : h < 70 ? "yellow" : h < 160 ? "green" : h < 190 ? "teal" : h < 250 ? "blue" : h < 290 ? "purple" : "pink";
  }
  const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  const solid = Math.round(a * 100);
  if (solid === 0) return "transparent";
  return `${name} ${hex}${solid < 100 ? " (" + solid + "% opaque)" : ""}`;
}
const top = (arr, n = 4) => { const m = new Map(); for (const x of arr) if (x) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n); };
const list = (pairs, fmt = (k) => k) => pairs.map(([k, v]) => fmt(k) + (v > 1 ? " x" + v : "")).join(", ");
const short = (s) => String(s || "").replace(/\s+/g, " ").slice(0, 40);

export function chartSummary(input, { tfSec = 900, bars = 600 } = {}) {
  let r;
  try { r = runPreview(String(input || ""), sampleCandles(tfSec, bars, 2400), { tfSec, symbol: GOLD, maxMs: 2500 }); }
  catch (e) { return "DRY RUN: could not run (" + String(e && e.message || e).slice(0, 120) + ")."; }
  if (!r || !r.ok) return "DRY RUN: the script stopped with an error on sample bars: " + String(r && r.error || "unknown").slice(0, 160);
  const out = [`DRY RUN on ${bars} sample gold candles (15m) - this is what the user will SEE (${r.overlay ? "on the price chart" : "in its own pane under the chart"}):`];
  const plots = r.plots.filter((p) => !p.hidden && Array.isArray(p.values) && p.values.some((v) => v != null));
  if (plots.length) out.push("- Lines / plots: " + plots.slice(0, 10).map((p) => `"${short(p.title || "plot")}" width ${p.width || 1}${/line/.test(p.style || "line") ? "" : " " + String(p.style).replace("plot.style_", "")}, colors ${list(top((p.colors || []).filter(Boolean), 3), colorName)}`).join("; ") + (plots.length > 10 ? `; +${plots.length - 10} more` : ""));
  else out.push("- Lines / plots: none visible");
  if (r.fills && r.fills.length) out.push(`- Fills between lines: ${r.fills.length} (colors ${list(top(r.fills.flatMap((f) => (f.colors || []).filter(Boolean)), 3), colorName)})`);
  if (r.hlines && r.hlines.length) out.push(`- Horizontal levels: ${r.hlines.length}`);
  if (r.shapes && r.shapes.length) out.push(`- plotshape markers: ${r.shapes.length} (${list(top(r.shapes.map((s) => (s.style || s.shape || "shape") + (s.text ? ' "' + short(s.text) + '"' : "")), 3))})`);
  if (r.labels.length) out.push(`- Labels on the chart at the end: ${r.labels.length} - texts ${list(top(r.labels.map((l) => '"' + short(l.text) + '"'), 6))}; backgrounds ${list(top(r.labels.map((l) => l.color), 3), colorName)}; sizes ${list(top(r.labels.map((l) => String(l.size || "").replace("size.", "")), 2))}`);
  else out.push("- Labels: none");
  if (r.boxes.length) out.push(`- Boxes / zones at the end: ${r.boxes.length} - fills ${list(top(r.boxes.map((b) => b.bg), 3), colorName)}; borders ${list(top(r.boxes.map((b) => b.border), 2), colorName)}${r.boxes.some((b) => b.text) ? "; texts " + list(top(r.boxes.map((b) => b.text && '"' + short(b.text) + '"'), 4)) : ""}`);
  if (r.lines.length) out.push(`- Drawn lines at the end: ${r.lines.length} - colors ${list(top(r.lines.map((l) => l.color), 3), colorName)}; styles ${list(top(r.lines.map((l) => String(l.style || "").replace("line.style_", "")), 2))}`);
  const bg = (r.bg || []).filter(Boolean);
  if (bg.length) out.push(`- Background tint on ${bg.length} of ${bars} bars (${list(top(bg, 2), colorName)})`);
  const bc = (r.barcolor || []).filter(Boolean);
  if (bc.length) out.push(`- Candles recolored on ${bc.length} of ${bars} bars (${list(top(bc, 3), colorName)})`);
  for (const tb of (r.tables || []).slice(0, 2)) {
    const cells = Object.entries(tb.cells || {}).sort((a, b) => { const [ca, ra] = a[0].split(":").map(Number), [cb, rb] = b[0].split(":").map(Number); return ra - rb || ca - cb; });
    out.push(`- Table at ${String(tb.position || "").replace("position.", "")}, ${tb.columns} x ${tb.rows}: ` + cells.slice(0, 24).map(([, c]) => short(c.text)).filter(Boolean).join(" | ") + (cells.length > 24 ? " | ..." : ""));
  }
  if (r.trades && r.trades.length) out.push(`- Strategy trades drawn: ${r.trades.length}`);
  if (r.unsupported && r.unsupported.length) out.push("- (not simulated in the dry run: " + r.unsupported.slice(0, 5).join(", ") + ")");
  return out.join("\n");
}
