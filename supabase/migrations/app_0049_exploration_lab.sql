-- app_0049_exploration_lab.sql — THE EXPLORATION LAB (additive, idempotent).
--
-- Three small schema moves carry the whole Lab:
--   1. richer thought vocabulary: the map can say WHAT a node is (claim / theory / evidence /
--      what-if scenario / experiment / insight), not just that it exists.
--   2. the honesty layer: knowledge_clusters.epistemic — how solid a node is. A beautiful map
--      must never make speculation look like fact; the label is data, not a disclaimer.
--   3. simulation records: a new artifact kind for reproducible Lab Bench runs (template +
--      user-set inputs + stated basis + outputs), attached to the exact branch that spawned them.
--
-- ALTER TYPE ... ADD VALUE is safe inside this transaction (PG 12+) because no new value is
-- used within this migration.

alter type cluster_kind add value if not exists 'claim';
alter type cluster_kind add value if not exists 'theory';
alter type cluster_kind add value if not exists 'evidence';
alter type cluster_kind add value if not exists 'scenario';
alter type cluster_kind add value if not exists 'experiment';
alter type cluster_kind add value if not exists 'insight';

alter type ku_artifact_kind add value if not exists 'simulation';

alter table public.knowledge_clusters add column if not exists epistemic text
  constraint knowledge_clusters_epistemic_check
  check (epistemic is null or epistemic in ('established','strong','plausible','disputed','speculative','fiction','hypothesis'));

comment on column public.knowledge_clusters.epistemic is
  'Exploration Lab honesty layer: how solid this node is. Null = not applicable (most topics).';
