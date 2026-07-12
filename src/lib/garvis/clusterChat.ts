// src/lib/garvis/clusterChat.ts
// CLUSTER STUDIO CHAT — pure core (no Supabase, no DOM; verified by clusterChat.verify.ts).
//
// The chat that lives inside every production area. Design (docs/garvis-studios-blueprint.md §11):
// no new agent system — one reasoning turn over a compiled, byte-budgeted STUDIO CONTEXT, returning
// ONE typed decision the client executes through existing owner-scoped paths:
//
//   reply             — just talk (advice, options, critique)
//   create_artifact   — a new artifact lands in this cluster
//   revise_artifact   — a new VERSION of an existing artifact (v1 is preserved by the DB trigger)
//   propose_approval  — enqueue an approval; the chat can NEVER send/publish/spend directly
//
// The safety story is structural: the edge function only reasons; the client executes; and the only
// outward-facing verb it can produce is a PROPOSAL into the approval queue (app_0022). Same
// discipline as garvis-brain's mode gate, collapsed to a studio-sized contract.

import type { ArtifactKind } from './clustering';
import type { Charter, WorkTool } from './workweb';
import { ARCHETYPES } from './workweb';

// ---------------------------------------------------------------------------
// Decision contract
// ---------------------------------------------------------------------------

// Approval kinds the chat may PROPOSE. Deliberately EXCLUDES send_email and spend: a real send needs
// a constructed outreach_message (recipient + list), which only the Queue tool can build safely — a
// bare chat-proposed send_email would carry no message_id and fail send-email's guard. So the chat
// drafts email COPY as an artifact and points the owner at the Queue tool for the actual send. The
// kinds here are ones the approval queue records safely without a pre-built payload.
export const PROPOSABLE_APPROVAL_KINDS = [
  'publish_post', 'deploy_site', 'crm_action',
] as const;
export type ProposableApprovalKind = (typeof PROPOSABLE_APPROVAL_KINDS)[number];

const ARTIFACT_KINDS: ArtifactKind[] = ['image', 'video', 'diagram', 'research', 'doc', 'link', 'post', 'data'];

export type StudioDecision =
  | { kind: 'reply'; text: string }
  | { kind: 'create_artifact'; artifact: { slug?: string; kind: ArtifactKind; title: string; detail: string }; note: string }
  | { kind: 'revise_artifact'; slug: string; title?: string; detail: string; note: string }
  | { kind: 'propose_approval'; approval_kind: ProposableApprovalKind; title: string; preview: string; note: string };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const STUDIO_SYSTEM = `You are Garvis working INSIDE one production area (a "studio") of the
owner's work web. You have the studio's context: the BUSINESS identity (who this business is —
speak in ITS voice, never a generic one), its charter, its artifacts (with versions), its files,
the brand kit, known unknowns, and recent results. You are a sharp creative/strategic partner —
concrete, calm, zero hype. If the BUSINESS block is absent or a fact isn't in the context, say so
rather than inventing it.

You return EXACTLY ONE JSON object per turn — one of these four decisions:

1. {"kind":"reply","text":"..."}
   Talk: answer, critique, compare options, recommend. Use when no artifact should change.

2. {"kind":"create_artifact","artifact":{"slug":"kebab-case","kind":"doc|post|research|image|video|link|data|diagram","title":"...","detail":"..."},"note":"one line on what you made"}
   Make something new in THIS studio. "detail" is the full content (copy, script, outline, prompt).

3. {"kind":"revise_artifact","slug":"<existing artifact slug>","title":"(optional new title)","detail":"the FULL revised content","note":"one line on what changed"}
   Improve an existing artifact. Return the COMPLETE new content, not a diff. The system preserves
   the old version automatically.

4. {"kind":"propose_approval","approval_kind":"publish_post|deploy_site|crm_action","title":"...","preview":"exactly what would happen","note":"one line"}
   Put a fully-previewed action into the owner's approval queue. You cannot publish, deploy, or act —
   you can only PROPOSE. Nothing happens until the owner approves.

RULES:
- One decision per turn. JSON only, no prose around it, no markdown fences.
- Revise beats create when the user is clearly iterating on an existing artifact.
- Never invent metrics, market data, or claims not present in the context.
- Match the brand kit's tone when writing copy. Keep the studio's flavor (a postcard is not a tweet).
- To actually EMAIL someone: you cannot send. Draft/revise the email copy as an artifact, then tell the
  owner to use the "Queue send" tool to pick a recipient or list — that tool attaches the recipient and
  routes the send through the approval queue. Never claim an email was sent.`;

// ---------------------------------------------------------------------------
// Context pack — compiled, ordered, byte-budgeted (same discipline as mind.ts)
// ---------------------------------------------------------------------------

