// Client-side re-export of the approval TTL core (house pattern: the one implementation lives
// in supabase/functions/_shared/approvalTtl.ts, shared with every worker-side mint site).
export * from '../../../supabase/functions/_shared/approvalTtl';
