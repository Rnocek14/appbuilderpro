-- app_0126_episode_draft_order.sql — THE CHANNEL CLOCK. 'episode_draft' standing orders draft one
-- cited fact-script per tick for a growth channel (config.channel_id), fed by the channel's own
-- hook intel — so daily cadence stops being operator discipline. DRAFT-ONLY by the standing-order
-- honesty rule: the worker spends model credits exactly like idea_stream/content_week but never
-- illustrates, renders, or posts — the operator reviews, produces, and approves. (app_0088 shape.)
alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt', 'area_study', 'episode_draft'));
