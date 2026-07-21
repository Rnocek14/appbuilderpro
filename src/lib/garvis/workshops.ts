// WORKSHOPS — the human-facing layer over Work Web areas.
//
// The charter remains the durable capability contract. A workshop is how that capability is
// presented to a person: one outcome, a short creative rhythm, and an honest state derived from
// persisted work. Keeping this mapping pure means the gallery, focused workspace, command palette,
// and future agent planner can all describe the same capability without inventing parallel logic.

import type { Archetype, Charter, Flavor } from './workweb';

export type WorkshopGroup = 'create' | 'grow' | 'understand' | 'organize';
export type WorkshopTone = 'ember' | 'violet' | 'ok' | 'blue';

export interface WorkshopDefinition {
  name: string;
  kicker: string;
  outcome: string;
  description: string;
  group: WorkshopGroup;
  tone: WorkshopTone;
  steps: readonly [string, string, string];
}

export interface WorkshopStateInput {
  earnedArtifacts: number;
  pendingApprovals: number;
  liveStatus?: Charter['status'] | null;
}

export interface WorkshopState {
  label: string;
  detail: string;
  tone: 'dim' | 'ember' | 'ok' | 'warn';
  activeStep: 0 | 1 | 2;
}

const DEFAULT_STEPS = ['Set the direction', 'Make the work', 'Review and use'] as const;

