// supabase/functions/_shared/reDraftCore.ts
// A COMMUNITY'S VERIFIED FACTS BECOME A DRAFT — deterministically, with no model in the loop.
// Pure: no Deno, no DOM, no Supabase, no clock of its own. Verified by src/lib/garvis/reDraft.verify.ts.
//
// This is the campaignCore lesson applied to neighborhood copy: the operator's own verified facts
// flow through, and anything missing becomes a VISIBLE hole rather than a plausible sentence. No AI
// key, no network, same input → same draft, offline. A model can improve the wording later; it may
// never be what stands between a missing fact and a published claim.
//
// The three drafts a first campaign actually needs (the operating plan's own list): an owner brief
// for people who already live there, an answer to one ownership question, and an invitation to talk
// about their home. Each is a skeleton of the operator's sentences around {{fact:…}} slots that
// reFactsCore resolves — so the fact gate, not this file, decides what may be said.

export type DraftKind = 'owner_brief' | 'one_question' | 'seller_invite';

export interface DraftKindMeta { id: DraftKind; label: string; blurb: string }

export const DRAFT_KINDS: DraftKindMeta[] = [
  { id: 'owner_brief', label: 'Owner brief', blurb: 'For people who already own here — what changed, one thing worth knowing.' },
  { id: 'one_question', label: 'One question, answered', blurb: 'A single ownership question, answered from a source you verified.' },
  { id: 'seller_invite', label: 'Thinking of selling', blurb: 'An invitation to talk — no claim about their home, because you have not seen it.' },
];

export interface DraftFact {
  id: string;
  claim: string;
  /** Already gated: only facts the caller judged citable should be passed in. */
  valueText: string | null;
}

export interface DraftInput {
  kind: DraftKind;
  communityName: string;
  /** In the order they should appear. The composer uses at most three. */
  facts: DraftFact[];
  agentName?: string;
  complianceLine?: string | null;
}

export interface DraftOutput {
  /** The body, with {{fact:<id>}} slots for reFactsCore to resolve (or leave as a hole). */
  template: string;
  /** Every fact id this draft leans on — what the approval binds and the publisher re-checks. */
  factIds: string[];
  /** What the operator must supply before this is publishable. Never silently filled. */
  needs: string[];
}

const EDIT = (what: string): string => `[VERIFY: ${what}]`;

/** Compose. Deterministic and offline; the caller resolves the fact slots. */
export function draft(input: DraftInput): DraftOutput {
  const community = (input.communityName ?? '').trim() || EDIT('the community name');
  const facts = (input.facts ?? []).filter((f) => f && f.id).slice(0, 3);
  const needs: string[] = [];
  if (!(input.communityName ?? '').trim()) needs.push('Name the community this is about.');
  if (!facts.length) needs.push('Add at least one verified fact with a source — there is nothing to say yet.');

  const slot = (i: number): string => (facts[i] ? `{{fact:${facts[i].id}}}` : EDIT('a verified fact with a source'));
  const line = (i: number): string => (facts[i] ? `${facts[i].claim}: ${slot(i)}` : slot(i));
  const sign = (input.agentName ?? '').trim();
  const signOff = sign ? `\n\n— ${sign}` : '';
  const compliance = (input.complianceLine ?? '').trim();
  const tail = compliance ? `${signOff}\n\n${compliance}` : signOff;

  let template: string;
  switch (input.kind) {
    case 'one_question':
      template = [
        `If you own in ${community}, here is one thing worth knowing.`,
        '',
        line(0),
        facts[1] ? `\n${line(1)}` : '',
        '',
        'Questions about your own place are usually specific — ask me and I will check the source rather than guess.',
      ].filter((s) => s !== '').join('\n') + tail;
      break;
    case 'seller_invite':
      template = [
        `Thinking about selling in ${community}?`,
        '',
        // Deliberately NO claim about their home, their timing, or the market direction. We have not
        // seen the house and we did not verify a trend.
        line(0),
        '',
        'If you are weighing a move, I am glad to walk your place and tell you what I actually see — no obligation.',
      ].join('\n') + tail;
      break;
    case 'owner_brief':
    default:
      template = [
        `${community} — what owners are asking about this month.`,
        '',
        line(0),
        facts[1] ? line(1) : '',
        facts[2] ? line(2) : '',
        '',
        'If anything here affects your own place, tell me and I will look it up properly.',
      ].filter((s, i, a) => !(s === '' && a[i - 1] === '')).join('\n') + tail;
      break;
  }

  return { template, factIds: facts.map((f) => f.id), needs };
}
