// Zone research harness: generators x entry models x filters, expectancy in R, in-sample (first 60%) vs out-of-sample.
import fs from "node:fs";
// Candle files: JSON {bars: {t, o, h, l, c, v}} named MARKET_TFSECONDS.json (e.g. XAU_900.json), from the TradingView
// connector (get-ohlcv, format columns, 5000 bars). Not committed. ZONE_LAB_DATA=dir node zr.mjs configs.json
const DIR = process.env.ZONE_LAB_DATA || "./data";
const data = fs.readdirSync(DIR).map((f) => {
  const b = JSON.parse(fs.readFileSync(DIR + "/" + f, "utf8")).bars;
  return { name: f.replace(".json", ""), o: b.o, h: b.h, l: b.l, c: b.c, n: b.t.length };
});
const rma = (x, n) => { const r = []; let s = 0; for (let i = 0; i < x.length; i++) { if (i < n) { s += x[i]; r.push(i === n - 1 ? s / n : NaN); } else r.push((r[i - 1] * (n - 1) + x[i]) / n); } return r; };
const ema = (x, n) => { const k = 2 / (n + 1), r = [x[0]]; for (let i = 1; i < x.length; i++) r.push(x[i] * k + r[i - 1] * (1 - k)); return r; };
for (const d of data) {
  const tr = d.c.map((_, i) => (i ? Math.max(d.h[i] - d.l[i], Math.abs(d.h[i] - d.c[i - 1]), Math.abs(d.l[i] - d.c[i - 1])) : d.h[i] - d.l[i]));
  d.atr = rma(tr, 14); d.e50 = ema(d.c, 50); d.e200 = ema(d.c, 200); d.e800 = ema(d.c, 800);
  // confirmed pivots (len 5): ph[i] = price of pivot confirmed at bar i
  const L = 5; d.phAt = new Array(d.n).fill(NaN); d.plAt = new Array(d.n).fill(NaN); d.phIdx = []; d.plIdx = [];
  for (let i = 2 * L; i < d.n; i++) { const p = i - L; let isH = true, isL = true;
    for (let k = p - L; k <= p + L; k++) { if (k === p) continue; if (d.h[k] >= d.h[p]) isH = false; if (d.l[k] <= d.l[p]) isL = false; }
    if (isH) { d.phAt[i] = d.h[p]; d.phIdx[i] = p; } if (isL) { d.plAt[i] = d.l[p]; d.plIdx[i] = p; } }
}
const body = (d, i) => Math.abs(d.c[i] - d.o[i]);

