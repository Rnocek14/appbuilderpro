// Pure mission execution helpers. The hook owns I/O; this module owns the two invariants that make
// a multi-step mission truthful: only VERIFIED upstream work may ground later tasks, and the mission
// status must be derived from its task outcomes rather than unconditionally called "review".

import type { GarvisTask, MissionStatus } from '../../types';

export function buildVerifiedHandoff(tasks: GarvisTask[], beforeSeq: number, maxChars = 10_000): string {
  const prior = tasks
    .filter((t) => t.seq < beforeSeq && t.status === 'done' && t.verify?.ok && t.result)
    .sort((a, b) => a.seq - b.seq);
  if (!prior.length) return '';

  const sections = prior.map((t) => {
    const result = t.result!;
    const artifacts = result.artifacts.map((a) => `### ${a.title} (${a.kind})\n${a.body}`).join('\n\n');
    return `## ${t.title}\n${result.summary}${artifacts ? `\n\n${artifacts}` : ''}`;
  });
  const body = `UPSTREAM VERIFIED HANDOFFS\nUse these completed deliverables as evidence for this task. Do not contradict them without saying why.\n\n${sections.join('\n\n')}`;
  return body.length <= maxChars ? body : `${body.slice(0, maxChars - 1)}…`;
}

export function deriveMissionStatus(tasks: GarvisTask[], cancelled = false): MissionStatus {
  if (cancelled) return 'cancelled';
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked').length;
  const active = tasks.some((t) => t.status === 'queued' || t.status === 'running');
  if (active) return 'running';
  if (done > 0 && failed > 0) return 'partial';
  if (failed > 0) return 'failed';
  if (done > 0) return 'review';
  return 'failed';
}
