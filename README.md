# Finanse – 7-jar money split

Every amount of money that comes in is split automatically into **7 jars**, and every amount that goes out comes from one jar. Logging is built to be fast: you type one line like `uber 85`, and that's it.

**There are no paid AI APIs, API keys or tokens.** Quick-add parsing, drafts, insights and the monthly summary all run on rules and simple statistics on your own server. The only optional outside service is the Telegram bot, and the Telegram Bot API is free.

## Features

| Area | What it does |
|---|---|
| **Jars** | For God, Future Project, Big Purchases, Fun, Transport, Emergency and For Me. You can edit the percentages, and the app enforces a total of exactly 100%. |
| **Percentage history** | Changing the split creates a new version. Old income keeps the split it was given. |
| **Auto-split** | Income is divided right away. Rounding leftovers go to *For Me* (★). Amounts are stored as integer piasters, never floats. |
| **Sources and destinations** | Every transaction links to where money came from (employer, client) or where it went (Uber, Netflix). |
| **Goals** | For example, "Car – 300,000 by 2028". Shows progress, an estimated month you'll reach it, and whether you're on track. |
| **What-if** | For example, "Move 5% from Fun to Future Project": shows how many months sooner each goal is reached. |
| **Subscriptions and recurring items** | Logged automatically each cycle, with a reminder X days before renewal. |
| **Jar transfers** | Borrow from one jar to cover another. The transfer is logged, and the source jar must have enough money. |
| **Quick add (free, rule-based)** | `uber 85`, `lunch 150 yesterday #fun`, `got 5000 from freelance client Ahmed`, `salary 25k`, `اوبر ٨٥`, `قبضت ٥٠٠٠ من احمد` |
| **Learns without AI** | After you confirm `Zooba → Fun` once, the next `zooba 230` is saved straight to Fun. |
| **Drafts inbox** | Anything the parser isn't sure about waits here. One tap on a jar confirms it. |
| **Bank SMS** | Paste a bank message and it becomes a draft to confirm. |
| **Daily reminder** | An evening "Anything spent today?" message. If you skipped yesterday too, it asks about both days. |
| **Telegram bot (optional, free)** | Send `uber 85` from anywhere. Drafts get inline jar buttons. `/balance`, `/bank <sms>`, `/drafts`. |
| **Insights** | Income by source with growing or shrinking trends, spending per jar and destination, overspent jars, subscription costs and goal pace. |
| **Monthly report** | Generated on the 1st of each month and sent to you in the app and on Telegram. |

### How the quick-add parser works (no AI)

`backend/src/domain/parser.ts`:

1. **Amount**: `85`, `5,000`, `45.5`, `25k`, Arabic digits, `EGP 250` / `250 LE`. Card numbers like "ending 4421" are ignored.
2. **Date**: `today`, `yesterday`, `last monday`, `12/10`, `2026-09-01`, `امبارح`.
3. **Income or expense**: words like *got, received, salary, from, قبضت, مرتب*, or a leading `+`.
4. **Jar**: a `#tag` (`#fun`), then the jar this source or destination was last confirmed with, then a keyword list (uber → Transport, netflix → Fun, zakat → For God, …). You can edit the list in `JAR_KEYWORDS`.
5. **Confidence**: 0.7 or higher is saved directly. Anything lower goes to Drafts. Bank messages always go to Drafts.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 installable PWA (manifest + service worker), Recharts |
| Backend | NestJS 10 REST API (`/api/...`) |
| Database | **MongoDB** with Mongoose |
| Jobs | `@nestjs/schedule` cron jobs in the API process for recurring items, reminders and monthly reports. No Redis needed. |
| Bot | Telegram Bot API over plain HTTPS: long polling by default, or a webhook |
| Parsing / insights | Rule-based TypeScript, free and offline |

## Security

