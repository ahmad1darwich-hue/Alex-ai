# Nexus engine

The indicator engine behind `brain-app/api/indicator.js` (used by Nexus and Brain Indicators).

## How a request is handled

1. **Verified templates** (`templates/*.pine`, catalog in `catalog.mjs`) cover the common tools: SMC, trend,
   buy/sell signals with TP/SL, support and resistance, scalping, MTF table, sessions, RSI divergence, strategy.
   A template can be delivered as is (`mode: "template"`, no model call) or used by the model as a base.
2. **Model call** with the knowledge pack in `brain-app/api/_nexus/knowledge.js` (Pine v6 rules, quality bar,
   the templates). The model answers with a full script or with small search/replace edits on a base.
3. **Automatic check** (`_nexus/lint.js`): a real Pine v6 parser and type checker (`_nexus/pine-lint.mjs`,
   bundled from the MIT-licensed pine-tools project) plus a few Nexus rules.
4. **Automatic repair**: findings go back to the model, up to three rounds, and the best version is kept.
5. The reply states whether the script passed the check. If TradingView still reports an error, the user pastes
   it (`mode: "fix"`) and it is repaired against the current script.

## Files

- `templates/*.pine` - sources of the verified templates (original code; tested on TradingView's compiler).
- `catalog.mjs` - ids, titles, model-facing descriptions and user-facing explanations (Arabic and English).
- `build.mjs` - generates `brain-app/api/_nexus/templates.js`. Run `node nexus-engine/build.mjs` after editing.
- `tests/*.test.mjs` - `node nexus-engine/tests/lint.test.mjs`, `engine.test.mjs`, `handler.test.mjs`
  (the model API is mocked; no key or network needed).

## Configuration (Vercel environment variables of the `brain` project)

- `ANTHROPIC_API_KEY` - required.
- `NEXUS_MODEL` - model id (default `claude-sonnet-5-5`); `NEXUS_FALLBACK_MODELS` - comma separated fallbacks.
- `NEXUS_EFFORT` - `low` | `medium` | `high` (default `medium`).
- `NEXUS_DAILY_PER_IP`, `NEXUS_DAILY_TOTAL` - daily request caps (defaults 80 and 500). They need the KV store
  (`KV_REST_API_URL`, `KV_REST_API_TOKEN`); without it there is no cap.

## Third-party code

`brain-app/api/_nexus/pine-lint.mjs` is a bundle of the linter core of
[pine-tools](https://github.com/folknor/pine-tools) (MIT, commit 3dd9f3c), with documentation prose removed from
its language data. The license text is in `brain-app/api/_nexus/LICENSE-pine-tools.txt`.
