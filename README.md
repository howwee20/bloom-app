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

## Scripts

- `npm run seed:ledger` – seeds a demo user + ledger data
- `npm run simulate:column` – posts mock Column webhooks
- `npm test` – runs backend engine tests (requires env + migrated DB)

## Notes

- Native builds must set `EXPO_PUBLIC_API_BASE_URL` so the app can reach `/api` routes.
- API routes accept `x-user-id` in headers for dev; production should pass a real auth token.
