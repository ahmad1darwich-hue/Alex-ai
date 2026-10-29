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
// 2026-10-29: the two entry-zone entries (2026-10-28, 2026-10-29) were withdrawn before any nightly run applied them -
// Ahmad found the bot's zones worse after the entry-zone rule and asked for the earlier behaviour back. Never re-add them.
export const UPGRADES = [];

export const latestUpgrade = () => (UPGRADES.length ? UPGRADES[UPGRADES.length - 1].rev : "");

// The updates an item has not received yet (all of them for items saved before this system existed).
export function pendingUpgrades(item) {
  const have = String((item && item.upgradeRev) || "");
  return UPGRADES.filter((u) => u.rev > have);
}
