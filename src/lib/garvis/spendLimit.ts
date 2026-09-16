// src/lib/garvis/spendLimit.ts
// The client half of the spending limit: a thin re-export of the shared pure core, plus the one
// impure thing — reading the owner's own guard state — and a reader that turns ANY failed edge
// invoke into an honest sentence.
//
// The shared core is the point. The gate that refuses a call and the screen that explains the
// refusal now use the same sentence, so they cannot disagree about what happened or about which
// control fixes it.

import { supabase } from '../supabase';
import {
  parseGuard, limitReached, limitMessage, classifyFailure, isLimitFailure,
  spendTone, fractionUsed, spendLine,
  type GuardState, type LimitKind, type SpendTone,
} from '../../../supabase/functions/_shared/spendLimitCore';

export {
  limitReached, limitMessage, classifyFailure, isLimitFailure, spendTone, fractionUsed, spendLine,
};
export type { GuardState, LimitKind, SpendTone };

/** Read this owner's own limit and what they have spent against it. Null when it cannot be read —
 *  the caller shows nothing rather than inventing a number, because a wrong spending figure is
 *  worse than none. */
export async function loadSpendState(): Promise<GuardState | null> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.rpc('spend_guard_state', { p_user: uid });
  if (error) return null;
  return parseGuard(data);
}

/** What actually went wrong with a `supabase.functions.invoke`, in words.
 *
 *  supabase-js reports any non-2xx as the useless "Edge Function returned a non-2xx status code",
 *  with the function's real answer hidden on `error.context`. That is how a spending limit came to
 *  read, on the Businesses-to-pitch screen, as "The search could not run — add your Claude key":
 *  the client never opened the envelope, so the honest 402 underneath was invisible and the fallback
 *  sent people to fix a key that was already fine.
 *
 *  Returns the message and, when the failure was a limit rather than a breakage, which one. */
export async function readInvokeFailure(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<{ message: string; limit: LimitKind }> {
  // Some functions answer 200 with `{ error }` in the body; others use a real status code.
  const inBody = (data as { error?: string } | null)?.error;
  if (inBody) return { message: inBody, limit: classifyFailure(inBody) };

  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    const body = (await ctx.clone().json().catch(() => null)) as { error?: string; code?: LimitKind } | null;
    if (body?.error) {
      // A `code` from the function beats reading the prose; the prose is the fallback for the
      // functions that do not send one yet.
      return { message: body.error, limit: body.code && body.code !== 'none' ? body.code : classifyFailure(body.error) };
    }
  }

  const msg = error instanceof Error ? error.message : error ? String(error) : '';
  if (msg && !/non-2xx|Failed to send a request|Failed to fetch/i.test(msg)) {
    return { message: msg, limit: classifyFailure(msg) };
  }
  return { message: fallback, limit: 'none' };
}
