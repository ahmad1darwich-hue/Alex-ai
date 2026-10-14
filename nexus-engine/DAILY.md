# Daily improvement run

Every day a scheduled run reads the latest daily report (`/api/daily`, KV `nx:daily:latest`, or the
`DAILY_REPORT {` line in the Vercel logs), fixes what failed, runs every test, commits to `main` and deploys
the `brain` project (root directory `brain-app`). Newest entries first.

## 2026-10-15 (Sydney)

- No real report yet (the first cron run is at 17:00 UTC on 2026-10-14), so the run probed the checker with known
  Pine v6 mistakes instead. Found 3 gaps and closed them in `lint.js`:
  - `NX_FLOAT_X` (error): a price, decimal or division as the x of `line.new` / `box.new` / `label.new` or of a
    method setter (`ln.set_x2(close)`). TradingView rejects it ("series float ... series int is expected"); the
    type checker let it through. This is the most common drawing bug (lessons L001/L004).
  - `NX_LINEWIDTH` (error): `linewidth` below 1 (v6 migration guide: compile error).
  - `NX_TF_PERIOD` (must fix): `timeframe.period == "D"` is never true in v6 (`"1D"`).
- knowledge.js: v6 integer division is fractional, x coordinates are int, negative array indexes (verified
  against the official v6 migration guide). Lesson L004 retired (merged into knowledge.js).
- bench.js: 2 new cases (`fib_last_swing`, `htf_opens_intraday`) that exercise computed x coordinates and
  timeframe checks. daily.test.mjs no longer depends on which cases the date rotation picks.
