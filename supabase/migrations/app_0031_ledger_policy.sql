-- app_0031_ledger_policy.sql — the honest ledger must actually land.
-- The audit found the client-side "decision recorded" execution_runs insert (execution.ts,
-- non-email approval kinds) is rejected by RLS: owners had no INSERT policy on execution_runs
-- (service-role edge functions write the rest). Grant a NARROW owner insert: only their own
-- rows, only the 'garvis' connector, only 'skipped' status — decision records, never fake
-- successes. Everything else still writes through service-role executors.

drop policy if exists "execution_runs owner decision insert" on public.execution_runs;
create policy "execution_runs owner decision insert" on public.execution_runs
  for insert with check (owner_id = auth.uid() and connector = 'garvis' and status = 'skipped');