// ---------- generators: return zones {born, dir, top, bot, src, imp} ----------
function genBase(d, P) {
  const Z = [];
  for (let i = 20; i < d.n; i++) {
    const a = d.atr[i]; if (!(a > 0)) continue;
    const b = body(d, i), up = d.c[i] > d.o[i] && b >= P.imp * a && b >= 0.6 * (d.h[i] - d.l[i]), dn = d.c[i] < d.o[i] && b >= P.imp * a && b >= 0.6 * (d.h[i] - d.l[i]);
    if (!up && !dn) continue;
    let n = 0, top = NaN, bot = NaN;
    for (let k = 1; k <= 3; k++) { const j = i - k; const small = d.h[j] - d.l[j] <= 1.2 * a && body(d, j) <= 0.6 * (d.h[j] - d.l[j]); if (!small) break; n++;
      const bt = Math.max(d.o[j], d.c[j]), bb = Math.min(d.o[j], d.c[j]);
      if (up) { top = isNaN(top) ? bt : Math.max(top, bt); bot = isNaN(bot) ? d.l[j] : Math.min(bot, d.l[j]); } else { top = isNaN(top) ? d.h[j] : Math.max(top, d.h[j]); bot = isNaN(bot) ? bb : Math.min(bot, bb); } }
    if (!n || !(top > bot)) continue;
    const dep = up ? d.c[i] - top : bot - d.c[i]; if (dep < 0.5 * a) continue;
    Z.push({ born: i, dir: up ? 1 : -1, top, bot, imp: b / a, gap: up ? d.l[i] > d.h[i - 2] : d.h[i] < d.l[i - 2] });
  }
  return Z;
}
// Order block at the origin of a leg that breaks structure (BOS) with displacement.
function genOB(d, P) {
  const Z = []; let lastH = NaN, lastHi = -1, lastL = NaN, lastLi = -1, usedH = -1, usedL = -1;
  for (let i = 20; i < d.n; i++) {
    if (!isNaN(d.phAt[i])) { lastH = d.phAt[i]; lastHi = d.phIdx[i]; }
    if (!isNaN(d.plAt[i])) { lastL = d.plAt[i]; lastLi = d.plIdx[i]; }
    const a = d.atr[i]; if (!(a > 0)) continue;
    // bullish BOS: close above last swing high (first time for that swing)
    if (lastHi >= 0 && lastHi !== usedH && d.c[i] > lastH && d.c[i - 1] <= lastH) {
      usedH = lastHi;
      // leg origin = lowest low between last swing high and now
      let m = lastHi; for (let k = lastHi; k <= i; k++) if (d.l[k] < d.l[m]) m = k;
      // last down candle at or before the low (within 3 bars)
      let ob = -1; for (let k = m; k >= Math.max(m - 3, 0); k--) if (d.c[k] < d.o[k]) { ob = k; break; } if (ob < 0) ob = m;
      const leg = d.c[i] - d.l[m]; if (leg < P.disp * a) continue;
      let top = P.full ? d.h[ob] : Math.max(d.o[ob], d.c[ob]); let bot = Math.min(d.l[ob], d.l[m]);
      Z.push({ born: i, dir: 1, top, bot, imp: leg / a, origin: m, gap: false });
    }
    if (lastLi >= 0 && lastLi !== usedL && d.c[i] < lastL && d.c[i - 1] >= lastL) {
      usedL = lastLi;
      let m = lastLi; for (let k = lastLi; k <= i; k++) if (d.h[k] > d.h[m]) m = k;
      let ob = -1; for (let k = m; k >= Math.max(m - 3, 0); k--) if (d.c[k] > d.o[k]) { ob = k; break; } if (ob < 0) ob = m;
      const leg = d.h[m] - d.c[i]; if (leg < P.disp * a) continue;
      let bot = P.full ? d.l[ob] : Math.min(d.o[ob], d.c[ob]); let top = Math.max(d.h[ob], d.h[m]);
      Z.push({ born: i, dir: -1, top, bot, imp: leg / a, origin: m, gap: false });
    }
  }
  return Z;
}

