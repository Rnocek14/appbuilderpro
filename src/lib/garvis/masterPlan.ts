// src/lib/garvis/masterPlan.ts
// THE KNOWN PLAYS — pure core (verified by masterPlan.verify.ts). The vertical planner proved
// the pattern: a strategic ask deserves a STRUCTURED plan that composes the platform's real
// capabilities, laid out instantly, with one approval press that runs it. This library
// generalizes that to every recurring play the operator actually voices — "market my app",
// "plan seven verticals", "find me clients", "keep Northstar's socials active" — compiled
// DETERMINISTICALLY into the orchestrator's reviewable contract: zero AI round-trip, zero key,
// zero spend until Approve. Anything that is not a known play falls through to the AI compiler.
//
// Honesty rules (the same spine as the AI tier, enforced by the verify suite):
//   - A shape only fires when its extraction is CLEAN — a fuzzy read returns null (AI tier),
//     never a plan built on a guess.
//   - Missing info is a QUESTION (a CTA with no link), never an invented value.
//   - What the platform cannot do is a HOLE (paid ads), never silently dropped.
//   - Every step says WHY, and every plan survives the parsePlan gauntlet unchanged.

import type { CompiledPlan, PlanStep } from './orchestrator';
import { buildVerticalPlan, planToArc, verticalCount } from './verticalPlan';

export interface ShapedPlan {
  shapeId: string;
  plan: CompiledPlan;
}

const step = (action: string, params: Record<string, string>, why: string, after: number[] = []): PlanStep =>
  ({ action, params, why, after });

const firstUrl = (s: string): string | null => /(https?:\/\/[^\s)]+)/.exec(s)?.[1] ?? null;

/** "market my stroke app mindweave (https://…)" → "stroke app mindweave". The verb must be a
 *  VERB — "research the market for X" (noun usage) never matches. Null when the subject reads
 *  dirty, so the AI tier gets the sentence instead of a plan built on a bad parse. */
