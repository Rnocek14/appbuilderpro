// Client-side re-export of the email-flows core (house pattern: the one implementation lives in
// supabase/functions/_shared/emailFlowsCore.ts, shared with the standing-worker's flow sweep so
// the segment the operator previews is the segment the clock enrolls).
export * from '../../../supabase/functions/_shared/emailFlowsCore';
