#!/usr/bin/env bash
# Rebuilds a throwaway database and runs the isolation tests against it.
# Usage: scripts/test-db.sh [psql superuser connection options]
#   e.g. scripts/test-db.sh -h /tmp -p 5433 -U postgres
set -euo pipefail
cd "$(dirname "$0")/.."
SU=("$@")
DB=hrms_test
psql "${SU[@]}" -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql "${SU[@]}" -q -d $DB -v ON_ERROR_STOP=1 -v owner_pw=owner_test -v app_pw=app_test -f scripts/bootstrap-roles.sql >/dev/null
HOSTOPTS=()
for ((i = 0; i < ${#SU[@]}; i++)); do
  case "${SU[$i]}" in -h | -p) HOSTOPTS+=("${SU[$i]}" "${SU[$((i + 1))]}") ;; esac
done
for f in db/migrations/*.sql; do
  PGPASSWORD=owner_test psql "${HOSTOPTS[@]}" -U hrms_owner -q -d $DB -v ON_ERROR_STOP=1 -1 -f "$f"
done
PGPASSWORD=owner_test psql "${HOSTOPTS[@]}" -U hrms_owner -q -d $DB -v ON_ERROR_STOP=1 -1 -f tests/rls_setup.sql
PGPASSWORD=app_test psql "${HOSTOPTS[@]}" -U hrms_app -q -d $DB -f tests/rls.sql 2>&1 | grep -E "FAIL|ERROR|PASSED|ok:" | sed 's/^psql:[^ ]* //'
