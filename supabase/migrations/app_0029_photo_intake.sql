-- app_0029_photo_intake.sql — G2: photos enter the living brain as understanding, not blobs.
--
-- * documents.cluster_id  — filing gains cluster precision: a photo lands in "Artwork Library",
--                           not just somewhere in the world. Filing into a cluster also writes a
--                           cluster_files bridge row (client-side, brain.ts) so the studio sees it.
-- * cluster_files.caption — the vision caption travels with the file into every studio context.
-- * cluster_files.label   — the routing tag ('website' / 'social' / 'video' / 'print' / free text)
--                           that generators and the future build-bridge filter on.
--
-- Additive + idempotent. Apply after app_0026 (cluster studio) and app_0028 (genesis).

alter table public.documents add column if not exists cluster_id uuid references public.knowledge_clusters(id) on delete set null;
create index if not exists idx_documents_cluster on public.documents(cluster_id);

alter table public.cluster_files add column if not exists caption text;
alter table public.cluster_files add column if not exists label text;
