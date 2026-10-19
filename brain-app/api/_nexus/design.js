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
export function needsPolish(review) { return review.score < 80 || review.findings.some((f) => f.weight >= 14); }

export function describeDesign(review, max = 6) {
  return review.findings.slice(0, max).map((f) => `- [DESIGN ${f.rule.replace("NX_DESIGN_", "")}] ${f.message}`).join("\n");
}
