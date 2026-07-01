# scripts/setup-connections.ps1
# Deploys the seamless-connections cloud features (C1-C3: Supabase + GitHub OAuth, per-app provisioning).
# Run this AFTER you've: installed the Supabase CLI, `supabase login`, and `supabase link --project-ref <studio-ref>`.
#   powershell -ExecutionPolicy Bypass -File scripts/setup-connections.ps1
$ErrorActionPreference = 'Stop'

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Write-Host "Supabase CLI not found." -ForegroundColor Yellow
  Write-Host "  Install: scoop install supabase   (or see https://supabase.com/docs/guides/cli)"
  Write-Host "  Then:    supabase login;  supabase link --project-ref <your-studio-ref>"
  exit 1
}

Write-Host "== Deploying edge functions ==" -ForegroundColor Cyan
supabase functions deploy connections oauth provision-supabase apply-migration deploy-backend github-export
if (-not $?) { Write-Host "Function deploy failed (are you logged in + linked?)." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Functions deployed. Now finish these (only you can — they need your account/browser):" -ForegroundColor Green
Write-Host ""
Write-Host "1) Apply the DB tables (pick ONE):"
Write-Host "     supabase db push"
Write-Host "     -- OR, if db push complains about migration history, paste these into the SQL editor:"
Write-Host "        supabase/migrations/app_0014_connections.sql"
Write-Host "        supabase/migrations/app_0015_oauth_states.sql"
Write-Host ""
Write-Host "2) Set the OAuth edge secrets (your real values):"
Write-Host "     supabase secrets set SUPABASE_OAUTH_CLIENT_ID=...  SUPABASE_OAUTH_CLIENT_SECRET=..."
Write-Host "     supabase secrets set GITHUB_OAUTH_CLIENT_ID=...    GITHUB_OAUTH_CLIENT_SECRET=..."
Write-Host ""
Write-Host "3) Add this redirect URI to BOTH OAuth apps (Supabase + GitHub):"
Write-Host "     http://localhost:5173/oauth/callback"
Write-Host ""
Write-Host "4) npm run dev -> Settings > Connections > Connect Supabase, Connect GitHub"
Write-Host "   -> open a project -> Set up database -> Export to GitHub"
