// src/lib/garvis/growthLoop.ts
// THE LEARNING LOOP — pure core (verified by growthLoop.verify.ts). The one thing no faceless-video
// tool ships: publish → measure → learn which hooks win → feed the next draft. This core turns the
// synced per-post numbers (social_post_metrics — real numbers or NULL, never fake zeros) into:
//   - an honest per-episode reach figure (best available view-like metric, or null = "unknown"),
//   - a channel baseline (median reach of measured episodes — robust to one viral outlier),
//   - a winner/quiet classification by MULTIPLE over baseline (winners ≥3x, quiet ≤0.3x — the
//     scale-winners / kill-losers rule, as suggestions, never silent automation),
//   - hook intelligence for the next draft: which opening mechanisms won and died HERE, on this
//     channel — the flywheel fact-script consumes.
// Honesty rules: an episode with no synced metrics is 'unmeasured', never scored; a channel needs
// MIN_MEASURED episodes before any baseline/classification exists (early data is noise, and a
// 1-video "baseline" would crown every second video a winner).

export interface EpisodeMetricRow {
  likes: number | null; comments: number | null; shares: number | null;
  impressions: number | null; video_views: number | null; saves: number | null;
  clicks: number | null; engagement: number | null;
  // RETENTION (app_0125) — what the algorithms actually rank on. Nullable: absent = unknown.
  avg_watch_seconds?: number | null; full_watch_rate?: number | null; avg_view_pct?: number | null;
}

export interface EpisodePerf {
  episodeId: string;
  title: string;
  hook: string;              // the hook text this cut actually used
  reach: number | null;      // best view-like number across platforms, summed; null = unmeasured
  engagements: number | null; // likes+comments+shares+saves, when any exist
  clicks: number | null;
  avgViewPct: number | null;  // mean avg-%-viewed across platforms that reported it (0..100)
  fullWatchRate: number | null; // mean completion rate across platforms that reported it (0..1)
}

export type EpisodeVerdict = 'winner' | 'solid' | 'quiet' | 'unmeasured';

export const WINNER_MULTIPLE = 3;    // ≥3x channel median = scale it
export const QUIET_MULTIPLE = 0.3;   // ≤0.3x = the format/hook died; learn and move on
export const MIN_MEASURED = 3;       // no baseline before this many measured episodes

/** Collapse one episode's per-platform metric rows into one honest perf line. Reach prefers real
 *  video views over impressions; absent everywhere → null, never 0. */
export function episodePerf(episodeId: string, title: string, hook: string, rows: EpisodeMetricRow[]): EpisodePerf {
  const sum = (pick: (r: EpisodeMetricRow) => number | null): number | null => {
    let any = false, total = 0;
    for (const r of rows) { const v = pick(r); if (v !== null) { any = true; total += v; } }
    return any ? total : null;
  };
  const views = sum((r) => r.video_views);
  const impressions = sum((r) => r.impressions);
  const likes = sum((r) => r.likes) ?? 0;
  const comments = sum((r) => r.comments) ?? 0;
  const shares = sum((r) => r.shares) ?? 0;
  const saves = sum((r) => r.saves) ?? 0;
  const anyEng = [sum((r) => r.likes), sum((r) => r.comments), sum((r) => r.shares), sum((r) => r.saves)].some((v) => v !== null);
  const mean = (pick: (r: EpisodeMetricRow) => number | null | undefined): number | null => {
    const vals = rows.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return vals.length ? Math.round((vals.reduce((n, v) => n + v, 0) / vals.length) * 100) / 100 : null;
  };
  return {
    episodeId, title, hook,
    reach: views ?? impressions,
    engagements: anyEng ? likes + comments + shares + saves : null,
    clicks: sum((r) => r.clicks),
    avgViewPct: mean((r) => r.avg_view_pct),
    fullWatchRate: mean((r) => r.full_watch_rate),
  };
}

/** The retention read — the diagnosis the algorithms act on, in one honest line. Thresholds are
 *  for the 60-90s band this engine produces: ≥55% average-viewed = the algorithm pushes it;
 *  <30% = the hook/pacing failed regardless of view count; between = healthy. Null when no
 *  platform reported retention — never a guess. */
