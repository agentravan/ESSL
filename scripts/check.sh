#!/usr/bin/env bash
# Quick check: types, unit tests, database isolation tests. Prints only what failed.
set -uo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit 2>&1 | head -${1:-40}
echo "types: exit ${PIPESTATUS[0]}"
npx tsx --test --test-reporter=tap tests/*.test.ts 2>&1 | grep -aE "^# (tests|pass|fail)|^not ok|^# Subtest|rror:|expected|actual" | grep -aB2 -A6 "not ok" | head -40
npx tsx --test --test-reporter=tap tests/*.test.ts 2>&1 | grep -aE "^# (tests|pass|fail)" | tr '\n' ' '; echo
if command -v psql >/dev/null && sudo -n true 2>/dev/null; then
  sudo service postgresql start >/dev/null 2>&1; sleep 1
  sudo -u postgres psql -Atc "alter user postgres password 'pg'" >/dev/null 2>&1
  PGPASSWORD=pg ./scripts/test-db.sh -h 127.0.0.1 -U postgres 2>&1 | grep -aE "FAIL|ERROR|PASSED" | head -10
fi
