# Bloom App

Bloom is an Expo app with serverless API routes (Vercel) and a Postgres-backed, double-entry ledger. The frontend stays minimal (one number + flip), while the backend provides spendable balance, receipts, and holdings.

## Quickstart

1) Install dependencies

```bash
npm install
```

2) Configure environment

Required (server/API):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required (client):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Recommended:
- `DEV_USER_ID` (used by API routes in dev if no auth header is provided)
- `DEV_USER_EMAIL`, `DEV_USER_PASSWORD` (used by seed script if `DEV_USER_ID` is not set)
- `EXPO_PUBLIC_API_BASE_URL` (native/mobile only, e.g. `https://your-vercel-url`)
- `COLUMN_WEBHOOK_SECRET` (optional; enables webhook signature verification)
- `ADMIN_API_KEY` or `DEV_ADMIN_KEY` (for admin endpoints)
- `BLOOM_BALANCE_MODE` (`debit` or `spend_power`)
- `BRIDGE_ENABLED` (true/false)

3) Run database migrations

```bash
npx supabase db push
```

4) Seed demo data

```bash
npm run seed:ledger
```

5) Run the app

```bash
npm run start
```

If you need local API routes, run Vercel dev in another terminal:

```bash
npx vercel dev
```

## API Endpoints

- `GET /api/balance` → `{ spendable_cents, total_value_cents, day_pnl_cents, updated_at }`
- `GET /api/flip` → `{ payments, holdings, other_assets, liabilities }`
- `POST /api/command` → parse command preview
- `POST /api/command/confirm` → execute command
- `POST /api/webhooks/column/auth_request`
- `POST /api/webhooks/column/transaction_posted`
- `POST /api/webhooks/column/ach_event`
- `POST /api/webhooks/card/auth`
- `POST /api/webhooks/card/settlement`
- `POST /api/webhooks/card/refund`
- `POST /api/webhooks/card/reversal`
- `POST /api/webhooks/card/dispute`
- `POST /api/cron/liquidate`
- `POST /api/cron/reconcile`

## Scripts

- `npm run seed:ledger` – seeds a demo user + ledger data
- `npm run simulate:column` – posts mock Column webhooks
- `npm run run:liquidate` – runs liquidation loop for `DEV_USER_ID`
- `npm run reconcile` – runs reconciliation loop for `DEV_USER_ID`
- `npm run e2e:kernel` – end-to-end kernel smoke test (mock mode)
- `npm test` – runs backend engine tests (requires env + migrated DB)

## Mock vs Real Mode

Adapters auto-switch based on env vars:

- Bank/BaaS: `COLUMN_API_KEY` → real, otherwise mock
- Card Processor: `CARD_PROCESSOR_API_KEY` → real, otherwise mock
- Brokerage: `ALPACA_API_KEY` → real, otherwise paper
- Crypto: `COINBASE_API_KEY` or `ZEROHASH_API_KEY` → real, otherwise paper

## Day Column Keys Arrive (Checklist)

1) Set env vars in Vercel:
   - `COLUMN_API_KEY`
   - `COLUMN_WEBHOOK_SECRET`
2) Point Column webhooks at:
   - `/api/webhooks/column/auth_request`
   - `/api/webhooks/column/transaction_posted`
   - `/api/webhooks/column/ach_event`
3) Set `BLOOM_BALANCE_MODE=debit` (safe default) and `BRIDGE_ENABLED=false` for first dogfood.
4) Run `npm run reconcile` and verify drift reports are zero.
5) Enable card processor keys and point their webhooks to `/api/webhooks/card/*`.
6) Enable brokerage + crypto keys when ready.

## Notes

- Native builds must set `EXPO_PUBLIC_API_BASE_URL` so the app can reach `/api` routes.
- API routes accept `x-user-id` in headers for dev; production should pass a real auth token.
