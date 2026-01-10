# Pricing Option A (Local Worker on EJ's Mac)

This setup runs the StockX pricing worker locally (residential IP) while the app stays on Railway/Vercel. The worker writes RAW StockX asks into Supabase and the app only displays freshness when the DB confirms a successful refresh.

## 1) Create `price-worker/.env`

Required env vars (local only):

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
STOCKX_CLIENT_ID=...
STOCKX_CLIENT_SECRET=...
STOCKX_API_KEY=...
```

Notes:
- The StockX **refresh token lives in Supabase** (via `app_secrets` + RPCs).
- The worker does **not** read refresh tokens from env.

## 2) Verify StockX auth (one-time)

From repo root:

```
node scripts/stockx_auth_probe.js
```

Expect `ok: true` and `status: 200`.

## 3) Start the worker with pm2

```
cd price-worker
npm run start:pm2
```

Optional:

```
npm run logs:pm2
npm run restart:pm2
npm run stop:pm2
```

## 4) Health + status endpoints

Default port: `http://localhost:3001`

- `GET /health` → `{ ok: true }`
- `GET /token-health` → refresh test; `ok:true` only if StockX returns 200
- `GET /status` → last job status + freshness (<=15 mins = fresh)

## 5) Verify end-to-end

1) Check `price_refresh_jobs` in Supabase:
   - `status = success`
   - `finished_at` updates every run
2) Check `assets.updated_at_pricing` updates on each successful check
3) Wallet header shows:
   - `Updated Xm ago` only when fresh
   - `Prices paused` when stale or missing

## SQL: verify job freshness

```sql
select id,status,updated_count,failed_count,skipped_count,finished_at
from price_refresh_jobs
order by started_at desc
limit 5;
```
