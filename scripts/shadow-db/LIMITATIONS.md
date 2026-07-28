# What the shadow database does NOT validate

**Read this before quoting "all 128 migrations applied and 46 checks passed."** That sentence is
true and it is narrow. The harness runs stock PostgreSQL 16 with Supabase's platform pieces
**shimmed** (`00-supabase-shim.sql`). The shims are deliberately behaviour-free so that what is
under test is *our* DDL, constraints, triggers, policies and query assumptions — never Supabase's
runtime. A green run means **our schema is internally sound**, not that the production stack was
reproduced.

## Shimmed — behaviour NOT tested

| Shimmed | What is therefore unproven |
|---|---|
| **pgvector** (`vector` is a text domain; HNSW index replaced; `<=>` removed) | Real vector dimensions and typmods, cosine distance correctness, HNSW build/recall, index size and query planning, the true behaviour of `match_embeddings` ranking |
| **pg_cron** (a table + stub `schedule`/`unschedule`) | That jobs actually fire, cron expression semantics, overlapping ticks, missed windows, job-level failures, the real `cron.job` shape, `garvis_arm_heartbeat()` producing *running* jobs rather than rows |
| **pg_net** (stub `http_post` returning 1) | That workers are actually invoked, request headers/secrets reaching functions, timeouts, retries, failure visibility — **the entire clock→worker link is untested** |
| **Vault** (plain table + view) | Encryption at rest, `vault.decrypted_secrets` permissions, secret rotation, who can read what |
| **Supabase Auth** (`auth.users` + `auth.uid()` reading a JWT claim setting) | Real JWT claim shapes and nesting, `auth.role()`, anon vs authenticated vs service_role behaviour, the real signup trigger payload (`raw_user_meta_data`), session expiry |
| **Storage** (`buckets`/`objects` tables + path helpers) | Bucket policies, object-level RLS, signed URLs, upload/download paths, the published-HTML stash the sale flow depends on |
| **PostgREST** (not present at all) | **JSON wire format** — object vs array embeds, nested/aliased embeds, null-relationship shapes, filter and `count` semantics, RPC serialization, error payloads, and RLS as experienced through HTTP |

## Also not tested here

- **Realistic volume and performance.** Every table has a handful of rows; no query plan here
  means anything about 10k rows or the fleet's six gathers at scale.
- **Concurrency.** No parallel writers, no lock contention, no claim races (the CAS/claim-first
  patterns are exercised logically in the verify suites, not under real contention).
- **Migration ordering on a *fresh production* project**, including permissions the platform
  applies (the harness runs as a local superuser; production applies as a less-privileged role).
- **Anything crossing a network boundary**: Stripe signatures and redelivery, Resend delivery/
  bounce, Twilio, webhook duplication and out-of-order arrival, provider timeouts and rate limits.

## The one finding this harness *did* record about scope

`21-isolation-negatives.sql` proves owner isolation holds on every read, update, delete and the
credit/vector RPCs. It also records an honest boundary: **`world_id` is not itself an
authorization boundary — `owner_id` is.** A second owner can insert a row that *references*
another owner's world under their own `owner_id` (they only pollute their own view; they still
cannot read the other owner's rows). For the single-operator product this is not exploitable, but
any multi-operator or delegated-access future must add world-ownership checks to the `WITH CHECK`
half of the policies. Recorded, not silently accepted.

## Where each layer of trust actually comes from

| Layer | Proves | Cannot prove |
|---|---|---|
| `verify:*` suites (197 checks) | Business logic, state machines, honesty invariants | That the database or the wire agrees |
| **This harness** (46 checks) | DDL applies, constraints/triggers fire, RLS isolates, FK cardinality, SQL query shapes | Anything shimmed above; the HTTP layer; scale |
| **PostgREST-in-the-loop** (next; not built) | Real JSON shapes, embeds, RPC and RLS through HTTP | Providers, cron, real data |
| **Live pilot** (one client, staged) | The whole runtime, providers, clock, operational reality | — |

*If you extend the harness, extend this file in the same commit. The danger this file exists to
prevent is someone later reading a green run as "production-equivalent."*
