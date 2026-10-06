#!/usr/bin/env bash
# Sets up a local development database on this machine's Postgres and writes .env.local.
# Needs sudo access to the postgres system user. Safe to run again: it rebuilds the database.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${1:-hrms_dev}
sudo service postgresql start >/dev/null 2>&1 || true
for i in 1 2 3 4 5 6 7 8 9 10; do sudo -u postgres psql -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
OWNER_PW=$(openssl rand -hex 16)
APP_PW=$(openssl rand -hex 16)
sudo -u postgres psql -q -c "drop database if exists $DB" -c "create database $DB"
sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=1 -v owner_pw="$OWNER_PW" -v app_pw="$APP_PW" -f scripts/bootstrap-roles.sql >/dev/null
if [ -f .env.local ] && grep -q '^DATA_KEY=' .env.local; then DATA_KEY=$(grep '^DATA_KEY=' .env.local | cut -d= -f2-); else DATA_KEY=$(openssl rand -base64 32); fi
cat > .env.local <<ENV
DATABASE_URL=postgres://hrms_app:$APP_PW@127.0.0.1:5432/$DB
MIGRATE_DATABASE_URL=postgres://hrms_owner:$OWNER_PW@127.0.0.1:5432/$DB
DATABASE_SSL=off
DATA_KEY=$DATA_KEY
DEMO_BANNER=1
ENV
set -a; . ./.env.local; set +a
node scripts/migrate.mjs
echo "database $DB ready"
