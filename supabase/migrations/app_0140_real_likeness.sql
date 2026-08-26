-- app_0140_real_likeness.sql — REAL PEOPLE IN THE CAST, behind a consent gate. A character can now
-- carry a real person's likeness (uploaded photos as the canonical references — the operator's
-- friends, a willing spokesperson) instead of a synthetic face. The honesty rule is structural,
-- not vibes: a 'real' character CANNOT be sent to a renderer until consent is recorded — enforced
-- server-side in generate-clip (fail-closed, the disclosure-gate pattern), and every generated
-- video of them still carries the AI provenance stamp + published disclosure like all AI media.
-- Additive + idempotent.

alter table public.media_characters
  add column if not exists likeness text not null default 'synthetic'
    check (likeness in ('synthetic', 'real'));
alter table public.media_characters
  add column if not exists consent_note text;      -- who consented and how ("Jake — said yes 8/26, text thread")
alter table public.media_characters
  add column if not exists consented_at timestamptz;  -- null on a 'real' character = generation refuses
