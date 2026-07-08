-- Direct-mode usage recording: in DIRECT mode the BROWSER makes the model calls, so the client is
-- the only place that can log the generation/edit usage_events the monthly counter
-- (generations_this_month) and the Billing history read from. Until now only edge functions
-- (service role) could insert — so direct-mode users saw a "0/10 generations" counter that never
-- moved. Allow users to insert their OWN usage rows; select stays owner-or-admin as before.
drop policy if exists "usage insert own" on public.usage_events;
create policy "usage insert own" on public.usage_events
  for insert with check (user_id = auth.uid());
