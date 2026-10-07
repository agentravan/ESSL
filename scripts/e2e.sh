#!/usr/bin/env bash
# Rebuilds the dev database, loads sample data, starts the built app and runs the browser checks.
set -uo pipefail
cd "$(dirname "$0")/.."
./scripts/dev-db.sh >/tmp/devdb.log 2>&1 || { tail -20 /tmp/devdb.log; exit 1; }
set -a; . ./.env.local; set +a
export SEED_LOGINS_FILE=/tmp/hrms-logins.json
npx tsx scripts/seed-demo.ts >/tmp/seed.log 2>&1 || { tail -30 /tmp/seed.log; exit 1; }
echo "seeded"
[ -d .next ] && [ "${SKIP_BUILD:-0}" = 1 ] || npx next build >/tmp/build.log 2>&1 || { tail -40 /tmp/build.log; exit 1; }
pkill -f "next start" 2>/dev/null; sleep 1
(npx next start -p 3000 >/tmp/start.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/login && break; sleep 1; done
cd e2e && [ -d node_modules ] || (npm install --no-audit --no-fund >/tmp/e2e-install.log 2>&1 && npx playwright install --with-deps chromium >/tmp/pw.log 2>&1)
BASE_URL=http://localhost:3000 node run.mjs 2>&1 | grep -vE "^ok " 
echo "--- server errors ---"; grep -iE "error|unexpected" /tmp/start.log | head -20