export function retentionRead(perf: Pick<EpisodePerf, 'avgViewPct' | 'fullWatchRate'>): string | null {
  if (perf.avgViewPct !== null) {
    if (perf.avgViewPct >= 55) return `${Math.round(perf.avgViewPct)}% avg viewed — strong retention, algorithm-push territory`;
    if (perf.avgViewPct < 30) return `${Math.round(perf.avgViewPct)}% avg viewed — weak retention; fix the hook or cut dead beats`;
    return `${Math.round(perf.avgViewPct)}% avg viewed`;
  }
  if (perf.fullWatchRate !== null) return `${Math.round(perf.fullWatchRate * 100)}% watched to the end`;
  return null;
}

/** The channel baseline: MEDIAN reach of measured episodes (median, not mean — one viral video
 *  must not make every normal video look dead). Null until MIN_MEASURED episodes have numbers. */
export function channelBaseline(perfs: EpisodePerf[]): number | null {
  const measured = perfs.filter((p) => p.reach !== null).map((p) => p.reach as number).sort((a, b) => a - b);
  if (measured.length < MIN_MEASURED) return null;
  const mid = Math.floor(measured.length / 2);
  return measured.length % 2 ? measured[mid] : (measured[mid - 1] + measured[mid]) / 2;
}

/** Verdict by multiple over baseline. Unmeasured episodes and pre-baseline channels stay honest:
 *  'unmeasured' — never a fake "quiet" on a video whose numbers simply haven't synced. */
export function classifyEpisode(perf: EpisodePerf, baseline: number | null): { verdict: EpisodeVerdict; multiple: number | null } {
  if (perf.reach === null || baseline === null) return { verdict: 'unmeasured', multiple: null };
  if (baseline <= 0) return { verdict: 'unmeasured', multiple: null };
  const multiple = Math.round((perf.reach / baseline) * 100) / 100;
  if (multiple >= WINNER_MULTIPLE) return { verdict: 'winner', multiple };
  if (multiple <= QUIET_MULTIPLE) return { verdict: 'quiet', multiple };
  return { verdict: 'solid', multiple };
}

export interface HookIntel {
  winningHooks: string[];   // hooks from winner episodes — mechanisms to write MORE of
  quietHooks: string[];     // hooks from quiet episodes — mechanisms to avoid
  bestEpisode: EpisodePerf | null;  // the top measured episode — the double-down candidate
}

/** The intelligence the next draft consumes. Deduped, capped, deterministic (sorted by multiple). */
export function hookIntel(perfs: EpisodePerf[]): HookIntel {
  const baseline = channelBaseline(perfs);
  const scored = perfs
    .map((p) => ({ p, c: classifyEpisode(p, baseline) }))
    .filter((x) => x.c.multiple !== null)
    .sort((a, b) => (b.c.multiple as number) - (a.c.multiple as number));
  const dedupe = (hooks: string[]) => [...new Set(hooks.map((h) => h.trim()).filter(Boolean))].slice(0, 5);
  return {
    winningHooks: dedupe(scored.filter((x) => x.c.verdict === 'winner').map((x) => x.p.hook)),
    quietHooks: dedupe(scored.filter((x) => x.c.verdict === 'quiet').map((x) => x.p.hook)),
    bestEpisode: scored[0]?.p ?? null,
  };
}

/** One honest line for an episode card: real numbers or the truth that there are none yet. */
export function perfLine(perf: EpisodePerf, baseline: number | null): string {
  if (perf.reach === null) return 'no numbers synced yet';
  const parts = [`${perf.reach.toLocaleString()} views`];
  if (perf.engagements !== null) parts.push(`${perf.engagements.toLocaleString()} engagements`);
  if (perf.clicks !== null) parts.push(`${perf.clicks.toLocaleString()} clicks`);
  const ret = retentionRead(perf);
  if (ret) parts.push(ret);
  const c = classifyEpisode(perf, baseline);
  if (c.multiple !== null) parts.push(`${c.multiple}x baseline${c.verdict === 'winner' ? ' — WINNER, double down' : c.verdict === 'quiet' ? ' — quiet, change the mechanism' : ''}`);
  return parts.join(' · ');
}
