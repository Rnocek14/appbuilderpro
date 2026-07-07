// src/lib/garvis/runtime.ts
// The Garvis execution chassis: claim a queued run, then step a bounded loop — re-applying the
// per-mode tool gate every iteration, executing gated tools, checkpointing resumable state to the
// agent_runs row, and enforcing a hard budget cap. This is the job-worker pattern generalized to
// the portfolio. It carries NO reasoning of its own — the model seam decides what to do.
//
// Runs client-side (supervised, like src/lib/autopilot.ts), which fits this app's direct mode. An
// unattended edge variant (Deno + cron + service-role claim) is the documented follow-up.

import { supabase } from '../supabase';
import type { AgentRun, GarvisCheckpoint } from '../../types';
import { toolsFor } from './tools';
import { executeTool } from './executeTool';
import { recordMindEvent } from './mindStore';
import type { GarvisMessage, GarvisMode, GarvisToolContext, RunOptions } from './types';

const LEASE_MS = 10 * 60 * 1000;

/** Claim the caller's next runnable agent_run (atomic, leased). Returns null if the queue is empty. */
export async function claimNextRun(): Promise<AgentRun | null> {
  const { data, error } = await supabase.rpc('claim_next_agent_run');
  if (error) throw new Error(error.message);
  const rows = (data as AgentRun[] | null) ?? [];
  return rows[0] ?? null;
}

async function persist(runId: string, patch: Record<string, unknown>): Promise<void> {
  await supabase.from('agent_runs').update(patch).eq('id', runId);
}

/** Execute one claimed run to a terminal/paused state. Resolves when it finishes, pauses, or stops. */
export async function runGarvisTask(run: AgentRun, opts: RunOptions): Promise<void> {
  const maxSteps = opts.maxSteps ?? 12;
  const emit = opts.onEvent ?? (() => {});
  const mode: GarvisMode = run.phase ?? 'observe';
  const ctx: GarvisToolContext = { ownerId: run.owner_id, appId: run.app_id, runId: run.id };

  // Resume from checkpoint if one exists.
  const history: GarvisMessage[] = run.checkpoint?.history ? [...run.checkpoint.history] : [];
  let step = run.checkpoint?.step ?? 0;
  let spent = Number(run.spent_usd ?? 0);

  emit({ runId: run.id, step, phase: mode, status: 'started', detail: run.title });

  for (; step < maxSteps; step++) {
    if (opts.shouldStop?.()) {
      await persist(run.id, { status: 'paused', error: 'Stopped by user.', lease_until: null });
      emit({ runId: run.id, step, phase: mode, status: 'stopped' });
      return;
    }

    let decision;
    try {
      decision = await opts.model.decide({
        mode,
        task: { title: run.title, input: run.input },
        history,
        tools: toolsFor(mode),
        context: ctx,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await persist(run.id, { status: 'failed', error: msg.slice(0, 500), finished_at: new Date().toISOString(), lease_until: null });
      emit({ runId: run.id, step, phase: mode, status: 'error', detail: msg });
      // Failures are first-class evidence — append to the record (fire-and-forget, never blocks).
      void recordMindEvent(run.owner_id, {
        event_type: 'agent_run_failed',
        subject: `Run failed: ${run.title} — ${msg.slice(0, 140)}`,
        source: 'agent_run',
        app_id: run.app_id,
        payload: { run_id: run.id, mode },
      });
      return;
    }

    spent += Number(decision.costUsd ?? 0);

    if (decision.kind === 'await_approval') {
      await persist(run.id, {
        status: 'waiting_approval',
        spent_usd: spent,
        output: decision.question,
        checkpoint: { step, history } satisfies GarvisCheckpoint,
        lease_until: null,
      });
      emit({ runId: run.id, step, phase: mode, status: 'awaiting_approval', detail: decision.question });
      return;
    }

    if (decision.kind === 'finish') {
      await persist(run.id, {
        status: 'succeeded',
        output: decision.output,
        recommendation: decision.recommendation ?? null,
        spent_usd: spent,
        cost_usd: spent,
        finished_at: new Date().toISOString(),
        checkpoint: { step, history } satisfies GarvisCheckpoint,
        lease_until: null,
      });
      emit({ runId: run.id, step, phase: mode, status: 'finished', detail: decision.output });
      // Append the outcome to the record (fire-and-forget, never blocks the run).
      void recordMindEvent(run.owner_id, {
        event_type: 'agent_run_finished',
        subject: `Run finished: ${run.title}${decision.recommendation ? ` — rec: ${decision.recommendation.slice(0, 120)}` : ''}`,
        source: 'agent_run',
        app_id: run.app_id,
        payload: { run_id: run.id, mode, spent_usd: spent },
      });
      return;
    }

    // decision.kind === 'tools'
    for (const call of decision.calls) {
      const result = await executeTool(call, mode, ctx);
      history.push({ role: 'assistant', content: `call ${call.name}(${JSON.stringify(call.input)})` });
      history.push({ role: 'tool', content: JSON.stringify(result.output).slice(0, 4000) });
      emit({ runId: run.id, step, phase: mode, status: 'tool', detail: call.name });
    }

    // Checkpoint + renew lease after every step so a crash/reload resumes here.
    await persist(run.id, {
      spent_usd: spent,
      checkpoint: { step: step + 1, history } satisfies GarvisCheckpoint,
      lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
    });

    // Hard budget cap — don't let a runaway loop burn spend.
    if (spent >= Number(run.budget_usd ?? 0.5)) {
      await persist(run.id, { status: 'paused', error: `Budget cap of $${Number(run.budget_usd).toFixed(2)} reached.`, lease_until: null });
      emit({ runId: run.id, step, phase: mode, status: 'paused', detail: 'budget cap reached' });
      return;
    }
  }

  await persist(run.id, { status: 'paused', error: `Step cap of ${maxSteps} reached.`, lease_until: null });
  emit({ runId: run.id, step, phase: mode, status: 'paused', detail: 'step cap reached' });
}

/** Drain the queue: claim + run until empty, the user stops, or `max` runs complete. */
export async function drainQueue(opts: RunOptions & { max?: number }): Promise<number> {
  const max = opts.max ?? 10;
  let done = 0;
  for (; done < max; done++) {
    if (opts.shouldStop?.()) break;
    const run = await claimNextRun();
    if (!run) break;
    await runGarvisTask(run, opts);
  }
  return done;
}