// ---------- trade simulation ----------
function sim(d, z, P) {
  const a0 = d.atr[z.born];
  let top = z.top, bot = z.bot;
  if (P.maxH && top - bot > P.maxH * a0) { if (z.dir === 1) top = bot + P.maxH * a0; else bot = top - P.maxH * a0; }
  if (P.minH && top - bot < P.minH * a0) { if (z.dir === 1) top = bot + P.minH * a0; else bot = top - P.minH * a0; }
  const prox = z.dir === 1 ? top : bot, dist = z.dir === 1 ? bot : top;
  let far = z.dir === 1 ? -Infinity : Infinity, left = !P.leave;
  for (let i = z.born + 1; i < Math.min(d.n, z.born + P.life); i++) {
    const touch = z.dir === 1 ? d.l[i] <= prox : d.h[i] >= prox;
    // invalidated before entry (a limit entry is filled on a touch bar even when that bar closes through)
    if ((z.dir === 1 ? d.c[i] < dist : d.c[i] > dist) && !(touch && P.entry !== "confirm" && left && i - z.born >= P.age)) return null;
    if (touch && left && i - z.born >= P.age) {
      // filters at the touch
      const e50 = d.e50[i - 1], e200 = d.e200[i - 1], e800 = d.e800[i - 1];
      if (P.trend === "ema" && (z.dir === 1 ? !(e50 > e200) : !(e50 < e200))) return null;
      if (P.trend === "htf" && (z.dir === 1 ? !(d.c[i - 1] > e800) : !(d.c[i - 1] < e800))) return null;
      if (P.trend === "slope" && (z.dir === 1 ? !(e200 > d.e200[i - 11]) : !(e200 < d.e200[i - 11]))) return null;
      if (P.loc) { let hi = -Infinity, lo = Infinity; for (let k = i - P.loc; k < i; k++) { hi = Math.max(hi, d.h[k]); lo = Math.min(lo, d.l[k]); } const lv = P.locMax ?? 0.5; const pos = (prox - lo) / (hi - lo || 1); if (z.dir === 1 ? pos > lv : 1 - pos > lv) return null; }
      const a = d.atr[i - 1];
      { let hi = -Infinity, lo = Infinity; for (let k = i - 100; k < i; k++) { hi = Math.max(hi, d.h[k]); lo = Math.min(lo, d.l[k]); }
        const pos = (prox - lo) / (hi - lo || 1);
        z.f = { imp: z.imp, gap: z.gap ? 1 : 0, hgt: (top - bot) / a0, age: i - z.born, far: z.dir === 1 ? (far - top) / a0 : (bot - far) / a0,
          loc: z.dir === 1 ? pos : 1 - pos, htf: (z.dir === 1 ? d.c[i - 1] > d.e800[i - 1] : d.c[i - 1] < d.e800[i - 1]) ? 1 : 0,
          ema: (z.dir === 1 ? d.e50[i - 1] > d.e200[i - 1] : d.e50[i - 1] < d.e200[i - 1]) ? 1 : 0,
          vol: a / d.atr[Math.max(0, i - 100)], dist: Math.abs(d.c[i - 1] - prox) / a }; }
      if (P.entry === "limit") {
        const entry = z.dir === 1 ? Math.min(prox, d.o[i]) : Math.max(prox, d.o[i]);
        const stop = z.dir === 1 ? dist - P.buf * a : dist + P.buf * a;
        if (P.tgtMid) { let hi = -Infinity, lo = Infinity; for (let k = i - 100; k < i; k++) { hi = Math.max(hi, d.h[k]); lo = Math.min(lo, d.l[k]); } const tg = (hi + lo) / 2 + (P.tgtMid - 0.5) * (hi - lo) * z.dir; const rr = (tg - entry) * z.dir / Math.abs(entry - stop); if (!(rr >= (P.minRR || 1))) return null; return run(d, z.dir, entry, stop, i, true, { ...P, T: rr }); }
        return run(d, z.dir, entry, stop, i, true, P);
      }
      if (P.entry === "mid") {
        const midp = (top + bot) / 2; const hit = z.dir === 1 ? d.l[i] <= midp : d.h[i] >= midp;
        if (!hit) { // wait for mid within next bars
          for (let j = i + 1; j < Math.min(d.n, i + 20); j++) { if (z.dir === 1 ? d.c[j] < dist : d.c[j] > dist) return null; if (z.dir === 1 ? d.l[j] <= midp : d.h[j] >= midp) { const st = z.dir === 1 ? dist - P.buf * a : dist + P.buf * a; return run(d, z.dir, z.dir === 1 ? Math.min(midp, d.o[j]) : Math.max(midp, d.o[j]), st, j, true, P); } }
          return null;
        }
        const stop = z.dir === 1 ? dist - P.buf * a : dist + P.buf * a;
        return run(d, z.dir, z.dir === 1 ? Math.min(midp, d.o[i]) : Math.max(midp, d.o[i]), stop, i, true, P);
      }
      // confirm: within the next P.cw bars (incl. this), a close back beyond proximal in direction
      for (let j = i; j < Math.min(d.n, i + P.cw); j++) {
        if (z.dir === 1 ? d.c[j] < dist : d.c[j] > dist) return null;
        const ok = z.dir === 1 ? d.c[j] > prox && d.c[j] > d.o[j] : d.c[j] < prox && d.c[j] < d.o[j];
        if (ok) {
          const ext = z.dir === 1 ? Math.min(...d.l.slice(i, j + 1)) : Math.max(...d.h.slice(i, j + 1));
          const stop = P.stopAt === "wick" ? (z.dir === 1 ? ext - P.buf * a : ext + P.buf * a) : (z.dir === 1 ? dist - P.buf * a : dist + P.buf * a);
          return run(d, z.dir, d.c[j], stop, j + 1, false, P);
        }
      }
      return null;
    }
    far = z.dir === 1 ? Math.max(far, d.h[i]) : Math.min(far, d.l[i]);
    if (!left && (z.dir === 1 ? far - top >= Math.max(top - bot, 0.5 * a0) : bot - far >= Math.max(top - bot, 0.5 * a0))) left = true;
  }
  return null;
}
function run(d, dir, entry, stop, i0, entryBar, P) {
  const risk = Math.abs(entry - stop); if (!(risk > 0)) return null;
  const tgt = entry + dir * risk * P.T;
  let be = false;
  for (let i = i0; i < Math.min(d.n, i0 + P.hold); i++) {
    const s = be ? entry : stop;
    if (dir === 1 ? d.l[i] <= s : d.h[i] >= s) return { r: be ? 0 : -1, i: i0 };
    if (!(entryBar && i === i0) && (dir === 1 ? d.h[i] >= tgt : d.l[i] <= tgt)) return { r: P.T, i: i0 };
    if (P.be && (dir === 1 ? d.h[i] >= entry + risk * P.be : d.l[i] <= entry - risk * P.be)) be = true;
  }
  if (P.dropExp) return null;
  const last = d.c[Math.min(d.n, i0 + P.hold) - 1];
  return { r: (dir * (last - entry)) / risk, i: i0 };
}
export function evaluate(P) {
  const out = { is: [], oos: [], per: {} };
  for (const d of data) {
    const Z = (P.gen === "ob" ? genOB : genBase)(d, P);
    const cut = Math.floor(d.n * 0.6);
    let busyUntil = -1;
    for (const z of Z) {
      if (P.minImp && z.imp < P.minImp) continue;
      const t = sim(d, z, P); if (!t) continue; t.f = z.f; t.mk = d.name; t.cut = t.i < cut; (out.all ||= []).push(t);
      (t.i < cut ? out.is : out.oos).push(t.r);
      (out.per[d.name] ||= []).push(t.r);
    }
  }
  const st = (a) => ({ n: a.length, exp: a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN, win: a.length ? a.filter((x) => x > 0).length / a.length : NaN });
  return { all: out.all, is: st(out.is), oos: st(out.oos), per: Object.fromEntries(Object.entries(out.per).map(([k, v]) => [k, st(v).exp.toFixed(2) + "/" + v.length])) };
}
const DEF = { gen: "base", imp: 1.0, disp: 1.5, full: false, maxH: 0, minH: 0, leave: false, age: 1, life: 300, trend: "", loc: 0, entry: "confirm", cw: 1, buf: 0.3, stopAt: "zone", T: 2, hold: 100, be: 0, minImp: 0 };
const fmt = (s) => `n=${String(s.n).padStart(4)} exp=${s.exp.toFixed(3).padStart(6)} win=${(s.win * 100).toFixed(0)}%`;
export function show(label, over) { const r = evaluate({ ...DEF, ...over }); console.log(label.padEnd(44), "IS", fmt(r.is), " | OOS", fmt(r.oos)); return r; }
if (process.argv[1].endsWith("zr.mjs") && process.argv[2]) { const list = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); for (const [k, v] of list) show(k, v); }
