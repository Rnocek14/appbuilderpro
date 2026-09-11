// Client-side re-export of the direct-mail core (house pattern: the one implementation lives in
// supabase/functions/_shared/lobCore.ts, shared with the lob-verify edge function so the cost
// preview the operator sees is the arithmetic the function enforces).
export * from '../../../supabase/functions/_shared/lobCore';
