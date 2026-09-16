#!/usr/bin/env bash
# scripts/go-live.sh — ONE COMMAND to light up Garvis's AI layer (words + images + drafts + streams).
#
# Run from anywhere with the repo checked out:
#
#   SUPABASE_ACCESS_TOKEN=sbp_xxx PROJECT_REF=yourprojectref \
#   ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-proj-... \
#   bash scripts/go-live.sh
#
#   • SUPABASE_ACCESS_TOKEN — create at https://supabase.com/dashboard/account/tokens
#   • PROJECT_REF           — the subdomain of your project URL (https://<PROJECT_REF>.supabase.co)
#   • ANTHROPIC_API_KEY     — powers ALL words (boards, ideas, auto-idea streams, reply drafts)
#   • OPENAI_API_KEY        — powers images/logos (gpt-image-1); optional, words work without it
#
# SECURITY: keys are read from the environment ONLY — this script never writes them to disk, and
# they must never be committed. If a key was ever pasted into a chat or ticket, rotate it after
# this succeeds and re-run with the new value (zero downtime).
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)}"
: "${PROJECT_REF:?Set PROJECT_REF (the subdomain of https://<ref>.supabase.co)}"
: "${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY (powers all words)}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"

cd "$(dirname "$0")/.."

echo "→ 1/3 setting edge-function secrets on ${PROJECT_REF}…"
if [ -n "$OPENAI_API_KEY" ]; then
  npx -y supabase@latest secrets set --project-ref "$PROJECT_REF" \
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" OPENAI_API_KEY="$OPENAI_API_KEY"
else
  npx -y supabase@latest secrets set --project-ref "$PROJECT_REF" \
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
  echo "   (no OPENAI_API_KEY provided — words will work; image/logo generation stays honestly off)"
fi

# THE WHOLE FLEET, not a hand-picked four. This loop used to name board-copy, generate-image,
# inbox-draft and standing-worker — which was most of the AI layer when it was written and is now
# four functions out of seventy. Anyone running this script to "go live" deployed a twentieth of
# the app and had no way to know. The curated lists in package.json are the single source of truth
# (the same two the Deploy Supabase workflow uses), so this can no longer drift behind them.
echo "→ 2/3 deploying every edge function…"
npm run functions:deploy -- --project-ref "$PROJECT_REF"
npm run functions:deploy:webhooks -- --project-ref "$PROJECT_REF"

echo "→ 3/3 migrations + the heartbeat"
cat <<'EOF'
   MIGRATIONS are not applied by this script. Either run the "Deploy Supabase" GitHub Action with
   mode=full (it applies them through the management API with the same access token), or paste
   supabase/_apply_garvis_all.sql into the SQL editor. Every migration is additive and idempotent,
   so re-applying the whole file is safe.

   The 15-minute clock (garvis-standing-tick) drives auto-ideas, batch sends, reminders,
   and watchers. If it isn't armed yet, open Garvis → Settings → the heartbeat panel and
   arm it there (it self-reports if it has never ticked), or apply migration
   supabase/migrations/*app_0059* which schedules it.

DONE. Open any board and hit Make with an idea typed — real copy should appear.
Generate an image on the postcard board to confirm the OpenAI key.
Then ROTATE any key that was ever shared in plaintext and re-run step 1 with the new value.
EOF
