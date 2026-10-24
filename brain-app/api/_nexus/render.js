// Chart picture of a dry run: our own tiny rasterizer (no libraries) that draws what a Pine script puts on the chart
// (candles, plots with their per-bar colors, fills, background tints, boxes, lines, labels with text, shapes and the
// table) into a PNG, so the design review can LOOK at the indicator the way the user will, instead of designing blind.
// Pure JS + CompressionStream (zlib) - runs in the Edge runtime and in Node 18+.
import { runPreview } from "./preview-run.js";
import { sampleCandles } from "../_brain/candles.js";

const GOLD = { tickerid: "OANDA:XAUUSD", ticker: "XAUUSD", mintick: 0.01, type: "cfd", timezone: "America/New_York", currency: "USD" };
const BG = [19, 23, 34];

export function parseCss(c) {
  const s = String(c || "").trim();
  let m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) { const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) / 255 : 1]; }
  return null;
}

// 3x5 pixel font (rows top to bottom). Lower case is drawn as upper case.
const F = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", ",": "000000000010100", "-": "000000111000000", "+": "000010111010000", "%": "101001010100101", "/": "001001010100100",
  ":": "000010000010000", "(": "010100100100010", ")": "010001001001010", "=": "000111000111000", "#": "101111101111101", "'": "010010000000000",
  "▲": "000010111111000", "▼": "000111111010000", "●": "000111111111000", "■": "000111111111000", "◆": "000010111010000", "•": "000000010000000",
  "○": "000111101111000", "□": "000111101111000", "◇": "000010101010000", "✕": "000101010101000", "★": "010111010101000", "|": "010010010010010",
};

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) this.px.set(BG, i * 3); }
  dot(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 3, a = c[3];
    if (a >= 0.999) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; return; }
    this.px[i] += (c[0] - this.px[i]) * a; this.px[i + 1] += (c[1] - this.px[i + 1]) * a; this.px[i + 2] += (c[2] - this.px[i + 2]) * a;
  }
  rect(x1, y1, x2, y2, c) {
    if (!c || c[3] <= 0.003) return;
    const ax = Math.max(0, Math.round(Math.min(x1, x2))), bx = Math.min(this.w - 1, Math.round(Math.max(x1, x2)));
    const ay = Math.max(0, Math.round(Math.min(y1, y2))), by = Math.min(this.h - 1, Math.round(Math.max(y1, y2)));
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.dot(x, y, c);
  }
  frame(x1, y1, x2, y2, c, dashed) {
    this.line(x1, y1, x2, y1, c, 1, dashed); this.line(x2, y1, x2, y2, c, 1, dashed);
    this.line(x2, y2, x1, y2, c, 1, dashed); this.line(x1, y2, x1, y1, c, 1, dashed);
  }
  line(x1, y1, x2, y2, c, width = 1, dashed = false) {
    if (!c || c[3] <= 0.003) return;
    const dx = x2 - x1, dy = y2 - y1, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    if (n > 6000) return;
    const r = Math.max(0, (width - 1) / 2);
    const seen = new Set();
    for (let k = 0; k <= n; k++) {
      if (dashed && Math.floor(k / 5) % 2) continue;
      const x = Math.round(x1 + (dx * k) / n), y = Math.round(y1 + (dy * k) / n);
      for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
        if (ox * ox + oy * oy > (r + 0.5) * (r + 0.5)) continue;
        const key = (y + oy) * 100000 + x + ox;
        if (seen.has(key)) continue; // never blend a pixel twice in one stroke
        seen.add(key); this.dot(x + ox, y + oy, c);
      }
    }
  }
  text(str, x, y, c, scale = 2) {
    let cx = x;
    for (const ch0 of String(str)) {
      const ch = ch0.toUpperCase();
      const g = F[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === "1") this.rect(cx + q * scale, y + r * scale, cx + q * scale + scale - 1, y + r * scale + scale - 1, c);
      cx += 4 * scale;
    }
    return cx - x;
  }
}
const textW = (s, scale = 2) => [...String(s)].length * 4 * scale;

async function deflate(bytes) {
  const cs = new CompressionStream("deflate");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}
let CRC = null;
function crc32(buf) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export async function encodePNG(cv) {
  const raw = new Uint8Array((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) { raw[y * (cv.w * 3 + 1)] = 0; raw.set(cv.px.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (cv.w * 3 + 1) + 1); }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, cv.w); dv.setUint32(4, cv.h); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0), png = new Uint8Array(total);
  let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Draws a preview result over its candles. Returns the Canvas.
 * view: the last `visible` bars plus a right margin (zones running to the right edge stay visible).
 */
