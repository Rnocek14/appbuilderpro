// supabase/functions/_shared/credits.ts
// The ONE credit chokepoint every AI-calling edge function goes through, so "everything that spends
// our API money spends the user's credits" is enforced structurally, not by remembering per feature.
//
//   checkCredits(admin, userId, kind)  — BEFORE the AI call. Refreshes the monthly window and rejects
//                                        (InsufficientCreditsError) if the balance can't cover a
//                                        conservative estimate for this kind of action.
//   spendCredits(admin, userId, {...})  — AFTER the call, with the REAL cost. Atomically deducts credits
//                                        (proportional to cost) and logs the usage_events row.
//
// Backed by the refresh_credits / spend_credits SQL functions (app_0017_credits.sql). Kept dependency-
// light: the admin client is typed structurally so this imports nothing.

/** Minimal structural shape of the service-role Supabase client (avoids importing the SDK type).
 *  `.rpc()` returns a thenable query builder, not a plain Promise — hence PromiseLike. */
interface Admin {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type CreditKind =
  | 'generation' | 'edit' | 'agent' | 'garvis' | 'short_script' | 'research' | 'plan' | 'discover' | 'explore'
  | 'app_ai'   // a generated app's runtime AI call through the FableForge AI gateway
  | 'render' | 'screenshot' | 'ads_sync'  // operator-paid media/reporting seams (audit M2: unmetered before)
  | 'image';   // one AI image generation (OpenAI gpt-image-1)

// Conservative pre-call estimate (in credits; 1 credit ≈ $0.01 of cost). Used ONLY to reject a start
// when the balance clearly can't cover it — the real charge uses actual cost after the call.
const KIND_ESTIMATE: Record<CreditKind, number> = {
  generation: 60,   // a full app build
  edit: 15,         // one chat edit
  agent: 12,        // ONE agentic turn (the loop makes several; each is checked)
  garvis: 10,       // a brain decision step
  short_script: 8,
  research: 20,     // includes web search
  plan: 10,         // draft-plan
  discover: 8,      // media/search discovery
  explore: 3,       // one Explorer turn (overview/leads/think — small, frequent calls)
  app_ai: 2,        // one runtime AI call from a generated app (gateway; small, frequent)
  render: 25,       // one video render (Shotstack) — flat provider fee
  screenshot: 3,    // one server screenshot (ScreenshotOne)
  ads_sync: 2,      // one ad-platform metrics pull
  image: 10,        // one AI image (gpt-image-1, medium) — conservative reject threshold
};

export class InsufficientCreditsError extends Error {
  status = 402 as const;
  constructor(public remaining: number) {
    super("You're out of credits. Upgrade your plan or wait for your monthly refill to keep building.");
    this.name = 'InsufficientCreditsError';
  }
}

/** The user's plan ('free' | 'starter' | 'pro'), defaulting to 'free'. Drives model selection.
 *  `admin.from` is typed loosely (=> any) on purpose: the full supabase-js query-builder type is so
 *  deep that matching it structurally trips TS's "excessively deep" guard at every call site. */
// deno-lint-ignore no-explicit-any
export async function getUserPlan(admin: { from: (table: string) => any }, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('plan').eq('id', userId).single();
  return (data?.plan as string | undefined) ?? 'free';
}

/** Refresh the monthly window and ensure the user can afford `kind`. Throws InsufficientCreditsError. */
export async function checkCredits(admin: Admin, userId: string, kind: CreditKind): Promise<number> {
  const { data, error } = await admin.rpc('refresh_credits', { p_user: userId });
  if (error) throw new Error(`credits check failed: ${error.message}`);
  const balance = typeof data === 'number' ? data : Number(data) || 0;
  if (balance < (KIND_ESTIMATE[kind] ?? 5)) throw new InsufficientCreditsError(balance);
  return balance;
}

/** Charge the real cost of a completed action and log it. Returns the remaining balance. Never throws
 *  (a completed AI call shouldn't fail because the ledger write hiccuped — it logs and returns 0). */
export async function spendCredits(
  admin: Admin, userId: string,
  opts: { costUsd: number; kind: CreditKind | string; provider?: string; model?: string; inputTokens?: number; outputTokens?: number; projectId?: string },
): Promise<number> {
  const { data, error } = await admin.rpc('spend_credits', {
    p_user: userId,
    p_cost: opts.costUsd ?? 0,
    p_kind: opts.kind,
    p_provider: opts.provider ?? null,
    p_model: opts.model ?? null,
    p_in: opts.inputTokens ?? 0,
    p_out: opts.outputTokens ?? 0,
    p_project: opts.projectId ?? null,
  });
  if (error) { console.error('spend_credits failed:', error.message); return 0; }
  return typeof data === 'number' ? data : Number(data) || 0;
}
