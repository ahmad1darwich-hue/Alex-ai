import { evaluate } from "./zr.mjs";
const P = JSON.parse(process.argv[2] || "{}");
const DEF = { gen: "base", imp: 1.0, disp: 1.5, full: false, maxH: 0, minH: 0, leave: false, age: 1, life: 300, trend: "", loc: 0, entry: "limit", cw: 1, buf: 0.5, stopAt: "zone", T: 2, hold: 100, be: 0, minImp: 0 };
const r = evaluate({ ...DEF, ...P }); const all = r.all;
const st = (a) => a.length ? `${(a.reduce((x, y) => x + y.r, 0) / a.length).toFixed(3).padStart(6)} (${String(a.length).padStart(4)})` : "   -   ";
console.log("ALL", st(all.filter((t) => t.cut)), st(all.filter((t) => !t.cut)));
for (const k of Object.keys(all[0].f)) {
  const v = all.map((t) => t.f[k]).filter((x) => isFinite(x)).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => v[Math.floor(p * v.length)]);
  const uniq = [...new Set(v)];
  const edges = uniq.length <= 2 ? uniq : q;
  const bucket = (x) => (uniq.length <= 2 ? uniq.indexOf(x) : edges.filter((e) => x >= e).length);
  const nb = uniq.length <= 2 ? uniq.length : 5;
  let line = k.padEnd(5);
  for (let b = 0; b < nb; b++) { const sel = all.filter((t) => bucket(t.f[k]) === b); line += ` | ${b}${uniq.length <= 2 ? "=" + uniq[b] : "<" + (edges[b] ?? "max")?.toFixed?.(2)} IS ${st(sel.filter((t) => t.cut))} OOS ${st(sel.filter((t) => !t.cut))}`; }
  console.log(line);
}