export function drawChart(r, candles, { w = 1100, h = 620, visible = 150, margin = 18 } = {}) {
  const cv = new Canvas(w, h);
  const n = candles.length, from = Math.max(0, n - visible), slots = n - from + margin;
  const split = !r.overlay;
  const priceH = split ? Math.round(h * 0.62) : h, paneTop = priceH + 4;
  const X = (bar) => ((bar - from) + 0.5) * (w - 70) / slots;
  const cw = Math.max(1, ((w - 70) / slots) * 0.62);
  const inView = (b) => b >= from - 2 && b <= n + margin;
  // One column per bar with integer edges, so neighbouring fill / tint columns never overlap (no stripes).
  const colL = (b) => Math.round(X(b - 0.5)), colR = (b) => Math.round(X(b + 0.5)) - 1;
  // price scale from the candles in view (plots far away are clipped, not allowed to squash the candles)
  let lo = Infinity, hi = -Infinity;
  for (let b = from; b < n; b++) { lo = Math.min(lo, candles[b].l); hi = Math.max(hi, candles[b].h); }
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const Y = (p) => 8 + (hi - p) / (hi - lo) * (priceH - 16);
  // lower pane scale (oscillators)
  let plo = Infinity, phi = -Infinity;
  const paneOf = (fo) => (split && !fo ? "pane" : "price");
  if (split) {
    for (const p of r.plots) if (!p.hidden && !p.forceOverlay) for (let b = from; b < n; b++) { const v = p.values[b]; if (v != null && isFinite(v)) { plo = Math.min(plo, v); phi = Math.max(phi, v); } }
    for (const hl of r.hlines || []) if (!hl.hidden && isFinite(hl.price)) { plo = Math.min(plo, hl.price); phi = Math.max(phi, hl.price); }
    if (!isFinite(plo)) { plo = 0; phi = 1; }
    const pp = (phi - plo) * 0.08 || 1; plo -= pp; phi += pp;
  }
  const PY = (v) => paneTop + 6 + (phi - v) / (phi - plo) * (h - paneTop - 12);
  const yOf = (v, where) => (where === "pane" ? PY(v) : Y(v));
  const clipY = (y, where) => (where === "pane" ? Math.max(paneTop, Math.min(h - 1, y)) : Math.max(0, Math.min(priceH - 1, y)));

  // grid + pane separator + price axis
  for (let k = 1; k < 6; k++) cv.rect(0, Math.round(priceH * k / 6), w - 71, Math.round(priceH * k / 6), [42, 46, 57, 0.6]);
  cv.rect(w - 70, 0, w - 70, h, [42, 46, 57, 1]);
  for (let k = 0; k <= 4; k++) { const p = lo + (hi - lo) * k / 4; cv.text(p.toFixed(p > 100 ? 1 : 3), w - 64, Y(p) - 5, [120, 123, 134, 1], 2); }
  if (split) cv.rect(0, priceH + 1, w, priceH + 2, [42, 46, 57, 1]);

  // background tints
  for (let b = from; b < n; b++) { const c = parseCss(r.bg && r.bg[b]); if (c) cv.rect(colL(b), split ? paneTop : 0, colR(b), split ? h : priceH, c); }
  // fills
  const series = (ref) => (ref.kind === "hline" ? (b) => (r.hlines[ref.idx] ? r.hlines[ref.idx].price : null) : (b) => (r.plots[ref.idx] ? r.plots[ref.idx].values[b] : null));
  const whereOf = (ref) => (ref.kind === "hline" ? paneOf(false) : paneOf(r.plots[ref.idx] && r.plots[ref.idx].forceOverlay));
  for (const f of r.fills || []) {
    const A = series(f.a), B = series(f.b), where = whereOf(f.a);
    for (let b = from; b < n; b++) {
      const c = parseCss(f.colors[b]), va = A(b), vb = B(b);
      if (!c || va == null || vb == null) continue;
      cv.rect(colL(b), clipY(yOf(va, where), where), colR(b), clipY(yOf(vb, where), where), c);
    }
  }
  // boxes (zones)
  for (const bx of r.boxes || []) {
    if (!(inView(bx.left) || inView(bx.right) || (bx.left < from && bx.right > n))) continue;
    const where = paneOf(bx.fo);
    const x1 = Math.max(0, X(Math.max(bx.left, from - 1))), x2 = Math.min(w - 71, X(bx.extend === "extend.right" || bx.extend === "extend.both" ? n + margin : bx.right));
    const y1 = clipY(yOf(bx.top, where), where), y2 = clipY(yOf(bx.bottom, where), where);
    cv.rect(x1, y1, x2, y2, parseCss(bx.bg));
    cv.frame(x1, y1, x2, y2, parseCss(bx.border), /dash|dot/.test(bx.bs || ""));
    if (bx.text) { const tw = textW(bx.text, 1); cv.text(bx.text, bx.th === "text.align_left" ? x1 + 3 : bx.th === "text.align_center" ? (x1 + x2 - tw) / 2 : x2 - tw - 3, (y1 + y2) / 2 - 2, parseCss(bx.tc) || [200, 200, 200, 1], 1); }
  }
  // candles
  for (let b = from; b < n; b++) {
    const k = candles[b], up = k.c >= k.o;
    const c = parseCss(r.barcolor && r.barcolor[b]) || (up ? [8, 153, 129, 1] : [242, 54, 69, 1]);
    cv.rect(X(b), Y(k.h), X(b), Y(k.l), c);
    cv.rect(X(b) - cw / 2, Y(Math.max(k.o, k.c)), X(b) + cw / 2, Math.max(Y(Math.min(k.o, k.c)), Y(Math.max(k.o, k.c)) + 1), c);
  }
  // hlines
  for (const hl of r.hlines || []) if (!hl.hidden) { const where = paneOf(false); cv.line(0, yOf(hl.price, where), w - 71, yOf(hl.price, where), parseCss(hl.color), hl.width || 1, /dash|dot/.test(hl.style || "")); }
  // plots
  for (const p of r.plots) {
    if (p.hidden) continue;
    const where = paneOf(p.forceOverlay), style = p.style || "plot.style_line";
    for (let b = Math.max(from, 1); b < n; b++) {
      const v = p.values[b], v0 = p.values[b - 1], c = parseCss(p.colors[b]);
      if (v == null || !c) continue;
      if (/histogram|columns|area/.test(style)) { const base = /area/.test(style) ? (where === "pane" ? phi - (phi - plo) : lo) : p.histbase || 0; cv.rect(X(b) - cw / 2, clipY(yOf(v, where), where), X(b) + cw / 2, clipY(yOf(base, where), where), /area/.test(style) ? [c[0], c[1], c[2], c[3] * 0.25] : c); continue; }
      if (/circles|cross/.test(style)) { cv.rect(X(b) - 1, yOf(v, where) - 1, X(b) + 1, yOf(v, where) + 1, c); continue; }
      if (v0 == null || (/linebr/.test(style) && p.values[b - 1] == null)) continue;
      const y0 = yOf(v0, where), y1 = yOf(v, where);
      if ((y0 < 0 && y1 < 0) || (y0 > h && y1 > h)) continue;
      if (/step/.test(style)) { cv.line(X(b - 1), clipY(y0, where), X(b), clipY(y0, where), c, p.width || 1); cv.line(X(b), clipY(y0, where), X(b), clipY(y1, where), c, p.width || 1); }
      else cv.line(X(b - 1), clipY(y0, where), X(b), clipY(y1, where), c, p.width || 1);
    }
  }
  // lines
  for (const ln of r.lines || []) {
    if (!(inView(ln.x1) || inView(ln.x2))) continue;
    const where = paneOf(ln.fo);
    let x2 = ln.x2, y2 = ln.y2;
    if (/right|both/.test(ln.extend || "") && ln.x2 !== ln.x1) { const k = (ln.y2 - ln.y1) / (ln.x2 - ln.x1); x2 = n + margin; y2 = ln.y1 + k * (x2 - ln.x1); }
    cv.line(X(Math.max(ln.x1, from - 1)), clipY(yOf(ln.x1 < from - 1 && ln.x2 !== ln.x1 ? ln.y1 + (ln.y2 - ln.y1) * (from - 1 - ln.x1) / (ln.x2 - ln.x1) : ln.y1, where), where), X(x2), clipY(yOf(y2, where), where), parseCss(ln.color), ln.width || 1, /dash|dot/.test(ln.style || ""));
  }
  // shapes
  for (const s of r.shapes || []) {
    if (s.bar < from || s.bar >= n) continue;
    const k = candles[s.bar], c = parseCss(s.color) || [41, 98, 255, 1];
    const below = /belowbar|bottom/.test(s.location || "");
    const y = s.location === "location.absolute" && s.price != null ? Y(s.price) : below ? Y(k.l) + 10 : Y(k.h) - 10;
    if (/up/.test(s.style || "")) for (let q = 0; q < 6; q++) cv.rect(X(s.bar) - q, y - 3 + q, X(s.bar) + q, y - 3 + q, c);
    else if (/down/.test(s.style || "")) for (let q = 0; q < 6; q++) cv.rect(X(s.bar) - q, y + 3 - q, X(s.bar) + q, y + 3 - q, c);
    else cv.rect(X(s.bar) - 3, y - 3, X(s.bar) + 3, y + 3, c);
    if (s.text) cv.text(s.text, X(s.bar) - textW(s.text, 1) / 2, below ? y + 6 : y - 12, parseCss(s.textcolor) || c, 1);
  }
  // labels
  for (const lb of r.labels || []) {
    if (!inView(lb.x)) continue;
    const where = paneOf(lb.fo);
    const k = candles[Math.min(n - 1, Math.max(0, lb.x))];
    const py = lb.yloc === "yloc.abovebar" ? Y(k.h) - 14 : lb.yloc === "yloc.belowbar" ? Y(k.l) + 14 : yOf(lb.y, where);
    const big = /normal|large|huge/.test(lb.size || "size.normal"), sc = big ? 2 : 1;
    const txt = String(lb.text || "").split("\n")[0].slice(0, 28);
    const tw = Math.max(txt ? textW(txt, sc) : 6, 6), th = 5 * sc + 6;
    const bg = parseCss(lb.color), tc = parseCss(lb.textcolor) || [255, 255, 255, 1];
    let x1 = X(lb.x) - tw / 2 - 3, y1 = py - th - 4;
    const st = lb.style || "label.style_label_down";
    if (/style_label_up/.test(st)) y1 = py + 4;
    else if (/style_label_left/.test(st)) { x1 = X(lb.x) + 4; y1 = py - th / 2; }
    else if (/style_label_right/.test(st)) { x1 = X(lb.x) - tw - 10; y1 = py - th / 2; }
    else if (/style_none|style_text_outline/.test(st)) y1 = py - th / 2;
    if (bg && !/style_none/.test(st)) cv.rect(x1, y1, x1 + tw + 6, y1 + th, bg);
    if (txt) cv.text(txt, x1 + 3, y1 + 3, tc, sc);
  }
  // table (the first one), at its corner
  const t = (r.tables || [])[0];
  if (t) {
    const cols = t.columns || 1, rows = t.rows || 1, colW = new Array(cols).fill(14), rowH = 13;
    for (const key in t.cells) { const [c] = key.split(":").map(Number); colW[c] = Math.max(colW[c] || 14, textW(String(t.cells[key].text || "").slice(0, 26), 1) + 10); }
    const tw2 = colW.reduce((a, b) => a + b, 0), th2 = rows * rowH;
    const pos = t.position || "position.top_right";
    const x0 = /right/.test(pos) ? w - 76 - tw2 : /center/.test(pos) && !/middle/.test(pos) ? (w - tw2) / 2 : 6;
    const y0 = /bottom/.test(pos) ? h - th2 - 6 : /middle/.test(pos) ? (h - th2) / 2 : 6;
    for (const key in t.cells) {
      const [c, rr] = key.split(":").map(Number), cell = t.cells[key];
      const cx = x0 + colW.slice(0, c).reduce((a, b) => a + b, 0), cy = y0 + rr * rowH;
      cv.rect(cx, cy, cx + colW[c] - 1, cy + rowH - 1, parseCss(cell.bgcolor) || parseCss(t.bgcolor));
      if (cell.text) cv.text(String(cell.text).slice(0, 26), cx + 5, cy + 4, parseCss(cell.text_color) || [210, 212, 220, 1], 1);
    }
    const fc = parseCss(t.frame_color);
    if (fc && t.frame_width) cv.frame(x0 - 1, y0 - 1, x0 + tw2, y0 + th2, fc);
  }
  return cv;
}

// Runs the script on sample gold candles and returns { png (base64), w, h } or null.
export async function chartPicture(code, { tfSec = 900, bars = 600 } = {}) {
  try {
    const candles = sampleCandles(tfSec, bars, 2400);
    const r = runPreview(String(code || ""), candles, { tfSec, symbol: GOLD, maxMs: 2500 });
    if (!r || !r.ok) return null;
    const cv = drawChart(r, candles);
    const png = await encodePNG(cv);
    return { png: toBase64(png), w: cv.w, h: cv.h, bytes: png.length };
  } catch (e) { return null; }
}
