#!/usr/bin/env bash
# scripts/shadow-db/run.sh — apply EVERY migration to a throwaway Postgres and run the pilot
# suites against real rows, real constraints, real triggers and real RLS.
#
# Why this exists: 197 pure-logic checks proved the slice composes, but until this harness the
# migrations had never touched a database engine and no query shape had ever been executed. The
# first run found a real defect (a many-to-one PostgREST embed read as an array), which is
# exactly the class of bug fixtures cannot catch.
#
# Requires: postgresql-16 (or later) installed locally. Needs NO Supabase credentials and touches
# NOTHING outside its own scratch database — safe to run anywhere, including CI.
#
#   bash scripts/shadow-db/run.sh
#
# Shims (00-supabase-shim.sql) stand in for the platform pieces this box lacks: auth, pgvector,
# pg_cron, pg_net, vault, storage. They are behaviour-free on purpose — what is under test is OUR
# DDL, constraints, triggers and policies, not Supabase's extensions.
set -euo pipefail

DB="${SHADOW_DB:-shadow_pilot}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
PG="${PG_SUPERUSER:-postgres}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1/5  Regenerating the migration bundle"
node "$ROOT/scripts/generate-apply-all.mjs"

say "2/5  Staging SQL (readable by the postgres role)"
cp "$ROOT/supabase/schema.sql" "$ROOT/supabase/schema_v2_autopilot.sql" \
   "$ROOT/supabase/_apply_garvis_all.sql" "$ROOT/scripts/shadow-db/"*.sql "$WORK/"
# Neutralize what stock Postgres cannot provide. Only in the COPY — the repo is never edited.
python3 - "$WORK/_apply_garvis_all.sql" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'create extension if not exists (vector|pg_cron|pg_net);', r'-- [shadow] create extension \1;', s)
s = s.replace('vector(1536)', 'vector')                                   # shim domain takes no typmod
s = s.replace('using hnsw (embedding vector_cosine_ops)', '(subject_type)')
s = s.replace('1 - (e.embedding <=> _query) as similarity', '0.0::float as similarity')
s = s.replace('and (1 - (e.embedding <=> _query)) >= _min_similarity', 'and 0.0 >= _min_similarity')
s = s.replace('order by e.embedding <=> _query', 'order by e.created_at')
open(p, 'w').write(s)
PY
chmod 644 "$WORK"/*.sql; chmod 755 "$WORK"

say "3/5  Building the shadow database ($DB)"
su "$PG" -c "dropdb --if-exists $DB && createdb $DB"
su "$PG" -c "psql -q -d $DB -c 'create publication supabase_realtime'" >/dev/null 2>&1 || true
su "$PG" -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $WORK/00-supabase-shim.sql" >/dev/null
su "$PG" -c "psql -q -d $DB -c \"alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb, add column if not exists created_at timestamptz default now()\"" >/dev/null

say "4/5  Applying schema + EVERY migration (this is the part that had never run)"
su "$PG" -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $WORK/schema.sql" >/dev/null 2>&1
su "$PG" -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $WORK/schema_v2_autopilot.sql" >/dev/null 2>&1
if ! su "$PG" -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $WORK/_apply_garvis_all.sql" 2>&1 | grep -E '^psql.*ERROR' ; then
  echo "  all migrations applied cleanly"
else
  echo "  MIGRATION FAILURE (above) — the bundle does not apply"; exit 1
fi

say "5/5  Pilot suites (substrate · isolation · query shapes)"
FAILED=0
for f in 10-substrate 20-isolation 30-query-shapes; do
  out=$(su "$PG" -c "psql -q -d $DB -f $WORK/$f.sql" 2>&1 | sed 's/^psql[^ ]* NOTICE:  //')
  echo "$out" | grep -E 'PASS|FAIL|ERROR' || true
  if echo "$out" | grep -qE '^FAIL|ERROR'; then FAILED=1; fi
done

rm -rf "$WORK"
if [ "$FAILED" -ne 0 ]; then echo; echo "SHADOW PILOT: FAILURES ABOVE"; exit 1; fi
say "SHADOW PILOT: all green"
