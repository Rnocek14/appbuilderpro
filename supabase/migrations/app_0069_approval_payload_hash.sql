-- app_0069_approval_payload_hash.sql — tamper-evidence binding for approvals. An approval records a
-- human decision about a SPECIFIC payload; this stores a deterministic SHA-256 of that payload at
-- creation so the executor can refuse if the payload changed after it was approved. Null-grandfathered
-- (older + worker-minted rows have no hash and skip the check). Additive + idempotent.

alter table public.approvals add column if not exists payload_hash text;
