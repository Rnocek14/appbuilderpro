-- app_0101_email_shot_wiring.sql — SHOW the site in the pitch, don't just link it.
-- The outreach loop already had every piece EXCEPT the wiring: shot-worker can screenshot the
-- email-shot render of a preview site, but nothing called it and the result was never stored, and
-- send-email derived its HTML from plain text (so a real <img> could never ride in the body). These
-- two additive columns close both gaps:
--   * preview_sites.screenshot_url — the hosted PNG of the generated site (the hero of the email).
--     Persisted so the operator UI can show it, it can be reused on re-send, and a rebuild refreshes
--     it. NULL when no screenshot could be produced (SCREENSHOT_API_KEY unset / API error) — the
--     pitch then falls back to the honest text+link email; we never fabricate or break an image.
--   * outreach_messages.body_html — an optional custom HTML body (the screenshot pitch). When set,
--     send-email sends it verbatim (+ an HTML CAN-SPAM footer); when NULL, send-email keeps deriving
--     HTML from body_text exactly as before. No behaviour changes for any existing message.
-- Both columns are nullable and additive; re-running is safe.

alter table public.preview_sites   add column if not exists screenshot_url text;
alter table public.outreach_messages add column if not exists body_html text;
