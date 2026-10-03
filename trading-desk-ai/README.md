# Allan / آلان

An **assisted**, never automatic, crypto trading desk named **Allan**.

It reads the live internet (prices, candles, headlines), computes indicators with a
transparent rule engine, and produces a **pending signal**. The signal does nothing
until you edit it and approve it — and even then, *approval is a label on the screen,
not an order*. There is no execution layer in this codebase, by design.

## Why "pending" is the whole point

A signal can hold exactly three states:

| State | Meaning | Who can set it |
|---|---|---|
| `PENDING` | Proposed, waiting for you | the app (always starts here) |
| `APPROVED` | You reviewed it and accepted the plan on screen | **only you, by clicking** |
| `REJECTED` | You discarded it | **only you, by clicking** |

There is no `EXECUTED`. See `lib/no-execution.ts`.

## Features

- **Live market read** — candles and price from Binance's public REST API (no key, read-only by nature)
- **Transparent indicators** — SMA 21/55, Wilder RSI 14, MACD (12/26/9), ATR 14, volume ratio
- **Rule engine** — every bullet states a real condition, plus a confluence score. Nothing is a black box.
- **Live headlines** — Google News RSS headlines for context
- **Editable plan** — entry / stop / target are inputs, not gospel. Edit them; R:R recalculates live.
- **Bilingual UI** — Arabic (RTL) and English, switchable in-app
- **Allan's live channel** — pin one symbol and re-read it on an interval while the page is open
- **Video kit** — generates a YouTube-ready title, description and tags from the current read
- **Optional AI layer** — if you set an OpenAI-compatible endpoint, you get plain-language commentary. Without it, the app is fully functional.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /api/market` | Full read: snapshot + plan + reasoning + news, returns a PENDING signal |
| `POST /api/watch` | Flat read for the live channel. **No id, no state** — nothing here can be approved |
| `POST /api/ask` | Optional AI commentary. Returns `configured: false` when no endpoint is set |

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Optional AI layer

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

Unset these and the app still works — the `/api/ask` route returns `configured: false`
and the rule engine output stands on its own.

## What this app deliberately does NOT do

- ❌ Place, sign, or relay any order
- ❌ Hold exchange API keys, wallets, or withdrawal capability
- ❌ Run unattended in the background (the live channel stops when you close the tab)
- ❌ Upload to YouTube (it generates the script; you publish)
- ❌ Promise returns

## Deploy

Standard Next.js app. On Vercel, import the repo and it builds with defaults.
No environment variables are required for the core to run.

---

اجعل هذا المحتوى تعليمياً فقط، وليس نصيحة استثمارية.
Educational content only — not investment advice.
