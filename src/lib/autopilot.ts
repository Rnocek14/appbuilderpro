// src/lib/autopilot.ts
// Supervised autopilot: a bounded, stoppable loop that composes the intelligence pieces —
// decide next step (Brain + Map + Roadmap + code) → build it → Check → fix → repeat.
// Runs client-side while the workspace is open. Pauses for decisions; never runs unbounded.

import { decideNextStep, sendEdit } from './aiClient';
import { runQA, issuesToFixRequest } from './projectQA';
import { generateProjectMap } from './aiClient';

export interface AutopilotEvent {
  n: number;
  title: string;
  status: 'deciding' | 'building' | 'checking' | 'fixing' | 'done' | 'error' | 'blocked' | 'finished';
  detail?: string;
}

export interface AutopilotOptions {
  maxSteps: number;
  shouldStop: () => boolean;       // checked between steps for pause/stop
  onEvent: (e: AutopilotEvent) => void;
  maxFixAttempts?: number;         // default 2
}

/** Run the supervised loop. Resolves when it finishes, is stopped, or hits a decision/error. */
export async function runAutopilot(projectId: string, opts: AutopilotOptions): Promise<void> {
  const maxFix = opts.maxFixAttempts ?? 2;
  const done: string[] = [];

  for (let n = 1; n <= opts.maxSteps; n++) {
    if (opts.shouldStop()) { opts.onEvent({ n, title: 'Stopped', status: 'finished' }); return; }

    opts.onEvent({ n, title: 'Deciding next step…', status: 'deciding' });
    const next = await decideNextStep(projectId, done);

    if (next.action === 'done') {
      opts.onEvent({ n, title: 'Nothing left in scope', status: 'finished', detail: next.rationale });
      break;
    }
    if (next.action === 'ask') {
      opts.onEvent({ n, title: next.title, status: 'blocked', detail: next.question });
      return; // a decision is needed — stop and let the user answer in chat
    }

    // build
    opts.onEvent({ n, title: next.title, status: 'building', detail: next.rationale });
    const instruction = `${next.instruction ?? next.title}\n\n(Make this specific change now — do not propose a plan or ask.)`;
    const result = await sendEdit(projectId, instruction);
    if (result.action !== 'edit') {
      // The model wanted to plan/ask/discuss instead of editing — surface and pause.
      opts.onEvent({ n, title: next.title, status: 'blocked', detail: `Needs your input (${result.action}).` });
      return;
    }

    // check (deterministic) + bounded fix loop
    opts.onEvent({ n, title: next.title, status: 'checking' });
    let issues = await runQA(projectId);
    let errs = issues.filter((i) => i.severity === 'error');
    for (let f = 0; f < maxFix && errs.length && !opts.shouldStop(); f++) {
      opts.onEvent({ n, title: next.title, status: 'fixing', detail: `${errs.length} issue(s)` });
      await sendEdit(projectId, issuesToFixRequest(issues));
      issues = await runQA(projectId);
      errs = issues.filter((i) => i.severity === 'error');
    }

    done.push(next.title);
    opts.onEvent({
      n, title: next.title,
      status: errs.length ? 'error' : 'done',
      detail: errs.length ? `${errs.length} issue(s) unresolved` : next.rationale,
    });
  }

  // Refresh the map so it reflects everything autopilot built.
  await generateProjectMap(projectId).catch(() => {});
  opts.onEvent({ n: 0, title: 'Autopilot run complete', status: 'finished' });
}
