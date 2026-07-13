// src/lib/garvis/timelines.ts
// TRANSACTION TIMELINES — pure core (verified by timelines.verify.ts). A timeline is a checklist
// instantiated from a template: each step's due date = anchor date + offset days. HONESTY: the
// offsets are CONVENTIONS, not law — real deadlines live in the actual contract, so every template
// carries an adjust-to-your-contract note, the UI must show it, and nothing here claims legal
// authority. Overdue is computed against an injected "now" (determinism), and a done step is never
// overdue. The impure half is timelinesRun.ts; steps can become firing reminders there.

export type TimelineKind = 'listing' | 'purchase';

export interface StepTemplate { title: string; offsetDays: number }

export interface TimelineTemplate {
  label: string;
  anchorLabel: string;   // what date the offsets count from
  note: string;          // the honesty line the UI must render
  steps: StepTemplate[];
}

export const TIMELINE_TEMPLATES: Record<TimelineKind, TimelineTemplate> = {
  listing: {
    label: 'Listing → live',
    anchorLabel: 'target go-live date',
    note: 'Typical prep cadence — adjust every date to your actual plan; none of these are contractual.',
    steps: [
      { title: 'Photos + prep scheduled', offsetDays: -7 },
      { title: 'Disclosures + paperwork signed', offsetDays: -3 },
      { title: 'Listing goes live', offsetDays: 0 },
      { title: 'First open house', offsetDays: 4 },
      { title: 'Follow up with every showing', offsetDays: 7 },
      { title: 'Seller check-in: activity + feedback', offsetDays: 14 },
      { title: 'Price/strategy review if no offers', offsetDays: 21 },
    ],
  },
  purchase: {
    label: 'Contract → close',
    anchorLabel: 'contract acceptance date',
    note: 'Common-convention offsets — YOUR contract sets the real deadlines; adjust each date to match it.',
    steps: [
      { title: 'Earnest money delivered', offsetDays: 3 },
      { title: 'Inspection scheduled', offsetDays: 5 },
      { title: 'Inspection contingency resolved', offsetDays: 12 },
      { title: 'Appraisal ordered', offsetDays: 14 },
      { title: 'Title work ordered', offsetDays: 18 },
      { title: 'Financing commitment', offsetDays: 30 },
      { title: 'Clear to close confirmed', offsetDays: 40 },
      { title: 'Final walkthrough', offsetDays: 43 },
      { title: 'Closing', offsetDays: 45 },
    ],
  },
};

export interface PlannedStep { title: string; offsetDays: number; dueDate: string; position: number }

/** Date-only math: anchor (YYYY-MM-DD) + offset days → YYYY-MM-DD. */
export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Instantiate a template against an anchor date. Steps come out due-date ordered. */
export function instantiateTimeline(kind: TimelineKind, anchorDate: string): PlannedStep[] {
  const t = TIMELINE_TEMPLATES[kind];
  return t.steps
    .map((s) => ({ title: s.title, offsetDays: s.offsetDays, dueDate: addDays(anchorDate, s.offsetDays) }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .map((s, i) => ({ ...s, position: i }));
}

export interface StepState { title: string; dueDate: string | null; done: boolean }

/** A step is overdue when it has a due date strictly before today (owner-local date passed in),
 *  and is not done. Done steps are NEVER overdue. */
export function isOverdue(step: StepState, todayIso: string): boolean {
  if (step.done || !step.dueDate) return false;
  return step.dueDate.slice(0, 10) < todayIso.slice(0, 10);
}

export function overdueCount(steps: StepState[], todayIso: string): number {
  return steps.filter((s) => isOverdue(s, todayIso)).length;
}

/** The next thing to do: the earliest not-done step (by due date, undated last). */
export function nextStep<T extends StepState>(steps: T[]): T | null {
  const open = steps.filter((s) => !s.done);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate == null) return 1;
    if (b.dueDate == null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  })[0];
}

/** One honest line: real counts, overdue named, done says done. */
export function timelineLine(steps: StepState[], todayIso: string): string {
  const done = steps.filter((s) => s.done).length;
  const over = overdueCount(steps, todayIso);
  if (steps.length === 0) return 'no steps';
  if (done === steps.length) return `all ${steps.length} steps done`;
  const bits = [`${done}/${steps.length} done`];
  if (over > 0) bits.push(`${over} OVERDUE`);
  const nxt = nextStep(steps);
  if (nxt) bits.push(`next: ${nxt.title}${nxt.dueDate ? ` (${nxt.dueDate})` : ''}`);
  return bits.join(' · ');
}
