-- docs/automation-triggers-seed.sql
-- Seed a tiny test list so you can watch the trigger engine fire end-to-end, WITHOUT the UI.
-- Prereq: apply the migrations first (supabase db push, or paste app_0074/0075/0076 into the SQL editor).
--
-- HOW TO USE
--   1. Replace the owner_id below with YOUR profiles.id:
--        select id, email from public.profiles where email = 'you@example.com';
--   2. Run this whole file in the Supabase SQL editor.
--   3. In the app, open Automations → "Run due now" (or call runTriggersForOwner()) — the customers
--      whose last_visit_at is ~180 days ago land in your Queue as approval-gated sends. Approve to send.
--
-- The dates below are written relative to now() so at least one customer is due the moment you seed.

do $$
declare
  v_owner  uuid := '00000000-0000-0000-0000-000000000000';  -- <<< REPLACE with your profiles.id
  v_list   uuid;
  v_trig   uuid;
begin
  insert into public.customer_lists (owner_id, name, source)
    values (v_owner, 'Test patients', 'manual')
    returning id into v_list;

  -- due now (last visit ~180d ago), due recently (185d), not yet due (100d), no email (skipped)
  insert into public.customers (owner_id, list_id, email, name, last_visit_at, consent_basis, consent_at) values
    (v_owner, v_list, 'ada@example.com', 'Ada Lovelace', (now() - interval '180 days')::date, 'warm_transactional', now()),
    (v_owner, v_list, 'bo@example.com',  'Bo Peep',      (now() - interval '185 days')::date, 'warm_transactional', now()),
    (v_owner, v_list, 'cy@example.com',  'Cy Young',     (now() - interval '100 days')::date, 'warm_transactional', now());

  insert into public.automation_triggers
    (owner_id, list_id, capability_id, label, anchor_field, offset_days, window_days, template_subject, template_body, status)
    values (
      v_owner, v_list, 'hygiene_recall', '6-month recall reminders',
      'last_visit_at', 180, 21,
      'You’re due for a visit, {first_name}',
      'Hi {first_name},' || chr(10) || chr(10) ||
        'Our records show it’s been about six months since your last visit — you’re due for your routine check-up. Reply here and we’ll find a time.' || chr(10) || chr(10) || 'Thank you!',
      'active')
    returning id into v_trig;

  raise notice 'Seeded list % with 3 customers and trigger %. Two should be due; run the engine.', v_list, v_trig;
end $$;
