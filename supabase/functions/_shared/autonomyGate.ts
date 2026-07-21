// supabase/functions/_shared/autonomyGate.ts
// The server half of earned autonomy (app_0097): may THIS owner's THIS class self-approve right
// now? True only when an explicit operator grant is in auto mode AND today's auto-approved count
// for the class is under its daily cap. Fail-closed: any error means "manual" — a broken table
// can only ever produce MORE human review, never less.

/** Execute a just-minted auto-approved send through THE ONE SEND PATH (every gate re-runs
 *  there). Best-effort: a failure leaves an approved-but-unsent approval visible in the Queue. */
export async function executeSendNow(approvalId: string): Promise<void> {
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: {
      'content-type': 'application/json',
      'x-worker-secret': Deno.env.get('WORKER_SECRET') ?? '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ approval_id: approvalId }),
  }).catch(() => {});
}

// deno-lint-ignore no-explicit-any
export async function autonomyAllowed(admin: any, ownerId: string, actionClass: string): Promise<boolean> {
  try {
    const { data: grant, error } = await admin.from('autonomy_grants')
      .select('mode, daily_cap').eq('owner_id', ownerId).eq('action_class', actionClass).maybeSingle();
    if (error || !grant || (grant as { mode: string }).mode !== 'auto') return false;
    const cap = (grant as { daily_cap: number }).daily_cap ?? 5;
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: cErr } = await admin.from('approvals')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId).eq('decided_via', 'autonomy_grant')
      .contains('payload', { autonomy_class: actionClass })
      .gte('decided_at', dayStart.toISOString());
    if (cErr) return false;
    return (count ?? 0) < cap;
  } catch {
    return false;
  }
}
