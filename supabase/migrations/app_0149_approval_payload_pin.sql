-- app_0149_approval_payload_pin.sql — DEEP REVIEW 2026-08 fix #2 (docs/reviews/deep-review-2026-08.md).
-- The tamper-evidence off-switch, closed: payloadMatches() passes on a null hash (the grandfather
-- for legacy/worker rows), and the owner-`for all` approvals policy allowed UPDATEing payload +
-- payload_hash on rows of ANY status — so an owner-session compromise could null the hash on an
-- approved-but-retryable row (deploy_backend's 207 window) and re-point the decision at attacker
-- content. This trigger makes the decided payload IMMUTABLE: once an approval leaves 'pending',
-- its payload and payload_hash can never change — for clients AND the service role alike (no
-- legitimate flow edits a decided payload; executors only ever write status/result columns).
-- The grandfather now means only what it was scoped to mean: "minted without a hash", never
-- "hash removed after the decision". Additive + idempotent.

create or replace function public.approvals_pin_payload()
returns trigger language plpgsql as $$
begin
  if old.status <> 'pending'
     and (new.payload is distinct from old.payload or new.payload_hash is distinct from old.payload_hash) then
    raise exception 'approvals: payload and payload_hash are immutable once the decision is made';
  end if;
  return new;
end $$;

drop trigger if exists trg_approvals_pin_payload on public.approvals;
create trigger trg_approvals_pin_payload before update on public.approvals
  for each row execute function public.approvals_pin_payload();
