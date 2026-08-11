// src/lib/garvis/marketingReadiness.ts
// COMPLETENESS, honestly — pure core (verified by marketingReadiness.verify.ts). The operator
// asked "show a percentage of completeness for each project": this computes it from REAL counts,
// never vibes. An area counts as WORKED when it holds at least one artifact; the percentage is
// worked-areas over total areas (plus the CTA check when a channel exists to point); "next" names
// the ONE next step for each empty area in operator language. Same input → same verdict.

export interface MarketingAreaState {
  slug: string;
  title: string;
  artifacts: number;   // real rows in knowledge_artifacts for this cluster
}

export interface MarketingReadinessInput {
  areas: MarketingAreaState[];
  /** null = no channel exists (the check is omitted, not failed); boolean = a channel exists
   *  and its CTA is (not) pointing anywhere. */
  ctaSet: boolean | null;
}

export interface MarketingReadiness {
  pct: number;            // 0-100, integer
  done: string[];         // what EXISTS — outcome language
  next: string[];         // the one next step per gap, most valuable first
}

/** The area-slug → "one next step" line, in the operator's language. Unknown slugs get a
 *  serviceable generic line so hand-added areas never break the math. */
const NEXT_STEP: Record<string, string> = {
  'mkt-plan': 'Record the strategy: say "do record the thesis for <app> marketing" or write it in The Plan',
  'competitor-intel': 'Run the research: "do research the market for <app> Marketing" fills Competitor Intel',
  'seo-articles': 'Draft the first SEO article ideas in the SEO Articles studio',
  'social-posts': 'Generate the first post ideas in the Social Posts studio (posting stays approval-gated)',
  'video-ideas': 'Storyboard one short video in the Video Ideas studio',
  'mkt-results': 'Results fills itself once anything ships — nothing to do here yet',
};

export function marketingReadiness(input: MarketingReadinessInput): MarketingReadiness {
  const areas = input.areas;
  const done: string[] = [];
  const next: string[] = [];
  let checks = 0;
  let passed = 0;

  for (const a of areas) {
    // Results is an outcome ledger — it never counts against completeness before anything ships.
    if (a.slug === 'mkt-results') continue;
    checks++;
    if (a.artifacts > 0) {
      passed++;
      done.push(`${a.title}: ${a.artifacts} item${a.artifacts === 1 ? '' : 's'}`);
    } else {
      next.push(NEXT_STEP[a.slug] ?? `Start the first item in ${a.title}`);
    }
  }

  if (input.ctaSet !== null) {
    checks++;
    if (input.ctaSet) {
      passed++;
      done.push('A channel CTA routes its audience here');
    } else {
      next.push('Point a channel at the app: "do point the channel at <url>"');
    }
  }

  const pct = checks === 0 ? 0 : Math.round((passed / checks) * 100);
  return { pct, done, next };
}
