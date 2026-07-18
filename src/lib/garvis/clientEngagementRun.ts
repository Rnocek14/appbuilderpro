// src/lib/garvis/clientEngagementRun.ts
// Client engagements, impure half: onboarding (engagement row + the client-world draft through
// the NORMAL genesis approval ceremony) and the Client book's mutations. The engagement is
// created first and unconditionally — a failed world draft never loses the client record; the
// draft can be re-run from the Businesses page and linked later.

import { supabase } from '../supabase';
import { intakeFor, clientWorldIntent, type ClientEngagement, type EngagementStatus, type IntakeItem } from './clientEngagement';
import { recordMindEvent } from './mindStore';

export interface OnboardResult {
  engagementId: string;
  intakeCount: number;
  /** Non-null when the genesis draft could not be created — the engagement still exists. */
  draftProblem: string | null;
}

export async function onboardClient(input: {
  clientName: string; business: string; scope: string; email?: string | null;
}): Promise<OnboardResult> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const clientName = input.clientName.trim();
  const business = input.business.trim();
  const scope = input.scope.trim();
  if (!clientName || !business || !scope) throw new Error('Client name, their business, and your scope are all required.');

  const intake = intakeFor(scope);
  const { data: row, error } = await supabase.from('client_engagements').insert({
    owner_id: uid, client_name: clientName, client_email: input.email?.trim() || null,
    business, scope, status: 'prospect', intake,
  }).select('id').single();
  if (error) throw new Error(`Could not open the engagement: ${error.message}`);

  // The client's world, through the normal draft→approve ceremony. Best-effort: the engagement
  // stands on its own if genesis is unavailable (no key, no credits) — honesty over ceremony.
  let draftProblem: string | null = null;
  try {
    const { generateDraft } = await import('./genesisRun');
    const res = await generateDraft(clientWorldIntent(clientName, business, scope));
    if (!res.id) draftProblem = res.problems[0] ?? 'The world draft could not be created.';
  } catch (e) {
    draftProblem = e instanceof Error ? e.message : 'The world draft could not be created.';
  }

  void recordMindEvent(uid, {
    event_type: 'note', source: 'client-book',
    subject: `Opened client engagement: ${clientName} (${scope}) — ${intake.length} intake item(s)${draftProblem ? '; world draft failed' : '; world draft ready for review'}`,
    payload: { engagement_id: (row as { id: string }).id, scope },
  });

  return { engagementId: (row as { id: string }).id, intakeCount: intake.length, draftProblem };
}

export async function listEngagements(): Promise<ClientEngagement[]> {
  const { data } = await supabase.from('client_engagements')
    .select('*').order('created_at', { ascending: false }).limit(200);
  return (data as ClientEngagement[]) ?? [];
}

export async function updateEngagement(id: string, patch: Partial<{
  status: EngagementStatus; intake: IntakeItem[]; notes: string; world_id: string | null;
}>): Promise<void> {
  const { error } = await supabase.from('client_engagements')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Worlds available to link (not already claimed by another engagement). */
export async function linkableWorlds(): Promise<{ id: string; title: string }[]> {
  const [{ data: worlds }, { data: takenRows }] = await Promise.all([
    supabase.from('knowledge_worlds').select('id, title').order('created_at', { ascending: false }).limit(100),
    supabase.from('client_engagements').select('world_id').not('world_id', 'is', null),
  ]);
  const taken = new Set(((takenRows ?? []) as { world_id: string }[]).map((r) => r.world_id));
  return ((worlds ?? []) as { id: string; title: string }[]).filter((w) => !taken.has(w.id));
}
