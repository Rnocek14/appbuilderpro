-- SENDER DOMAINS — per-brand verified sending domains (deliverability). A client's emails should come
-- FROM their own domain with real SPF/DKIM/DMARC, or they land in spam — existential for an outreach
-- business. This models a domain the operator registers with the email provider (Resend): we store the
-- provider's domain id, the DNS records the client must add, and the live verification status. Once
-- verified, that brand's from-address (world_sender_identities.from_email @ this domain) actually
-- delivers. Additive + idempotent; nothing here sends — send-email keeps its own gates.

create table if not exists public.sender_domains (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references public.profiles(id) on delete cascade,
  -- Optional brand/client this domain sends for. world_id ties it to the sender identity used at send
  -- time; client_subscription_id lets the connections checklist light up the right client. Both nullable
  -- so a domain can exist before it's attached to either.
  world_id               uuid references public.knowledge_worlds(id) on delete set null,
  client_subscription_id uuid references public.client_subscriptions(id) on delete set null,
  domain                 text not null,                       -- bare host, lowercased (theirdomain.com)
  provider               text not null default 'resend',
  provider_domain_id     text,                                -- the provider's domain id (Resend)
  status                 text not null default 'not_started'
                           check (status in ('not_started', 'pending', 'verified', 'failure', 'temporary_failure')),
  records                jsonb not null default '[]'::jsonb,  -- the DNS records the client must add (SPF/DKIM/DMARC)
  last_checked_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- One row per domain per operator — connect + refresh both key on it.
  unique (owner_id, domain)
);
create index if not exists idx_sender_domains_owner on public.sender_domains(owner_id, created_at desc);
create index if not exists idx_sender_domains_client on public.sender_domains(client_subscription_id);

alter table public.sender_domains enable row level security;
drop policy if exists "sender_domains owner all" on public.sender_domains;
create policy "sender_domains owner all" on public.sender_domains
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
