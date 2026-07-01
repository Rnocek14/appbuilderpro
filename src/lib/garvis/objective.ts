// src/lib/garvis/objective.ts
// Pure, supabase-free helpers for the Garvis objective layer (goals/constraints + capability registry).
// Split out so the inject-only-active/approved invariants are unit-testable without a DB (qaCheck pattern).
//
// Invariants enforced by objective.verify.ts:
//  - Only ACTIVE goals and APPROVED capabilities reach the brain's context.
//  - Constraints, when set, are surfaced so the brain reasons within limits (it never stores allocations).

import type { GarvisCapability, GarvisConstraints, GarvisGoal } from '../../types';

/** Active goals only, highest priority first (1 = highest). */
export function selectActiveGoals(goals: GarvisGoal[]): GarvisGoal[] {
  return goals.filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority);
}

/** Approved capabilities only (proposals and retired entries are never exposed). */
export function selectApprovedCapabilities(caps: GarvisCapability[]): GarvisCapability[] {
  return caps.filter((c) => c.status === 'approved');
}

/**
 * The objective-function digest: active goals (priority order) + the global constraints line. Returns
 * '' when there are no active goals AND no constraints, so callers can skip injection cleanly.
 */
export function buildGoalsDigest(goals: GarvisGoal[], constraints?: GarvisConstraints | null): string {
  const active = selectActiveGoals(goals);
  const parts: string[] = [];

  if (active.length > 0) {
    const lines = active.map((g) => {
      const metric = g.success_metric ? ` — metric: ${g.success_metric}` : '';
      const target = g.target_date ? `; target ${g.target_date}` : '';
      return `- [P${g.priority}] ${g.title}${metric}${target}`;
    });
    parts.push(`ACTIVE GOALS (what you are optimizing for, priority order):\n${lines.join('\n')}`);
  }

  if (constraints) {
    const c: string[] = [];
    if (constraints.weekly_hours != null) c.push(`~${constraints.weekly_hours} hrs/week`);
    if (constraints.monthly_budget_usd != null) c.push(`$${constraints.monthly_budget_usd}/mo budget`);
    c.push(`risk tolerance: ${constraints.risk_tolerance}`);
    if (constraints.max_active_projects != null) c.push(`max ${constraints.max_active_projects} active projects`);
    if (constraints.notes) c.push(constraints.notes);
    if (c.length > 0) parts.push(`CONSTRAINTS (respect these): ${c.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return `GARVIS OBJECTIVE — weigh every recommendation against this:\n${parts.join('\n')}`;
}

/**
 * The capability catalog digest: what the portfolio can do. Some entries may not be directly callable
 * yet (the brain can still RECOMMEND them). Returns '' when nothing is approved.
 */
export function buildCapabilitiesDigest(caps: GarvisCapability[], appNameById?: Record<string, string>): string {
  const approved = selectApprovedCapabilities(caps);
  if (approved.length === 0) return '';
  const lines = approved.map((c) => {
    const where = c.app_id ? (appNameById?.[c.app_id] ?? 'app') : 'Garvis';
    const flags = [where, c.maturity, c.safety_level];
    if (c.approval_required) flags.push('approval required');
    return `- ${c.name} (${flags.join(', ')}): ${c.description}`;
  });
  return `AVAILABLE CAPABILITIES (what your apps/tools can do — recommend the right resource):\n${lines.join('\n')}`;
}
