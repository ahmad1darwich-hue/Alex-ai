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
- `ui/` - the app client shared by both sites (`app.js`, `app.css`, `app.html`, landing files) and
  `ui/build-ui.mjs`, which generates `indicator-build/index.html` and `brain-app/indicators.html`.
  Run `node nexus-engine/ui/build-ui.mjs` after editing anything in `ui/`. Do not edit the generated pages.
- `dev-server.mjs` - local server for both pages and the engine: `node nexus-engine/dev-server.mjs`
  (simulated model without a key; real model with `ANTHROPIC_API_KEY` set).
- `tests/*.test.mjs` - `node nexus-engine/tests/lint.test.mjs`, `engine.test.mjs`, `handler.test.mjs`
  (the model API is mocked; no key or network needed).

Engine code deployed with the Brain project: `brain-app/api/_nexus/` (`handler.js`, `engine.js`, `lint.js`,
`knowledge.js`, `templates.js`, `pine-lint.mjs`). `brain-app/api/indicator.js` and `brain-app/api/nexus.js` are
thin Edge entry points for the same handler.

## Request protocol (v2)

`POST /api/indicator` with `{ v: 2, mode, lang, messages, code, file, templateId, tvError }`:

- `mode: "template"` + `templateId` - returns a verified template as JSON. No model call.
- `mode: "lint"` + `code` - checks pasted code and returns the report as JSON. No model call.
- `mode: "build"` - builds or edits (`code` = the current script, if any). NDJSON stream of `stage`, `code`,
  `explain`, `ping` events, then one `final` (or `error`) event.
- `mode: "fix"` + `code` + optional `tvError` - repairs the given script.

Requests without `v` get the legacy plain-text reply.

## Configuration (Vercel environment variables of the `brain` project)

- `ANTHROPIC_API_KEY` - required.
- `NEXUS_MODEL` - model id (default `claude-sonnet-5-5`); `NEXUS_FALLBACK_MODELS` - comma separated fallbacks.
- `NEXUS_EFFORT` - `low` | `medium` | `high` (default `medium`).
- `NEXUS_DAILY_PER_IP`, `NEXUS_DAILY_TOTAL` - daily request caps (defaults 40 and 400). They need the KV store
  (`KV_REST_API_URL`, `KV_REST_API_TOKEN`); without it there is no cap.
- `NEXUS_ALLOWED_ORIGINS` - optional comma separated list of sites allowed to call the API from a browser.
- `NEXUS_ADMIN_TOKEN` - optional operator token (16+ characters). With it, `POST { mode: "stats", admin }` returns
  the daily counters, and requests carrying `admin` skip the per-IP cap and may set `debug`, `model`, `effort`.

## Checker calibration

The checker is calibrated against TradingView's own compiler (the Pine Editor): the scripts of the Pine manual and
several hundred single-mistake probes (typical model errors: series values in `simple` arguments, reserved names,
unknown drawing methods, numbers passed as text, legacy syntax ...) were compiled there and compared with
`checkPine()`. Gaps found this way are closed in two places:

- `vendor/patch-pine-lint.mjs` - small, documented patches on the bundled linter (run it after re-bundling).
- `brain-app/api/_nexus/lint.js` - Nexus rules (`NX_*`) and the list of confirmed false positives.

Each patch and rule states the TradingView behaviour it reproduces; `tests/lint.test.mjs` holds one case per rule.
When a user reports a TradingView error that the checker missed, add the smallest script that reproduces it as a
test and extend the rules.

## Third-party code

`brain-app/api/_nexus/pine-lint.mjs` is a bundle of the linter core of
[pine-tools](https://github.com/folknor/pine-tools) (MIT, commit 3dd9f3c), with documentation prose removed from
its language data and the Nexus patches from `vendor/patch-pine-lint.mjs` applied. The license text is in
`brain-app/api/_nexus/LICENSE-pine-tools.txt`.
