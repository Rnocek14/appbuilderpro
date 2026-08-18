// Client-side re-export of the inbox-placement core (house pattern: the one implementation lives
// in supabase/functions/_shared/emailPlacementCore.ts, shared with send-email's shortener gate and
// the standing-worker's sunset rule — the findings the operator sees while writing are computed by
// the same code the server enforces).
export * from '../../../../supabase/functions/_shared/emailPlacementCore';
