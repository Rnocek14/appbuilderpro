// src/lib/garvis/prospects/stage.ts
// PURE stage derivation for the Prospects pipeline (no I/O; verified by stage.verify.ts). A prospect's
// stage isn't stored on one column — it's implied by the discovered_businesses.status, the linked
// preview_site's status, and whether a sale was booked. This module is the single place that reduces
// those signals to ONE honest stage + the next action, so the pipeline bar, the row badge, and the
// drawer all agree. Zero runtime imports — a leaf.

export type ProspectStage = 'new' | 'built' | 'pitched' | 'won' | 'skipped';

// The pipeline ladder, left→right. 'skipped' is deliberately NOT in the ladder — it's a side state
// (passed over), surfaced as its own filter, never a rung a prospect "progresses" to.
export const STAGE_LADDER: ProspectStage[] = ['new', 'built', 'pitched', 'won'];

export interface StageMeta {
  label: string;
  color: string;   // text color class for the stage
  dot: string;     // bg color class for the pipeline dot
  next: string;    // the one next action, operator-facing
}

export const STAGE_META: Record<ProspectStage, StageMeta> = {
  new:     { label: 'New',     color: 'text-forge-ember', dot: 'bg-forge-ember', next: 'Build the demo + send the pitch' },
  built:   { label: 'Built',   color: 'text-forge-warn',  dot: 'bg-forge-warn',  next: 'Demo is ready — no email found yet; add one or send' },
  pitched: { label: 'Pitched', color: 'text-forge-heat',  dot: 'bg-forge-heat',  next: 'Pitched — follow up, or mark it won' },
  won:     { label: 'Won',     color: 'text-forge-ok',    dot: 'bg-forge-ok',    next: 'Won — set up their accounts' },
  skipped: { label: 'Skipped', color: 'text-forge-dim',   dot: 'bg-forge-dim',   next: 'Passed over — reopen to work it again' },
};

export interface StageInputs {
  status: string;                  // discovered_businesses.status: 'new' | 'built' | 'skipped'
  previewStatus?: string | null;   // linked preview_sites.status: 'preview' | 'emailed' | 'purchased' | 'published'
  won?: boolean;                   // a client_subscription is linked to this prospect's demo
}

/** Reduce the three signals to one stage. Priority (highest first): a booked sale is WON no matter what
 *  the other columns say; an operator's SKIP sticks unless it was later won; an emailed/published demo is
 *  PITCHED; a built-but-unpitched demo is BUILT; everything else is NEW. Deterministic + total. */
export function deriveStage(inp: StageInputs): ProspectStage {
  if (inp.won || inp.previewStatus === 'purchased') return 'won';
  if (inp.status === 'skipped') return 'skipped';
  if (inp.previewStatus === 'emailed' || inp.previewStatus === 'published') return 'pitched';
  if (inp.status === 'built') return 'built';
  return 'new';
}

/** The next action for a stage — the drawer's call-to-action and the row hint. */
export function nextAction(stage: ProspectStage): string {
  return STAGE_META[stage].next;
}

/** Count prospects per stage (every stage present, even at 0, so the pipeline never hides an empty rung).
 *  Skipped is counted too — the UI shows it as a separate chip. */
export function stageRollup(stages: ProspectStage[]): Record<ProspectStage, number> {
  const counts: Record<ProspectStage, number> = { new: 0, built: 0, pitched: 0, won: 0, skipped: 0 };
  for (const s of stages) counts[s]++;
  return counts;
}

/** Whether a prospect at this stage can still be built/pitched with one click (New or Built), i.e. the
 *  "Build & send" action still applies. Pitched/Won/Skipped no longer show it as the primary action. */
export function canBuildAndSend(stage: ProspectStage): boolean {
  return stage === 'new' || stage === 'built';
}

// ── post-send engagement signals ────────────────────────────────────────────
export interface SignalFlags { opened: boolean; openCount: number; demoViews: number; engaged: boolean; replied: boolean }
export interface SignalChip { label: string; tone: 'ok' | 'heat' }

/** Turn a prospect's post-send signals into the badges shown on the row/drawer, most important first:
 *  a reply is the strongest buy signal (green), then opens + demo views (hot). Nothing shows when there's
 *  no activity yet, so the strip stays quiet until something actually happens. Pure + deterministic. */
export function signalChips(s: SignalFlags): SignalChip[] {
  const chips: SignalChip[] = [];
  if (s.replied) chips.push({ label: 'replied', tone: 'ok' });
  if (s.opened) chips.push({ label: s.openCount > 1 ? `opened ${s.openCount}×` : 'opened', tone: 'heat' });
  if (s.demoViews > 0) chips.push({ label: s.demoViews > 1 ? `viewed ${s.demoViews}×` : 'viewed demo', tone: 'heat' });
  return chips;
}
