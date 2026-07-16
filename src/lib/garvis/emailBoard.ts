// src/lib/garvis/emailBoard.ts
// THE EMAIL ADAPTER for the creative board — pure half. A tile is an email draft (subject + body). Pick
// a kind (Just listed, Free valuation, Referral ask, …), Make a draft written from the real business
// (signer, business, phone, area), spread many out to compare subject-line angles, spin a rendition (a
// different subject), edit, then Send to a contact SEGMENT — which queues ONE approval the clock drains
// under the daily cap (loop closes). Deterministic — verified by emailBoard.verify.ts. Impure half:
// emailBoardRun.ts.
//
// HONESTY: real facts fill in; unknowns are [EDIT] holes; merge fields ({{first_name}}) are left intact
// for the send path to fill per recipient; nothing sends without an approval.

export interface EmailContent {
  kindId: string;
  variant: number;              // which subject-line option is active
  subject: string;
  subjectOptions: string[];     // the kind's subject angles (so renditions can cycle them, pure)
  body: string;
}

export interface EmailMaterials {
  businessName: string;
  agentName: string;            // who signs
  phone: string | null;
  area: string | null;
  realEstate: boolean;
}

export interface EmailKind {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  subjects: (m: EmailMaterials) => string[];
  body: (m: EmailMaterials) => string;
}

const nameOf = (m: EmailMaterials) => ((m.agentName || '').trim() || (m.businessName || '').trim() || '[EDIT: your name]');
const bizOf = (m: EmailMaterials) => ((m.businessName || '').trim() || (m.agentName || '').trim() || '[EDIT: your business]');
const areaOf = (m: EmailMaterials) => ((m.area || '').trim() || '[EDIT: your area]');
function sign(m: EmailMaterials): string {
  const nm = nameOf(m);
  const withBiz = (m.businessName || '').trim() && (m.businessName || '').trim() !== nm ? `${nm}, ${(m.businessName || '').trim()}` : nm;
  return `— ${withBiz}${(m.phone || '').trim() ? `\n${(m.phone || '').trim()}` : ''}`;
}
const greet = 'Hi {{first_name}},';
const email = (m: EmailMaterials, lines: string[]) => [greet, '', ...lines, '', sign(m)].join('\n');

export const EMAIL_KINDS_RE: EmailKind[] = [
  { id: 're_new_listing', label: 'Just listed', emoji: '🏡', hint: 'Tell your list about a new home.',
    subjects: (m) => [`Just listed in ${areaOf(m)}`, 'A new listing you’ll want to see', `${areaOf(m)}: just hit the market`],
    body: (m) => email(m, [`I just listed a home in ${areaOf(m)} I think you’ll want to see: [EDIT: address · price · beds/baths].`, '[EDIT: the one standout feature].', 'Want a private showing before it’s gone? Just reply.']) },
  { id: 're_just_sold', label: 'Just sold', emoji: '🔑', hint: 'Social proof + a soft ask.',
    subjects: (m) => [`Just sold in ${areaOf(m)}`, 'Another one sold near you', 'Sold — and what it means for you'],
    body: (m) => email(m, [`I just closed a sale in ${areaOf(m)} — [EDIT: a real detail, e.g. over asking / in X days].`, 'If you’ve wondered what your own home could sell for right now, I’m happy to run the numbers. Just reply.']) },
  { id: 're_home_value', label: 'Free valuation', emoji: '💵', hint: 'The no-obligation offer that gets replies.',
    subjects: (m) => ['What’s your home worth today?', 'A quick question about your home', 'Curious what your home would sell for?'],
    body: (m) => email(m, [`Homes in ${areaOf(m)} have been [EDIT: moving fast / holding value].`, 'If you’re even a little curious what yours could sell for, I’ll put together a free, no-obligation valuation — no pressure at all.', 'Want one? Just reply “yes.”']) },
  { id: 're_market_update', label: 'Market update', emoji: '📈', hint: 'One real stat positions you as the source.',
    subjects: (m) => [`${areaOf(m)} market update`, `What’s happening in ${areaOf(m)} real estate`, `Your ${areaOf(m)} market, in 30 seconds`],
    body: (m) => email(m, ['[EDIT: one real stat — median price, days on market, months of inventory].', 'Here’s what it means for you: [EDIT: the plain-English takeaway].', 'Questions about your situation? Just reply.']) },
  { id: 're_past_client', label: 'Check-in', emoji: '👋', hint: 'Warm past clients (referrals live here).',
    subjects: (m) => ['Checking in', 'Thinking of you', 'How’s the home treating you?'],
    body: (m) => email(m, ['It’s been a little while — I just wanted to check in and see how you’re settling in.', 'If you ever need anything (or know someone thinking of moving), I’m always here.']) },
  { id: 're_referral', label: 'Referral ask', emoji: '🙏', hint: 'The best-value email you can send.',
    subjects: (m) => ['A quick favor?', 'Know anyone thinking of moving?', 'The best compliment you can give'],
    body: (m) => email(m, [`Most of my business comes from people like you.`, `If you know anyone in ${areaOf(m)} thinking of buying or selling, I’d be grateful for the introduction — I’ll take great care of them.`]) },
];

