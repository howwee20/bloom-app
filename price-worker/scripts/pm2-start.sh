#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${WORKER_ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[PM2] Missing ${ENV_FILE}. Create it with Supabase + StockX credentials."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${WORKER_ROOT}"

pm2 start index.js --name bloom-prices

echo ""
echo "[PM2] Process started: bloom-prices"
echo ""
echo "Next steps (one-time):"
echo "  pm2 save"
echo "  pm2 startup"
echo ""
echo "Logs:"
echo "  pm2 logs bloom-prices --lines 200"
