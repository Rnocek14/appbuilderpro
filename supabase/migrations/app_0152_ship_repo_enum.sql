-- app_0152_ship_repo_enum.sql — the ship_repo approval kind (SW10.1): exporting a project's
-- source to GitHub becomes an outward action on the spine, not a raw function call.
--
-- ENUM ALTER ALONE IN ITS FILE (the app_0064/app_0112 discipline): ALTER TYPE ... ADD VALUE
-- cannot run in the same transaction that later uses the value, so the enum change ships by
-- itself and the consumers (client kind union, github-export executor) reference it only at
-- runtime. Additive + idempotent.

alter type public.approval_kind add value if not exists 'ship_repo';