export const EMAIL_KINDS_GENERIC: EmailKind[] = [
  { id: 'gen_announcement', label: 'Announcement', emoji: '📣', hint: 'Say the one thing that matters.',
    subjects: (m) => [`Big news from ${bizOf(m)}`, `Something new at ${bizOf(m)}`, 'We’ve got news'],
    body: (m) => email(m, ['We’ve got news: [EDIT: what’s new].', '[EDIT: why it matters to you].', '[EDIT: what to do next].']) },
  { id: 'gen_offer', label: 'Offer', emoji: '🏷️', hint: 'A deal that gets action.',
    subjects: (m) => ['A little something for you', '[EDIT: the offer] — for you', 'Don’t miss this'],
    body: (m) => email(m, ['[EDIT: the offer], just for our people.', '[EDIT: how to claim it + how long it stands].']) },
  { id: 'gen_welcome', label: 'Welcome', emoji: '👋', hint: 'Set expectations for new subscribers.',
    subjects: (m) => ['Welcome!', 'So glad you’re here', 'Here’s what to expect'],
    body: (m) => email(m, [`Welcome to ${bizOf(m)}!`, 'Here’s what you can expect from us: [EDIT: what you’ll send and how often].', 'Reply anytime — a real person reads these.']) },
  { id: 'gen_newsletter', label: 'Newsletter', emoji: '📰', hint: 'A monthly touch that stays useful.',
    subjects: (m) => [`This month at ${bizOf(m)}`, 'Worth a read', 'Your monthly update'],
    body: (m) => email(m, ['Here’s what’s new: [EDIT: 2–3 short updates].', '[EDIT: one genuinely useful tip or link].']) },
];

export function emailKindsFor(realEstate: boolean): EmailKind[] { return realEstate ? EMAIL_KINDS_RE : EMAIL_KINDS_GENERIC; }
export function emailKindById(id: string): EmailKind | null { return [...EMAIL_KINDS_RE, ...EMAIL_KINDS_GENERIC].find((k) => k.id === id) ?? null; }
export function defaultEmailKind(realEstate: boolean): EmailKind { return realEstate ? EMAIL_KINDS_RE[2] /* free valuation */ : EMAIL_KINDS_GENERIC[0]; }

export function buildEmailContent(args: { materials: EmailMaterials; kind: EmailKind; variant?: number }): EmailContent {
  const subjectOptions = args.kind.subjects(args.materials);
  // Repeated Makes of the same kind cycle the subject angle, so twice-pressed Make is never a
  // byte-identical twin — the board always gives you something new to compare.
  const n = Math.max(1, subjectOptions.length);
  const variant = ((args.variant ?? 0) % n + n) % n;
  return { kindId: args.kind.id, variant, subject: subjectOptions[variant], subjectOptions, body: args.kind.body(args.materials) };
}

/** Fields the board-copy AI seam may write — subject + body. Empty/missing fields keep the current
 *  words; merge fields like {{first_name}} pass through exactly as the seam returned them. */
export interface EmailCopyFields { subject?: string; body?: string }
export function applyEmailCopy(content: EmailContent, f: EmailCopyFields): EmailContent {
  return {
    ...content,
    subject: typeof f.subject === 'string' && f.subject.trim() ? f.subject.trim() : content.subject,
    body: typeof f.body === 'string' && f.body.trim() ? f.body : content.body,
  };
}

const SUBJECT_RE = /^\s*(?:subject|call it|title)\s*[:\-]?\s*["“']?(.+?)["”']?\s*$/i;

/** Spin a rendition: a "subject: X" instruction sets the subject; anything else cycles to the next
 *  subject-line angle (a visibly different draft). Body stays — edit it in focus. Pure. */
export function applyEmailRendition(parent: EmailContent, instruction: string): EmailContent {
  const sm = SUBJECT_RE.exec((instruction ?? '').trim());
  if (sm) return { ...parent, subject: sm[1] };
  const n = Math.max(1, parent.subjectOptions.length);
  const variant = (parent.variant + 1) % n;
  return { ...parent, variant, subject: parent.subjectOptions[variant] };
}

export function composeEmailText(content: EmailContent): string {
  return `Subject: ${content.subject}\n\n${content.body}`;
}
