// src/lib/garvis/ideaBoard.ts
// THE IDEA BOARD — the universal creative canvas. Marketing channels get postcard/social/email boards;
// EVERYTHING ELSE a project needs gets this one: feature ideas for an app (WealthCharts), automation
// concepts, content angles, revenue experiments. Same spatial lab (make → spread → riff → organize),
// with loop-closers that go somewhere real: an app idea hands off to the app builder as the build
// brief; anything can be copied out as a working brief. The continuous `idea_stream` standing order
// appends fresh AI ideas onto this same board on a clock — Garvis ideating while you sleep.
//
// HONESTY: deterministic seeds are STARTERS that frame the right question with visible [EDIT: …]
// holes — they never invent market claims, user counts, or specifics. Real ideation (grounded on the
// project's real facts) comes from the board-copy seam and degrades honestly without a key.

export type IdeaTag = 'feature' | 'automation' | 'content' | 'growth' | 'revenue' | 'wild';
export const IDEA_TAGS: IdeaTag[] = ['feature', 'automation', 'content', 'growth', 'revenue', 'wild'];

export interface IdeaContent {
  kindId: string;
  tag: IdeaTag;
  title: string;   // the idea in one line
  pitch: string;   // what it is + why it matters for THIS project
  notes: string;   // first steps / risks / open questions — [EDIT] holes for unknowns
}

/** The real facts the seeds + AI may use — the project itself, nothing invented. */
export interface IdeaMaterials { projectName: string; mission: string | null }

export interface IdeaKind {
  id: string; label: string; emoji: string; hint: string; tag: IdeaTag;
  seed: (m: IdeaMaterials) => { title: string; pitch: string; notes: string };
}

const clip = (s: string, n = 60) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const proj = (m: IdeaMaterials) => (m.projectName || '').trim() || '[EDIT: your project]';

export const IDEA_KINDS: IdeaKind[] = [
  { id: 'idea_feature', label: 'Feature', emoji: '🧩', tag: 'feature', hint: 'Something the product should do next.',
    seed: (m) => ({
      title: `A feature ${proj(m)} is missing`,
      pitch: `[EDIT: the user problem you keep seeing]. Solving it inside ${proj(m)} would [EDIT: the payoff — retention, delight, fewer support asks].`,
      notes: '• Who hits this: [EDIT: which users, how often]\n• Smallest honest version: [EDIT: v1 in one sentence]\n• Risk: [EDIT: what could make this not worth it]',
    }) },
  { id: 'idea_automation', label: 'Automation', emoji: '⚙️', tag: 'automation', hint: 'A repeating chore Garvis could take over.',
    seed: (m) => ({
      title: `Automate a ${proj(m)} chore`,
      pitch: `[EDIT: the task you do by hand every week]. On a clock with an approval gate, it stops costing you attention.`,
      notes: '• Trigger: [EDIT: when should it run — daily / on an event]\n• What it produces: [EDIT: a draft, a digest, a list]\n• Human gate: what needs your approval before anything goes out',
    }) },
  { id: 'idea_content', label: 'Content', emoji: '✍️', tag: 'content', hint: 'An angle worth publishing about.',
    seed: (m) => ({
      title: `A content angle for ${proj(m)}`,
      pitch: `[EDIT: the question your audience actually asks]. Answering it plainly builds trust before they ever sign up.`,
      notes: '• Format: [EDIT: post / thread / short video]\n• Hook: [EDIT: the first line]\n• Proof you can offer honestly: [EDIT: real example or lesson]',
    }) },
  { id: 'idea_growth', label: 'Growth', emoji: '📈', tag: 'growth', hint: 'A way more of the right people find it.',
    seed: (m) => ({
      title: `A growth experiment for ${proj(m)}`,
      pitch: `[EDIT: the channel or loop to test]. Cheap to try, measurable within [EDIT: a timeframe], and honest about what "working" means.`,
      notes: '• Hypothesis: [EDIT: if we do X, Y happens]\n• Cost to test: [EDIT: hours / dollars]\n• Kill criteria: [EDIT: the number that says stop]',
    }) },
  { id: 'idea_revenue', label: 'Revenue', emoji: '💵', tag: 'revenue', hint: 'A way it earns (or earns more).',
    seed: (m) => ({
      title: `A revenue idea for ${proj(m)}`,
      pitch: `[EDIT: who would pay and for what]. The honest test is whether [EDIT: a specific user] says yes at [EDIT: a price].`,
      notes: '• Offer: [EDIT: what exactly they get]\n• First 3 people to ask: [EDIT: names or where to find them]\n• Simplest way to collect: [EDIT: invoice / checkout / retainer]',
    }) },
  { id: 'idea_wild', label: 'Wild card', emoji: '🃏', tag: 'wild', hint: 'The one you would not say out loud yet.',
    seed: (m) => ({
      title: `A wild idea for ${proj(m)}`,
      pitch: `[EDIT: the version of ${proj(m)} that feels too ambitious]. Wild ideas earn their keep by naming the assumption that scares you.`,
      notes: '• The scary assumption: [EDIT: what must be true]\n• Cheapest probe: [EDIT: how to test it in a day]\n• If it works: [EDIT: what changes]',
    }) },
];

export function ideaKindById(id: string): IdeaKind | null { return IDEA_KINDS.find((k) => k.id === id) ?? null; }
export function defaultIdeaKind(): IdeaKind { return IDEA_KINDS[0]; }

/** Make a starter idea. A typed idea becomes the TITLE (your words lead); the lens seeds the rest. */
export function buildIdeaContent(args: { materials: IdeaMaterials; kind: IdeaKind; idea?: string }): IdeaContent {
  const s = args.kind.seed(args.materials);
  const typed = (args.idea ?? '').trim();
  return { kindId: args.kind.id, tag: args.kind.tag, title: typed ? clip(typed) : s.title, pitch: s.pitch, notes: s.notes };
}

/** Fields the board-copy AI seam may write. Empty fields keep current words; tag must be a real tag. */
export interface IdeaCopyFields { title?: string; pitch?: string; notes?: string; tag?: string }
export function applyIdeaCopy(content: IdeaContent, f: IdeaCopyFields): IdeaContent {
  return {
    ...content,
    title: typeof f.title === 'string' && f.title.trim() ? clip(f.title.trim()) : content.title,
    pitch: typeof f.pitch === 'string' && f.pitch.trim() ? f.pitch.trim() : content.pitch,
    notes: typeof f.notes === 'string' && f.notes.trim() ? f.notes.trim() : content.notes,
    tag: (IDEA_TAGS as string[]).includes(f.tag ?? '') ? (f.tag as IdeaTag) : content.tag,
  };
}

const TITLE_RE = /^\s*(?:title|call it)\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i;

/** Deterministic rendition: only a "title: X" instruction is possible without AI. Anything richer
 *  returns null — the adapter says so honestly instead of faking a riff. */
export function applyIdeaRendition(parent: IdeaContent, instruction: string): IdeaContent | null {
  const m = TITLE_RE.exec((instruction ?? '').trim());
  return m ? { ...parent, title: clip(m[1]) } : null;
}

/** The idea as a working brief (clipboard / the app-builder handoff). */
export function composeIdeaText(c: IdeaContent, projectName: string): string {
  return [`${c.title} (${c.tag} · ${projectName || 'project'})`, '', c.pitch, '', c.notes].join('\n');
}
