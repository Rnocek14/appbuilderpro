// src/lib/garvis/dataRun.ts
// Impure half of the Data & Numbers workspace: the ONE model call, and it is deliberately small.
// Everything numeric — parsing, statistics, aggregation — is done in pure code (data.ts) and rendered
// without any AI (the zero-keys floor). The model is invoked only to INTERPRET the already-computed
// fact sheet, and DATA_SYSTEM forbids it from stating or computing any number that isn't there. So a
// hallucinated figure can't reach a chart or a stat — the model never touches the arithmetic.

import { supabase } from '../supabase';
import { describe, dataFacts, DATA_SYSTEM, buildDataUser, type Table } from './data';

export interface Analysis {
  narrative: string; // the model's plain-language read of the computed facts ('' if it returned nothing)
  facts: string;     // the deterministic fact sheet it was grounded in (stands on its own)
  costUsd: number;
}

/** Narrate what the numbers show, grounded ONLY in the computed fact sheet. Throws on a model error
 *  so the workspace can show it honestly rather than fabricate a reading. */
export async function narrateData(input: { table: Table; question?: string }): Promise<Analysis> {
  const facts = dataFacts(input.table, describe(input.table));
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system: DATA_SYSTEM, context: '', history: [], message: buildDataUser(input.question ?? '', facts) },
  });
  if (error) throw new Error(error.message);
  const narrative = ((data as { text?: string })?.text ?? '').trim();
  const costUsd = ((data as { costUsd?: number })?.costUsd) ?? 0;
  return { narrative, facts, costUsd };
}
