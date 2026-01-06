# External Cron (Free)

Use a free scheduler to hit the secure cron endpoint every 10–15 minutes.

## Endpoint

```
https://<your-domain>/api/cron/update-prices?secret=CRON_SECRET
```

Optional params:
- `limit` (default 20, max 25)
- `cursor` (from the previous response)

## Environment

Set these on your deployment:
- `CRON_SECRET` (shared secret for cron calls)
- `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## cron-job.org setup (free)

1) Create a new job.
2) URL:
```
https://<your-domain>/api/cron/update-prices?secret=CRON_SECRET
```
3) Method: `GET`
4) Schedule: every 10 or 15 minutes.
5) Save.

## GitHub Actions alternative (free)

Create `.github/workflows/price-cron.yml`:

```yaml
name: Price Cron
on:
  schedule:
    - cron: '*/15 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger price update
        run: |
          curl -sS "https://<your-domain>/api/cron/update-prices?secret=${CRON_SECRET}"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```