const FLAVOR_WORKSHOPS: Record<Flavor, WorkshopDefinition> = {
  generic: {
    name: 'Messaging Workshop', kicker: 'Find the words',
    outcome: 'A clear story people understand and remember.',
    description: 'Shape the value proposition, pitch, story, taglines, and objection answers in one focused room.',
    group: 'create', tone: 'ember', steps: ['Choose an angle', 'Shape the message', 'Save the strongest take'],
  },
  direct_mail: {
    name: 'Postcard Workshop', kicker: 'Make something tangible',
    outcome: 'A designed, print-ready postcard built from your real brand and photos.',
    description: 'Develop the angle, create the card, and prepare it for an addressed print run.',
    group: 'grow', tone: 'ember', steps: ['Choose the story', 'Design the card', 'Review the print run'],
  },
  email: {
    name: 'Email Workshop', kicker: 'Write the sequence',
    outcome: 'A polished email or follow-up sequence ready for review.',
    description: 'Explore an angle, draft the message, edit it in place, and move approved work toward delivery.',
    group: 'grow', tone: 'violet', steps: ['Pick the purpose', 'Write the sequence', 'Review before sending'],
  },
  social: {
    name: 'Social Workshop', kicker: 'Turn ideas into posts',
    outcome: 'Channel-ready posts you can edit, schedule, and publish.',
    description: 'Start with a content idea, make platform-specific pieces, and take the best ones to the publisher.',
    group: 'grow', tone: 'violet', steps: ['Choose a format', 'Create the posts', 'Schedule or publish'],
  },
  video: {
    name: 'Video Workshop', kicker: 'Tell it in motion',
    outcome: 'A timed, captioned video assembled from your own visual material.',
    description: 'Build the story, arrange the shots, preview the pacing, and render when it feels right.',
    group: 'create', tone: 'ember', steps: ['Shape the story', 'Build the scenes', 'Preview and render'],
  },
  landing: {
    name: 'Website Workshop', kicker: 'Give the idea a home',
    outcome: 'A working landing page carried into the app builder with the right context.',
    description: 'Choose a visual direction and turn this business’s DNA, artwork, and offer into a build brief.',
    group: 'create', tone: 'blue', steps: ['Choose a direction', 'Build the page', 'Preview and launch'],
  },
  market: {
    name: 'Market Workshop', kicker: 'Understand the terrain',
    outcome: 'A grounded market read built from research or your connected data.',
    description: 'Investigate the market, compare signals, and turn what matters into a useful point of view.',
    group: 'understand', tone: 'blue', steps: ['Frame the question', 'Gather evidence', 'Write the read'],
  },
  brand: {
    name: 'Brand Workshop', kicker: 'Make it feel like you',
    outcome: 'A reusable identity, voice, palette, and source library.',
    description: 'Collect the materials and decisions every creative workshop should inherit automatically.',
    group: 'create', tone: 'violet', steps: ['Gather the materials', 'Set the identity', 'Use it everywhere'],
  },
  crm: {
    name: 'Relationship Workshop', kicker: 'Keep the thread alive',
    outcome: 'A clear next move for every important relationship.',
    description: 'Organize contacts, notes, stages, and follow-ups around the people who matter to this business.',
    group: 'organize', tone: 'ok', steps: ['Choose the people', 'Plan the next touch', 'Keep the record current'],
  },
  lists: {
    name: 'Audience Workshop', kicker: 'Find the right people',
    outcome: 'A clean, useful audience ready for a campaign or personal follow-up.',
    description: 'Build or import a list, inspect who is reachable, and prepare the right segment for action.',
    group: 'grow', tone: 'ok', steps: ['Define the audience', 'Build the list', 'Prepare the outreach'],
  },
  ads: {
    name: 'Ad Workshop', kicker: 'Make the offer impossible to miss',
    outcome: 'A reviewable Meta and Google campaign concept with real platform-ready copy.',
    description: 'Explore the hook, build the campaign pieces, and review everything before any spend occurs.',
    group: 'grow', tone: 'violet', steps: ['Choose the hook', 'Build the campaign', 'Review before launch'],
  },
  feature_lab: {
    name: 'Product Workshop', kicker: 'Turn a spark into a feature',
    outcome: 'A differentiated product concept and a buildable feature specification.',
    description: 'Explore the possibility space, choose the strongest concept, and develop it into an actionable spec.',
    group: 'create', tone: 'blue', steps: ['Explore concepts', 'Choose the winner', 'Write the build spec'],
  },
  assist: {
    name: 'Answering Workshop', kicker: 'Answer with confidence',
    outcome: 'A grounded reply that sounds like you and cites what it used.',
    description: 'Paste a real incoming message, draft from saved knowledge, and close any knowledge gap you uncover.',
    group: 'organize', tone: 'ok', steps: ['Paste the message', 'Draft from knowledge', 'Review and answer'],
  },
  deliver: {
    name: 'Document Workshop', kicker: 'Make the finished thing',
    outcome: 'A polished proposal, report, one-pager, or brief you can export.',
    description: 'Choose a useful format, ground it in the business record, then refine and export the deliverable.',
    group: 'create', tone: 'ember', steps: ['Choose the format', 'Build the document', 'Review and export'],
  },
  data: {
    name: 'Data Workshop', kicker: 'See what the numbers say',
    outcome: 'A trustworthy table, statistical read, and chart computed from your data.',
    description: 'Bring in a dataset, explore its real structure, and save the clearest analysis without guessed numbers.',
    group: 'understand', tone: 'blue', steps: ['Bring the data', 'Explore the signal', 'Save the finding'],
  },
  tracker: {
    name: 'Record Workshop', kicker: 'Turn details into memory',
    outcome: 'A queryable record of clients, expenses, decisions, or anything you track.',
    description: 'Capture structured entries, keep timelines moving, and make the record available to future Garvis work.',
    group: 'organize', tone: 'ok', steps: ['Choose what matters', 'Log the record', 'Use it as memory'],
  },
  content_growth: {
    name: 'Reel Workshop', kicker: 'Build a repeatable content engine',
    outcome: 'A complete vertical-video storyboard with hook, scenes, captions, and voiceover.',
    description: 'Develop the angle, script the beats, and storyboard the short before sending it to a clip engine.',
    group: 'grow', tone: 'violet', steps: ['Find the hook', 'Script the beats', 'Build the storyboard'],
  },
};

