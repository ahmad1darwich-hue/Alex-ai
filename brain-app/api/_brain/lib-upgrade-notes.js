// Automatic updates of the saved indicators (library). Each entry is one improvement of the indicator engine that is
// worth bringing into indicators Ahmad saved BEFORE it existed. The daily cron (api/daily.js -> _brain/lib-upgrade.js)
// applies the pending entries to a few saved indicators per day, keeps the old code as a version, and tells Ahmad on
// Telegram: the date, the indicator, version N -> N+1 and what changed.
//
// Daily improvement runs: add an entry ONLY for a change that improves existing scripts (accuracy, repaint, Pine v6
// fixes) - not for new features or style. Keep `rev` sortable (YYYY-MM-DD[-n]); never edit an entry once shipped.
//   rev      unique, sortable id
//   ar / en  one line for the Telegram message
//   applies  regex source: scripts it can concern (others are marked checked without a model call)
//   rules    what the engine must change (the model sees it; English, concrete)
export const UPGRADES = [
  {
    rev: "2026-10-28",
    ar: "مناطق الدخول: فلتر مكان المنطقة بالرينج، دخول ليمت على الحافة، ستوب نص ATR، وشمعة اللمسة بتنحسب بالنتائج",
    en: "Entry zones: location filter, limit entry at the zone edge, 0.5 ATR stop, the touch bar counts in the track record",
    applies: "box\\.new|order.?block|demand|supply|\\bOB\\b|FVG|fair value|zone",
    rules: "Only if this script has supply / demand, order block or FVG zones that give entry signals or keep a track record: (1) add a location filter input (\"Deep (25%)\" default / \"Half (50%)\" / \"Off\"): bullish entries only when the zone's near edge sits in the lowest 25% of the last 100 bars' range (ta.highest(high, 100)[1] / ta.lowest(low, 100)[1]), bearish in the highest 25%; (2) the entry is a limit at the zone's near (proximal) edge on the first touch: fill = math.min(edge, open) for bullish, math.max(edge, open) for bearish, marked on the confirmed touch bar, instead of waiting for a candle to close back out; (3) stop = far edge +/- 0.5 x atr[1]; (4) in any track record, a touch bar that also closes through the zone is a filled trade judged by its stop from that bar on (targets from the next bar). Zones without entry signals and scripts without zones: change nothing.",
  },
];

export const LATEST_UPGRADE = UPGRADES.length ? UPGRADES[UPGRADES.length - 1].rev : "";

// The updates an item has not received yet (all of them for items saved before this system existed).
export function pendingUpgrades(item) {
  const have = String((item && item.upgradeRev) || "");
  return UPGRADES.filter((u) => u.rev > have);
}