- JWT access tokens (15 minutes) plus rotating single-use refresh tokens. Reusing an old refresh token revokes every session.
- Two-factor authentication with TOTP, using any authenticator app. QR setup is in Settings.
- A PIN lock on the PWA, asked at open and after 5 minutes in the background.
- AES-256-GCM field-level encryption for notes, source and destination names, draft text, the TOTP secret and the Telegram chat ID. Lookups use HMAC blind indexes.
- The Telegram bot only accepts the chat linked with a one-time code that expires after 10 minutes. The webhook path is protected by a secret.
- Helmet, rate limiting (stricter on login, register and PIN), and `class-validator` with whitelisting on every input.
- An audit log of every create, edit and delete. Transactions are soft-deleted and can be restored.
- Encrypted daily backups with `scripts/backup.sh`.

## Running it

### Option A: Docker (MongoDB included)

```bash
cp backend/.env.example backend/.env
# Fill in JWT_ACCESS_SECRET and FIELD_ENCRYPTION_KEY:
#   openssl rand -hex 32
docker compose up -d --build
# Open http://localhost:3000
```

### Option B: Node directly

You need Node 20+ and MongoDB. MongoDB can be a local install or a free MongoDB Atlas M0 cluster.

```bash
cd backend
cp .env.example .env        # set MONGO_URI and the secrets
npm install
npm run start:dev           # http://localhost:4000/api

cd ../frontend
npm install
npm run dev                 # http://localhost:3000
```

On your phone, open the site and choose **Add to Home Screen** to install the PWA.

### Telegram bot (optional, free)

1. In Telegram, talk to **@BotFather**, send `/newbot`, and copy the token.
2. In `backend/.env`, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` (without the @).
3. Restart the backend. By default it uses long polling, which works on a laptop or any server with no public URL. To use a webhook instead, set `TELEGRAM_WEBHOOK_URL=https://your-domain` and `TELEGRAM_WEBHOOK_SECRET`.
4. In the app, go to **Settings → Telegram → Get link code**, then send `/link 123456` to your bot.

### Backups

```bash
BACKUP_PASSPHRASE='long passphrase' MONGO_URI=mongodb://localhost:27017/finanse ./scripts/backup.sh
# With Docker:
docker compose exec -T mongo mongodump --archive --gzip --db finanse \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out finanse-$(date +%F).enc
```

### Tests

```bash
cd backend && npm test
```

The tests cover the split math, the parser (English, Arabic, dates, bank SMS), goal projections, field encryption, and an app smoke test (wiring, auth guard, validation).

## Data model (MongoDB collections)

`users`, `jars`, `allocationversions`, `transactions` (type income/expense/transfer, with frozen income `splits`), `counterparties` (source/destination, plus a learned default jar), `recurringrules`, `goals`, `draftentries`, `auditlogs`, `notifications`, `monthlyreports`.

## API overview

All routes are under `/api`, and all amounts are integers in minor units (85 EGP = `8500`).

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Sessions |
| POST | `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/disable` | TOTP |
| POST | `/auth/pin`, `/auth/pin/verify` | PWA lock |
| POST | `/auth/telegram/link-code` · DELETE `/auth/telegram` | Bot linking |
| GET | `/dashboard` | Jars, balances, draft and notification counts |
| GET / PUT / PATCH | `/jars`, `/jars/allocation`, `/jars/allocations`, `/jars/:id` | Jars and split versions |
| GET / POST / PATCH / DELETE | `/transactions`, `/transactions/{income,expense,transfer}`, `/transactions/:id`, `/transactions/:id/restore` | Ledger |
| POST | `/entries/parse`, `/entries/quick`, `/entries/bank-message` | Quick add |
| GET / POST / DELETE | `/drafts`, `/drafts/:id/confirm`, `/drafts/:id` | Drafts inbox |
| CRUD | `/recurring`, `/goals`, GET `/goals/what-if` | Plans |
| GET | `/insights/income-by-source`, `/insights/spending-by-destination`, `/insights/monthly`, `/insights/reports` | Insights |
| GET | `/counterparties`, `/notifications`, `/audit` | Misc |