export function marketSubject(sentence: string): string | null {
  const m = /\b(?<!(?:the|a|this|that|our|your)\s)(?:market(?:ing)?|promot(?:e|ing)|advertis(?:e|ing)|get the word out about)\s+(.+?)(?=\s+(?:so|and|then|because|with|via|using|by|online|everywhere)\b|[.,;!?(]|\s+https?:|$)/i.exec(sentence);
  if (!m) return null;
  let subject = m[1]!.trim().replace(/^(?:my|our|the)\s+/i, '').replace(/['"]/g, '').trim();
  if (/^for\b/i.test(subject)) return null;   // "market for X" is noun usage that slipped the guard
  if (subject.length < 3 || subject.length > 60) return null;
  return subject;
}

interface Shape {
  id: string;
  match(sentence: string): CompiledPlan | null;
}

/** Ordered most-specific first — a counted-verticals ask wins over its 'market …' tail. */
const SHAPES: Shape[] = [
  {
    // "plan seven verticals and make a structured plan" / "3 niche channels funneling to <url>"
    id: 'vertical-empire',
    match(s) {
      const n = verticalCount(s);
      if (n === null || !/\b(vertical|niche|channel|slop)/i.test(s)) return null;
      return planToArc(buildVerticalPlan(n, { ctaUrl: firstUrl(s), marketed: marketSubject(s) ?? undefined }));
    },
  },
  {
    // "keep Northstar's socials active" / "weekly content for Mural Co"
    id: 'weekly-presence',
    match(s) {
      const world = (/\bkeep\s+(.+?)(?:'s|s')?\s+(?:socials?|social media|instagram|presence)\s+(?:active|alive|going|fresh|warm)/i.exec(s)?.[1]
        ?? /\b(?:weekly|regular)\s+(?:content|posts)\s+for\s+(.+?)(?=\s+(?:and|so|then)\b|[.,;!?]|$)/i.exec(s)?.[1])?.trim();
      if (!world || world.length < 2 || world.length > 40) return null;
      const perWeek = /(\d)\s*posts?/i.exec(s)?.[1];
      return {
        title: `Weekly presence for ${world}`,
        summary: `A judged content week in ${world}'s own voice, staged behind one weekly approval, plus a standing idea stream feeding its board — steady presence without a daily chore.`,
        steps: [
          step('start_content_week', { world, ...(perWeek ? { posts_per_week: perWeek } : {}) },
            'a weekly drumbeat of judged posts, grounded in the business\'s real facts, is exactly what "keep it active" means'),
          step('start_idea_stream', { world, cadence: 'weekly' },
            'fresh angles landing on the board keep the content week from repeating itself', [0]),
        ],
        holes: [],
        questions: [],
      };
    },
  },
  {
    // "find me web design clients — go after landscapers" / "fill the pipeline"
    id: 'client-machine',
    match(s) {
      if (!/\b(?:find|get|land|win|book)\s+(?:me\s+)?(?:more\s+|some\s+|new\s+)?(?:[\w-]+\s+){0,4}?clients?\b/i.test(s) && !/\bfill (?:the|my) pipeline\b/i.test(s)) return null;
      const niche = (/\bgo after\s+([a-z][\w\s-]{2,30}?)(?=[.,;!?]|$)/i.exec(s)?.[1]
        ?? /\b(?:find|get|land|win|book)\s+(?:me\s+)?(?:more\s+|some\s+|new\s+)?([a-z][\w\s-]{2,30}?)\s+clients\b/i.exec(s)?.[1])?.trim();
      return {
        title: niche ? `The client machine: ${niche}` : 'The client machine',
        summary: 'The daily acquisition loop: discover real local businesses, audit their sites, build demo previews, and stage pitch emails as pending approvals — nothing sends without you.',
        steps: [step('start_client_hunt', niche ? { niche } : {},
          'automatic discovery, audits, demos and pitch drafts are the hunt machine — the pipeline fills while you work')],
        holes: [],
        questions: [],
      };
    },
  },
  {
    // "find all mural and custom art jobs in wisconsin"
    id: 'work-hunt',
    match(s) {
      const m = /\b(?:find|hunt(?:\s+for)?|look for)\s+(?:all\s+|me\s+|some\s+)?(.+?\b(?:jobs|gigs|commissions|rfps|grants|open calls)\b)/i.exec(s);
      const focus = m?.[1]?.trim();
      if (!focus || focus.length < 8 || focus.length > 60) return null;
      const region = new RegExp(`\\b${focus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+in\\s+([\\w\\s]{2,30}?)(?=[.,;!?]|$)`, 'i').exec(s)?.[1]?.trim();
      return {
        title: `Standing hunt: ${focus}`,
        summary: `Scheduled web sweeps that read real listings and file only opportunities the pages actually describe — deduped into your Opportunity feed for triage${region ? `, preferring ${region}` : ''}.`,
        steps: [step('hunt_opportunities', { focus, ...(region ? { region } : {}) },
          'finding real work on a standing cadence is exactly what the hunt does — triage stays yours')],
        holes: [],
        questions: [],
      };
    },
  },
  {
    // "start a marketing agency for home-service companies"
    id: 'found-business',
    match(s) {
      if (!/\b(?:start|launch|found|create|spin up)\s+(?:a|an|my|the)?\s*(?:new\s+)?(?:[\w-]+\s+){0,3}?(?:business|company|agency|brand|startup|venture|studio)\b/i.test(s)) return null;
      return {
        title: 'Found it first',
        summary: 'The venture does not exist in the system yet — founding lands as a reviewable draft, and everything downstream (research, the plan, campaigns) hangs off the approved company.',
        steps: [step('found_company', { intent: s.trim().slice(0, 200) },
          'the venture does not exist in the system yet — founding is the first honest step')],
        holes: [],
        questions: ['After approving the company draft, say "research and write the plan for it" — plans need the approved company to exist.'],
      };
    },
  },
  {
    // "plan out how to market my stroke app mindweave (https://mindweave.app)"
    id: 'market',
    match(s) {
      const subject = marketSubject(s);
      if (!subject) return null;
      const url = firstUrl(s);
      const world = `${subject.slice(0, 50)} Marketing`;
      const steps: PlanStep[] = [
        step('start_app_marketing', { app: subject },
          'the marketing work needs its mapped operation — areas for competitor intel, SEO articles, social, video ideas, and results'),
        step('record_thesis', {
          title: `Marketing ${subject}: the operating play`.slice(0, 80),
          body: `Stand the operation up, ground it in research, publish steadily through the approval rails${url ? `, and route every audience at ${url}` : ''} — spend follows proof, not hope.`,
        }, 'the strategy and its reasoning should be a persisted, reviewable record', [0]),
        step('research_market', { world },
          'competitor intel grounds every later article, post and video idea', [0]),
        step('start_content_week', { world, posts_per_week: '3' },
          'a steady weekly drumbeat in the operation\'s voice, staged behind one approval, is the organic engine', [2]),
      ];
      if (url) {
        steps.push(step('point_channel_cta', { url },
          'a channel whose viewers match the product should carry its link — the shortest path from audience to asset', [0]));
      }
      return {
        title: `Market ${subject}`,
        summary: `The whole organic play for ${subject}: the mapped marketing operation, grounded research, a weekly content engine${url ? `, and every channel routing at ${url}` : ''} — nothing posts or sends without your approval.`,
        steps,
        holes: ['Paid ads and influencer outreach are not in Garvis\'s hands — this is the organic rail: the mapped operation, research-grounded content, and Queue-gated posting.'],
        questions: url ? [] : ['Where should audiences land? Give the link (app store page, site, booking) — without it, channel CTAs route nowhere.'],
      };
    },
  },
];

/** The deterministic tier of the plan compiler: a known play compiles instantly (no AI, no key,
 *  no spend); anything else returns null and the AI compiler takes the sentence. */
export function matchPlanShape(sentence: string): ShapedPlan | null {
  const s = sentence.trim();
  if (s.length < 12) return null;
  for (const shape of SHAPES) {
    const plan = shape.match(s);
    if (plan) return { shapeId: shape.id, plan };
  }
  return null;
}
