// Nexus lessons: what the engine learned from real use.
//
// Each lesson is one short, concrete rule that the knowledge pack (knowledge.js) did not state clearly enough:
// errors users pasted from TradingView, scripts the checker could not verify, 👎 feedback, and benchmark failures.
// The daily improvement run (nexus-engine/DAILY.md) adds, sharpens or retires lessons here; the engine appends
// the active ones to the user turn of every build / fix request (never to the system prompt, so the cached prefix
// stays identical across requests).
//
// Keep each lesson under 260 characters, in English, about Pine v6 or about the chart. Retire a lesson (remove
// it) once the rule has been merged into knowledge.js or a lint rule; keep the id unique and never reuse it.

export const LESSONS = [
  { id: "L001", added: "2026-10-15", source: "seed", text: "box.new(left, top, right, bottom): left and right are bar indexes (int), top and bottom are prices (float), in that order. It is not (x1, y1, x2, y2); passing a price where an index goes is a compile error." },
  { id: "L002", added: "2026-10-15", source: "seed", text: "ta.atr(length) takes only the length (it uses the chart's high/low/close itself); ta.tr(true) is the raw true range. ta.stoch(source, high, low, length) has the source first." },
  { id: "L003", added: "2026-10-15", source: "seed", text: "plot() needs a number: a bool cannot be plotted (compile error). Use plotshape / plotchar for events, or plot(cond ? 1 : 0) for a state line in a separate pane." },
  { id: "L005", added: "2026-10-15", source: "seed", text: "Never split a boolean expression or a comparison over several lines (\"end of line without line continuation\" error). Assign the parts to named bools first, then combine them on one line." },
  { id: "L006", added: "2026-10-15", source: "seed", text: "User-defined type constructors: Zone.new(top = high, bottom = low, bx = b) with named fields; positional values are matched to the fields in declaration order and silently land in the wrong field." },
  { id: "L007", added: "2026-10-15", source: "seed", text: "table.new(position, columns, rows) takes columns before rows; table.cell(tbl, column, row, text) too, and text must be a string. A table with 2 columns and 5 rows is table.new(position.top_right, 2, 5)." },
  { id: "L008", added: "2026-10-15", source: "seed", text: "Anchored VWAP with bands is a tuple: [vwapLine, upperBand, lowerBand] = ta.vwap(hlc3, anchorCondition, 2); the simple form ta.vwap(hlc3) returns one series. Call it at the global scope." },
  { id: "L009", added: "2026-10-15", source: "seed", text: "The length given to ta.ema / ta.rma / ta.rsi / ta.atr comes from an input (input.int with minval = 1) or a constant; never from a ternary on a series or from math on close / volume." },
  { id: "L010", added: "2026-10-15", source: "seed", text: "A request made from a chart picture means: detect automatically from pivots and draw the same kind of things that are in the picture (zones, lines, labels) with sensible defaults; do not ask the user to pick candles." },
  { id: "L011", added: "2026-10-15", source: "seed", text: "request.security with a tuple: [h, l] = request.security(syminfo.tickerid, \"D\", [high[1], low[1]], lookahead = barmerge.lookahead_on). Never call request.security inside a function that is called conditionally or in a loop." },
  { id: "L012", added: "2026-10-15", source: "seed", text: "ta.crossover / ta.crossunder / ta.pivothigh / ta.pivotlow must be assigned to a variable at global scope before being used inside if, switch, a ternary or after and/or; otherwise results are wrong or the compiler warns." },
  { id: "L013", added: "2026-10-15", source: "seed", text: "Every alertcondition() needs a constant title and message; put {{ticker}} and {{interval}} in the message. For a message with live prices use alert(str.format(...), alert.freq_once_per_bar_close) inside an if." },
  { id: "L014", added: "2026-10-15", source: "seed", text: "Deleting drawings from an array: loop backwards (for i = arr.size() - 1 to 0) and guard arr.size() > 0 first; call .delete() on the drawing before arr.remove(i). Cap arrays with a max input and shift() + delete the oldest." },
  { id: "L015", added: "2026-10-15", source: "seed", text: "Strategy exits: strategy.exit(\"TP/SL\", from_entry = \"Long\", stop = sl, limit = tp) with prices, or loss/profit in ticks; compute sl/tp once at entry and keep them in var floats so they do not move every bar." },
  { id: "L016", added: "2026-10-16", source: "owner", text: "Images labelled VIDEO are frames of one recording, in order. Read them together: which zones, lines, labels and signals appear, when, and how they change (touched, broken, recolored); build an indicator that reproduces that automatically." },
  { id: "L017", added: "2026-10-25", source: "owner", text: "A function returns its LAST statement. If that is an if / else chain (also inside the last for), every branch must end with the same type - arr.remove(i) (element) vs n += 1 (int) fails with CE10235. End such helpers with a plain line: true." },
  { id: "L018", added: "2026-10-28", source: "research", text: "Any VWAP / volume-weighted math: volume is na or 0 on many forex / CFD symbols, so weight = volume > 0 ? volume : 1 (label it TWAP) and guard sumV > 0 before sumPV / sumV; never let one na bar turn the whole running sum into na." },
];

// The block appended to the user turn. Empty when there are no lessons.
export function lessonsBlock() {
  if (!LESSONS.length) return "";
  return "LESSONS FROM PAST MISTAKES (apply all of them; they override your habits):\n" + LESSONS.map((l) => "- " + l.text.trim()).join("\n");
}

// Changes whenever a lesson is added, edited or removed (part of the engine's `rev`).
export const LESSONS_REV = LESSONS.reduce((a, l) => (a * 31 + l.text.length + l.id.length) % 1000003, LESSONS.length);