const ARCHETYPE_WORKSHOPS: Record<Archetype, WorkshopDefinition> = {
  intel: {
    name: 'Research Workshop', kicker: 'Follow the evidence',
    outcome: 'A useful brief and a sharper point of view.',
    description: 'Frame a question, gather what is known, and synthesize it into a decision-ready artifact.',
    group: 'understand', tone: 'blue', steps: ['Frame the question', 'Research the evidence', 'Synthesize the answer'],
  },
  audience: FLAVOR_WORKSHOPS.lists,
  studio: FLAVOR_WORKSHOPS.generic,
  launch: {
    name: 'Launch Workshop', kicker: 'Move the work into the world',
    outcome: 'An approved send, post, print run, or deployment.',
    description: 'Choose the finished work, inspect the destination, and release it through the approval gate.',
    group: 'grow', tone: 'ember', steps: ['Choose what ships', 'Check the destination', 'Approve and launch'],
  },
  loop: {
    name: 'Follow-up Workshop', kicker: 'Make momentum compound',
    outcome: 'A useful sequence and a clear next touch.',
    description: 'Build the follow-up, choose who should receive it, and keep the relationship moving.',
    group: 'grow', tone: 'ok', steps: ['Choose the moment', 'Build the sequence', 'Queue the next touch'],
  },
  ledger: {
    name: 'Results Workshop', kicker: 'Learn from what happened',
    outcome: 'A clear read on results, signal, and the next experiment.',
    description: 'Review the execution record, separate signal from noise, and decide what the next cycle should change.',
    group: 'understand', tone: 'blue', steps: ['Review the record', 'Find the signal', 'Choose what changes'],
  },
  vault: FLAVOR_WORKSHOPS.brand,
};

export const WORKSHOP_GROUPS: ReadonlyArray<{ id: WorkshopGroup; label: string; prompt: string }> = [
  { id: 'create', label: 'Create', prompt: 'Make a useful thing' },
  { id: 'grow', label: 'Grow', prompt: 'Reach people and build momentum' },
  { id: 'understand', label: 'Understand', prompt: 'Research, compare, and learn' },
  { id: 'organize', label: 'Organize', prompt: 'Turn details into an operating memory' },
];

export function workshopFor(charter: Charter | null | undefined): WorkshopDefinition {
  if (!charter) return {
    name: 'Working Session', kicker: 'Move one thing forward',
    outcome: 'A useful piece of finished work.',
    description: 'Bring the context together, make the work, and leave with a saved result.',
    group: 'create', tone: 'ember', steps: DEFAULT_STEPS,
  };
  // Flavor defines the hands-on creative studios. For operational areas, the archetype defines the
  // actual job: an email-flavored LOOP is follow-up, not an email-writing room; a direct-mail
  // LAUNCH area is shipping, not designing the postcard. Intel/audience/vault keep their useful
  // specialization where it changes the working surface.
  if (charter.archetype === 'studio') return FLAVOR_WORKSHOPS[charter.flavor];
  if (charter.archetype === 'intel' && charter.flavor === 'market') return FLAVOR_WORKSHOPS.market;
  if (charter.archetype === 'audience' && charter.flavor === 'lists') return FLAVOR_WORKSHOPS.lists;
  if (charter.archetype === 'vault' && charter.flavor === 'brand') return FLAVOR_WORKSHOPS.brand;
  return ARCHETYPE_WORKSHOPS[charter.archetype];
}

/** Honest state only: no percentage is claimed because Work Web areas do not yet persist a formal
 * workshop session. The labels are derived from real artifacts, approvals, and charter status. */
export function workshopState(input: WorkshopStateInput): WorkshopState {
  if (input.pendingApprovals > 0) return {
    label: 'Needs your review',
    detail: `${input.pendingApprovals} action${input.pendingApprovals === 1 ? '' : 's'} waiting in the inbox`,
    tone: 'warn', activeStep: 2,
  };
  if (input.liveStatus === 'done') return {
    label: 'Finished', detail: 'The workshop is marked complete', tone: 'ok', activeStep: 2,
  };
  if (input.earnedArtifacts > 0) return {
    label: 'Keep creating',
    detail: `${input.earnedArtifacts} saved piece${input.earnedArtifacts === 1 ? '' : 's'} here`,
    tone: 'ember', activeStep: 2,
  };
  return { label: 'Ready to start', detail: 'Everything is set for the first session', tone: 'dim', activeStep: 0 };
}

export function workshopSearchText(def: WorkshopDefinition, areaTitle: string, businessTitle: string): string {
  return [def.name, def.kicker, def.outcome, def.description, def.group, areaTitle, businessTitle].join(' ').toLowerCase();
}
