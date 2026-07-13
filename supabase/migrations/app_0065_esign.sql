-- app_0065_esign.sql — AUTO-PAPERWORK + E-SIGNATURE. Rebuilt on Garvis's spines from the lakegen
-- audit (the source's send path was real; its OAuth UI, webhook wiring, and refresh flow were not):
--   paperwork_templates — the operator's own document templates ({{tokens}} merge with honest gaps)
--   esign_envelopes     — one row per signature request, driven ONLY through the approval spine
-- The enum value is added here and only USED at runtime. Owner RLS; world pinned when set.
-- Additive + idempotent.

alter type public.approval_kind add value if not exists 'send_for_signature';

create table if not exists public.paperwork_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid references public.knowledge_worlds(id) on delete set null,
  name        text not null,
  doc_kind    text not null default 'agreement',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.paperwork_templates enable row level security;
drop policy if exists "paperwork_templates owner all" on public.paperwork_templates;
create policy "paperwork_templates owner all" on public.paperwork_templates
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_paperwork_templates_owner on public.paperwork_templates(owner_id, updated_at desc);

create table if not exists public.esign_envelopes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  world_id     uuid references public.knowledge_worlds(id) on delete set null,
  template_id  uuid references public.paperwork_templates(id) on delete set null,
  title        text not null,
  merged_body  text not null,                  -- the exact text queued for signature (the record)
  recipients   jsonb not null default '[]',    -- [{name,email,status?,signedAt?}]
  provider     text not null default 'docusign',
  envelope_id  text,                           -- provider envelope id once sent
  status       text not null default 'queued' check (status in ('queued','sent','delivered','completed','declined','voided','failed')),
  approval_id  uuid references public.approvals(id) on delete set null,
  sent_at      timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.esign_envelopes enable row level security;
drop policy if exists "esign_envelopes owner all" on public.esign_envelopes;
create policy "esign_envelopes owner all" on public.esign_envelopes
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create index if not exists idx_esign_envelopes_owner on public.esign_envelopes(owner_id, created_at desc);
create index if not exists idx_esign_envelopes_envelope on public.esign_envelopes(envelope_id) where envelope_id is not null;
