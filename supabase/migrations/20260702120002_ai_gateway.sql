-- FableForge AI gateway: generated apps get server-side AI with NO app-owner API keys.
-- Each project gets a random gateway key (issued at backend deploy, pushed to the app's Function
-- Secrets as FABLEFORGE_AI_KEY); the ai-gateway function maps key -> project -> owner and meters
-- every call against the owner's credit balance. This is the Lovable AI model: their apps run on
-- OUR key, charged through OUR credits.
alter table public.projects add column if not exists ai_gateway_key text unique;
create index if not exists projects_ai_gateway_key_idx on public.projects (ai_gateway_key) where ai_gateway_key is not null;
