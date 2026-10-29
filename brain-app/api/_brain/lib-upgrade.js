// Daily automatic update of the saved indicators (called by api/daily.js after the self-check starts).
// For each saved indicator that has pending updates (_brain/lib-upgrade-notes.js) and automatic updates on:
//   - no update concerns it (its code does not match `applies`) -> marked checked, code untouched, no model call;
//   - otherwise the engine edits it with the update rules ("change only this, keep everything else");
//     the result is kept ONLY when our checker verifies it AND the chart preview runs it without an error;
//     then it is saved as the next version (the old code stays in the library's versions, restorable in one tap);
//   - no edit needed / check failed -> code untouched (failed ones are retried on a later day, at most 3 tries).
// A few indicators per day (MAX_PER_RUN) keep the cron inside its time budget and the cost small.
import { runPipeline } from "../_nexus/engine.js";
import { runPreview } from "../_nexus/preview-run.js";
import { sampleCandles } from "./candles.js";
import { listItems, getItem, saveItem, markUpgradeChecked, noteUpgradeTry } from "./library.js";
import { pendingUpgrades, LATEST_UPGRADE } from "./lib-upgrade-notes.js";

export const MAX_PER_RUN = 3;
export const MAX_TRIES = 3;
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);

export function upgradeRequest(item, ups) {
  return "AUTOMATIC MAINTENANCE UPDATE (no user is present; do not ask questions). This saved indicator was built before these engine improvements:\n" +
    ups.map((u) => `- [${u.rev}] ${u.rules}`).join("\n") +
    "\nApply ONLY what concerns this script, as small search/replace edits on the current script. Keep its name, inputs and their defaults, colors, layout, drawings, signals and alerts exactly as they are unless an improvement above changes them. If none of it concerns this script, return no edits and say so in one line. In <explain>, one or two short Arabic lines on what changed.";
}

// Candidates: automatic updates on, something pending, not given up on; oldest-updated first.
export function pickCandidates(items, max = MAX_PER_RUN) {
  return (items || [])
    .filter((it) => it && it.autoUpdate !== false && pendingUpgrades(it).length && (Number(it.upgradeTries) || 0) < MAX_TRIES)
    .sort((a, b) => (a.updated || 0) - (b.updated || 0))
    .slice(0, max);
}

function previewOk(code) {
  try { const r = runPreview(code, sampleCandles(900, 400), { tfSec: 900 }); return !!(r && r.ok); } catch (e) { return false; }
}

export async function upgradeOne(meta, { callModel, deadline, signal, day }) {
  const ups = pendingUpgrades(meta);
  const rev = ups.length ? ups[ups.length - 1].rev : LATEST_UPGRADE;
  const out = { id: meta.id, name: meta.name, from: Number(meta.ver) || (meta.versions || 0) + 1, to: null, status: "", note: "", rev, updates: ups.map((u) => u.rev) };
  const it = await getItem(meta.id);
  if (!it) { out.status = "missing"; return out; }
  const relevant = ups.filter((u) => new RegExp(u.applies, "i").test(it.code));
  if (!relevant.length) { await markUpgradeChecked(it.id, rev, "not concerned"); out.status = "not_concerned"; return out; }
  let result;
  try {
    result = await runPipeline({ mode: "build", lang: "ar", history: [], userContent: upgradeRequest(it, relevant), currentCode: it.code, currentFile: it.file, callModel, emit: () => {}, deadline, effort: "medium", signal, maxRounds: 2 });
  } catch (e) { await noteUpgradeTry(it.id); out.status = "error"; out.note = clip(e && e.message, 120); return out; }
  const code = result && result.kind === "script" ? String(result.code || "") : "";
  if (!code || code.trim() === it.code.trim()) { await markUpgradeChecked(it.id, rev, "no change needed"); out.status = "unchanged"; out.note = clip(result && result.explain, 160); return out; }
  if (!result.report.verified || !previewOk(code)) {
    await noteUpgradeTry(it.id);
    out.status = "rejected"; out.note = result.report.verified ? "preview failed" : clip((result.report.errors[0] || {}).message, 120);
    return out; // the saved code stays as it was; tried again on a later day (MAX_TRIES)
  }
  out.to = out.from + 1;
  out.note = clip(result.explain, 200);
  const sv = await saveItem({ id: it.id, code, name: it.name, file: it.file, title: it.title, request: it.request, verified: true, errors: [], source: "upgrade", upgradeRev: rev, lastUpgrade: { day, rev, from: out.from, to: out.to, note: out.note } });
  out.status = sv.ok ? "updated" : "save_failed";
  if (sv.ok) out.to = sv.item.ver;
  return out;
}

// Runs today's batch. Returns { day, results, remaining } (remaining = indicators still waiting for an update).
export async function runLibraryUpgrades({ callModel, deadline, signal, day, max = MAX_PER_RUN }) {
  const items = await listItems();
  if (!items) return { day, results: [], remaining: 0, store: false };
  const picks = pickCandidates(items, max);
  const results = await Promise.all(picks.map((m) => upgradeOne(m, { callModel, deadline, signal, day }).catch((e) => ({ id: m.id, name: m.name, status: "error", note: clip(e && e.message, 120) }))));
  const remaining = pickCandidates(items, Infinity).length - picks.length + results.filter((r) => r.status === "rejected" || r.status === "error").length;
  return { day, results, remaining: Math.max(0, remaining), store: true };
}

// The Telegram message: date, indicator, version from -> to and what changed. Empty when nothing happened.
export function upgradeText(run, notes) {
  const rs = (run && run.results) || [];
  if (!rs.length) return "";
  const byRev = Object.fromEntries((notes || []).map((u) => [u.rev, u]));
  const revs = [...new Set(rs.flatMap((r) => r.updates || []))];
  const lines = rs.map((r) => {
    if (r.status === "updated") return `✅ ${r.name}: النسخة ${r.from} ← صارت النسخة ${r.to}${r.note ? "\n   شو تغيّر: " + r.note : ""}\n   (النسخة ${r.from} محفوظة بالمكتبة إذا بدك ترجعلها)`;
    if (r.status === "unchanged" || r.status === "not_concerned") return `➖ ${r.name}: ما احتاج تغيير (ضلّ النسخة ${r.from})`;
    return `⚠️ ${r.name}: التحديث ما نجح بالفحص، ضلّ على النسخة ${r.from} وبجرّب مرة تانية`;
  });
  const what = revs.map((v) => (byRev[v] ? `• ${v}: ${byRev[v].ar}` : "")).filter(Boolean).join("\n");
  return `📅 تحديث المؤشرات المحفوظة · ${run.day}\n${what ? "\n🔧 التحديث:\n" + what + "\n" : ""}\n${lines.join("\n")}${run.remaining ? `\n\n⏳ باقي ${run.remaining} مؤشر، بيتحدّثوا بالأيام الجاية.` : ""}\n\nإذا لصقت نسخة جديدة بـ TradingView وطلع error، ابعتلي ياه.`;
}