export interface StudioArtifactCtx { slug: string; kind: string; title: string; detail: string | null; revision: number }
export interface StudioFileCtx { name: string; kind: string; caption?: string | null }
export interface BrandKitCtx {
  name?: string; tone?: string | null; palette?: string[]; fonts?: string[]; compliance_line?: string | null;
}
export interface StudioBusinessCtx {
  name: string;
  principal?: string | null;
  craft?: string | null;
  offerings?: string[];
  audience?: string | null;
  locale?: string | null;
  tone?: string | null;
  dnaLines?: string[];           // key WorldDNA facts, pre-rendered ("value: …", "model: …")
}
export interface StudioContextInput {
  webTitle: string;
  objective?: string | null;
  cluster: { title: string; summary: string; charter: Charter };
  tools: WorkTool[];
  artifacts: StudioArtifactCtx[];
  files: StudioFileCtx[];
  business?: StudioBusinessCtx | null;   // THE WORLD's identity — the voice every draft speaks in
  openQuestions?: string[];              // what Garvis knows it doesn't know (from world intelligence)
  beliefs?: string[];                    // evidence-standing Mind beliefs, pre-labeled with verdicts
                                         // (design review P2: considered opinions were write-only)
  brandKit?: BrandKitCtx | null;
  audience?: { lists: number; contacts: number } | null;
  results?: { sent: number; replies: number; pendingApprovals: number } | null;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Compile the studio context: charter first (identity), then brand voice, then the working set
 * (artifacts), then supporting facts. Trimmed to fit `budgetBytes` — artifacts get the remaining
 * room split between them, most recent (later in list) favored equally via per-artifact caps.
 */
export function compileStudioContext(input: StudioContextInput, budgetBytes = 9000): string {
  const meta = ARCHETYPES[input.cluster.charter.archetype];
  const head: string[] = [
    `STUDIO: ${input.cluster.title} — ${meta.label} (${input.cluster.charter.flavor})`,
    `PURPOSE: ${oneLine(input.cluster.summary).slice(0, 200)}`,
    `WEB: ${input.webTitle}${input.objective ? ` — objective: ${oneLine(input.objective).slice(0, 200)}` : ''}`,
    `TOOLS HERE: ${input.tools.map((t) => t.label).join(' · ') || 'none'}`,
  ];
  // THE BUSINESS — the single most important block: every draft must speak THIS identity's voice.
  // Absent for legacy worlds without a synthesized context; the system prompt tells the model to
  // say so rather than invent one.
  if (input.business) {
    const b = input.business;
    const bits = [
      `name: ${b.name}`,
      b.principal && `principal: ${oneLine(b.principal).slice(0, 80)}`,
      b.craft && `does: ${oneLine(b.craft).slice(0, 120)}`,
      b.offerings?.length && `offerings: ${b.offerings.slice(0, 6).join(', ').slice(0, 160)}`,
      b.audience && `audience: ${oneLine(b.audience).slice(0, 120)}`,
      b.locale && `locale: ${oneLine(b.locale).slice(0, 60)}`,
      b.tone && `voice: ${oneLine(b.tone).slice(0, 80)}`,
    ].filter(Boolean);
    head.push(`BUSINESS: ${bits.join(' | ')}`);
    for (const line of (b.dnaLines ?? []).slice(0, 4)) head.push(`  DNA — ${oneLine(line).slice(0, 160)}`);
  }
  if (input.openQuestions?.length) {
    head.push(`KNOWN UNKNOWNS (don't guess these — ask or defer): ${input.openQuestions.slice(0, 3).map((q) => oneLine(q).slice(0, 100)).join(' · ')}`);
  }
  if (input.beliefs?.length) {
    head.push(`WHAT THE RECORD BELIEVES (evidence-counted — weigh by verdict, contradict only with reason): ${input.beliefs.slice(0, 4).map((b) => oneLine(b).slice(0, 140)).join(' · ')}`);
  }
  if (input.brandKit) {
    const bk = input.brandKit;
    const bits = [
      bk.tone && `tone: ${oneLine(bk.tone).slice(0, 120)}`,
      bk.palette?.length && `palette: ${bk.palette.slice(0, 5).join(' ')}`,
      bk.fonts?.length && `fonts: ${bk.fonts.slice(0, 3).join(', ')}`,
      bk.compliance_line && `compliance: ${oneLine(bk.compliance_line).slice(0, 120)}`,
    ].filter(Boolean);
    if (bits.length) head.push(`BRAND: ${bits.join(' | ')}`);
  }
  if (input.audience) head.push(`AUDIENCE: ${input.audience.lists} list(s), ${input.audience.contacts} contact(s)`);
  if (input.results) head.push(`RESULTS: sent ${input.results.sent}, replies ${input.results.replies}, awaiting approval ${input.results.pendingApprovals}`);
  if (input.files.length) head.push(`FILES: ${input.files.slice(0, 12).map((f) => f.caption ? `${f.name} — ${f.caption.slice(0, 100)}` : f.name).join(' | ')}`);

  const headText = head.join('\n');
  const remaining = Math.max(600, budgetBytes - headText.length - 40);

  const arts = input.artifacts.slice(0, 12);
  const lines: string[] = ['', 'ARTIFACTS IN THIS STUDIO:'];
  if (!arts.length) {
    lines.push('(none yet)');
  } else {
    const per = Math.max(120, Math.floor(remaining / arts.length) - 60);
    for (const a of arts) {
      const body = oneLine(a.detail ?? '').slice(0, per);
      lines.push(`- [${a.slug}] (${a.kind}, v${a.revision}) ${a.title}${body ? ` :: ${body}` : ''}`);
    }
  }

  let out = headText + lines.join('\n');
  if (out.length > budgetBytes) out = out.slice(0, budgetBytes - 1) + '…';
  return out;
}

export interface StudioTurn { role: 'user' | 'garvis'; content: string }

/** The user message the model sees: context + short history + the new ask. */
export function buildStudioUser(context: string, history: StudioTurn[], message: string): string {
  const recent = history.slice(-6).map((t) => `${t.role === 'user' ? 'OWNER' : 'GARVIS'}: ${oneLine(t.content).slice(0, 300)}`);
  return [
    context,
    recent.length ? `\nRECENT CONVERSATION:\n${recent.join('\n')}` : '',
    `\nOWNER SAYS: ${message.trim()}`,
    '\nRespond with exactly one decision JSON object.',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Decision parsing — tolerant; garbage degrades to a reply, never a throw
// ---------------------------------------------------------------------------

function extractJson(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

const str = (v: unknown, max = 20000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Parse the model's decision. Anything malformed becomes {kind:'reply'} carrying the raw text —
 *  the studio never dead-ends on a bad JSON, and nothing unsafe can fall out of garbage. */
export function parseStudioDecision(raw: string): StudioDecision {
  const fallback: StudioDecision = { kind: 'reply', text: raw.trim().slice(0, 4000) || '…' };
  const p = extractJson(raw);
  if (!p) return fallback;

  switch (p.kind) {
    case 'reply': {
      const text = str(p.text, 8000);
      return text ? { kind: 'reply', text } : fallback;
    }
    case 'create_artifact': {
      const a = (p.artifact ?? {}) as Record<string, unknown>;
      const kind = ARTIFACT_KINDS.includes(a.kind as ArtifactKind) ? (a.kind as ArtifactKind) : 'doc';
      const title = str(a.title, 200);
      const detail = str(a.detail);
      if (!title || !detail) return fallback;
      const slug = str(a.slug, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || undefined;
      return { kind: 'create_artifact', artifact: { slug, kind, title, detail }, note: str(p.note, 300) || `Created "${title}"` };
    }
    case 'revise_artifact': {
      const slug = str(p.slug, 120);
      const detail = str(p.detail);
      if (!slug || !detail) return fallback;
      return {
        kind: 'revise_artifact', slug, detail,
        title: str(p.title, 200) || undefined,
        note: str(p.note, 300) || 'Revised',
      };
    }
    case 'propose_approval': {
      const ak = p.approval_kind as ProposableApprovalKind;
      if (!PROPOSABLE_APPROVAL_KINDS.includes(ak)) return fallback;
      const title = str(p.title, 200);
      const preview = str(p.preview, 8000);
      if (!title || !preview) return fallback;
      return { kind: 'propose_approval', approval_kind: ak, title, preview, note: str(p.note, 300) || 'Queued for approval' };
    }
    default:
      return fallback;
  }
}

/** One-line summary of a decision for the transcript / toast. */
export function describeDecision(d: StudioDecision): string {
  switch (d.kind) {
    case 'reply': return d.text;
    case 'create_artifact': return d.note;
    case 'revise_artifact': return d.note;
    case 'propose_approval': return `${d.note} — waiting in Approvals.`;
  }
}

// ---------------------------------------------------------------------------
// Line diff — enough for a version-to-version "what changed" view. Pure.
// ---------------------------------------------------------------------------

export interface DiffLine { type: 'same' | 'added' | 'removed'; text: string }

/** Simple LCS line diff (O(n*m), fine for artifact-sized text; inputs capped defensively). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n').slice(0, 400);
  const b = after.split('\n').slice(0, 400);
  const n = a.length, m = b.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'removed', text: a[i] }); i++; }
    else { out.push({ type: 'added', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'removed', text: a[i] }); i++; }
  while (j < m) { out.push({ type: 'added', text: b[j] }); j++; }
  return out;
}
