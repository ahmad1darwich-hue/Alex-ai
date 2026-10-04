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
  `ui/build-ui.mjs`, which generates `indicator-build/index.html` with its `vercel.json` (public Nexus site),
  `brain-app/indicators.html` (Brain Indicators) and `brain-app/nexus-next.html` (staging page on `/api/nexus`).
  Run `node nexus-engine/ui/build-ui.mjs` after editing anything in `ui/`. Do not edit the generated files.
- `dev-server.mjs` - local server for the pages and the engine: `node nexus-engine/dev-server.mjs`
  (simulated model without a key; real model with `ANTHROPIC_API_KEY` set). Requests containing `sim:broken`,
  `sim:unfixable`, `sim:text`, `sim:error` or `sim:slow` make the simulated model produce those cases.
- `tests/` - run all of them before deploying (the model API is mocked; no key or network needed):
  `lint.test.mjs`, `engine.test.mjs`, `handler.test.mjs` (engine), `ui.test.mjs` (generated pages are up to date,
  the security policy matches the page, every text key exists), `brain-lock.test.mjs` (Brain's private endpoints),
  and `ui-e2e.mjs` (the pages in a real browser; optional, needs Playwright and Chromium).

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
- `NEXUS_DAILY_PER_IP`, `NEXUS_DAILY_TOTAL` - daily caps for model requests (defaults 40 per client and 400 in
  total). `NEXUS_DAILY_FREE_PER_IP` - daily cap per client for template and check requests (default 600).
  The counters live in the KV store (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). Without the store, or when it does
  not answer, a small in-memory allowance per client applies instead (12 model requests per hour).
- `NEXUS_ALLOWED_ORIGINS` - optional comma separated list of sites allowed to call the API from a browser
  (for example `https://indicator-build.vercel.app,https://brain-ahmad-93cb.vercel.app`). With a list, browser
  calls from other sites get 403; calls without an `Origin` header (not browsers) are only limited by the caps.
- `NEXUS_ADMIN_TOKEN` - optional operator token (16+ characters). With it, `POST { mode: "stats", admin }` returns
  the daily counters, and requests carrying `admin` skip the per-IP cap and may set `debug`, `model`, `effort`.

When the service cannot work for a reason only the operator can fix, visitors see "The service is paused for the
moment (code XX)" and the reason is in the Vercel logs and in the stats (`outage_XX`):
`K1` no `ANTHROPIC_API_KEY`, `K2` the key is rejected, `C1` the Anthropic account is out of credit,
`M1` none of the configured models is available to the account.

## The pages

- The app view of the public site is `/#app`, so a reload stays in the app and the browser's Back button returns
  to the landing page. Each tab keeps its own conversation (`sessionStorage`); the latest one is also kept for the
  next visit (`localStorage`). Nothing is stored on the server.
- A result is shown as verified only when the checker found no error and every requested edit was applied.
  Otherwise the badge says how many errors remain and that the script will not compile yet, the server's sentence
  is shown above the script, and "Fix the findings automatically" is the first action.
- The landing copy states what the product does (automatic check, automatic repair, the result of the check is
  shown). `tests/ui.test.mjs` fails if a promise such as "works on the first paste" comes back.
- The public page is served with a Content-Security-Policy that allows only the two inline scripts of the
  generated page (by hash) and connections to the engine. The hashes are written to `indicator-build/vercel.json`
  by the build, so the page and that file must always be deployed together.

## Deploying

Pushing to `main` does not deploy by itself on this account. After the tests pass and the commit is on GitHub,
create a production deployment for each project (Vercel dashboard -> project -> Deployments -> Create
Deployment -> `main`, or the Vercel API with `gitSource` and the root directory below):

| Vercel project    | Root directory    | Serves                                                     |
| ----------------- | ----------------- | ---------------------------------------------------------- |
| `brain`           | `brain-app`       | the engine (`/api/indicator`, `/api/nexus`), Brain, Brain Indicators |
| `indicator-build` | `indicator-build` | the public Nexus site                                      |

`GET /api/indicator` returns `rev` (it changes with the knowledge pack): compare it before and after a deploy.

## Brain's private endpoints

`brain-app/api/agent.js` (assistant) and `brain-app/api/email.js` (work inbox) answer only requests that carry
the owner's key in the `x-brain-key` header (`brain-app/api/_brain/lock.js`). `BRAIN_KEY` is a long random value
in the Vercel project; without it both endpoints stay closed. A device is activated once by opening
`https://<brain site>/#key=<BRAIN_KEY>`: the page stores the key on that device and removes it from the address
bar. To revoke all devices, change `BRAIN_KEY` and redeploy.

The WhatsApp webhooks (`whatsapp.js`, `wa-customer.js`) do nothing until their WhatsApp credentials are set. With
`WA_APP_SECRET` (the Meta app secret) set, calls that are not signed by Meta are ignored.

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
