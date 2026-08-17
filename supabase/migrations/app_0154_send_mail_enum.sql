-- app_0154_send_mail_enum.sql — the send_mail approval kind (SW10.3): a Lob postcard drop is an
-- outward action on the spine. Enum ALTER alone in its file (the app_0064/app_0152 discipline).
-- Additive + idempotent.

alter type public.approval_kind add value if not exists 'send_mail';
