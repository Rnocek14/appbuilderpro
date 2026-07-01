// src/lib/garvis/channels.ts
// Publish channels for the Marketing Worker's approve-to-publish gate. The honest constraint: a
// direct-mode browser app can't auto-post to X/LinkedIn (OAuth) or send email (server). What it CAN do
// is one-click open the platform's composer PREFILLED with the approved asset — a genuine
// approve→publish action, not faked auto-posting. buildShareUrl is pure (testable); the window.open +
// status flip live in useMarketing. Real OAuth auto-posting plugs in behind this same gate later.

import type { MarketingAssetKind } from '../../types';

export type PublishChannel = 'x' | 'email' | 'linkedin' | 'manual';

export const CHANNEL_OPTS: { value: PublishChannel; label: string; prefilled: boolean }[] = [
  { value: 'x', label: 'X / Twitter (opens prefilled)', prefilled: true },
  { value: 'email', label: 'Email (opens your mail client)', prefilled: true },
  { value: 'linkedin', label: 'LinkedIn (copy — no prefill API)', prefilled: false },
  { value: 'manual', label: 'Manual / copy', prefilled: false },
];

const enc = encodeURIComponent;

/** The plain-text rendering of a social post for a composer. */
export function postText(content: Record<string, unknown>): string {
  const s = (k: string) => (typeof content[k] === 'string' ? (content[k] as string) : '');
  const tags = Array.isArray(content.hashtags) ? (content.hashtags as string[]).filter((t) => typeof t === 'string') : [];
  return [s('hook'), s('body'), s('cta'), tags.join(' ')].filter(Boolean).join('\n\n').trim();
}

/**
 * Build a one-click composer URL for an approved asset, or null when the channel has no reliable
 * prefill (manual/linkedin → the UI offers copy instead). X caps the intent text so it isn't rejected.
 */
export function buildShareUrl(channel: PublishChannel, kind: MarketingAssetKind, content: Record<string, unknown>): string | null {
  if (channel === 'x') {
    const text = postText(content).slice(0, 270);
    return `https://twitter.com/intent/tweet?text=${enc(text)}`;
  }
  if (channel === 'email') {
    const subject = typeof content.subject === 'string' ? content.subject : 'From Garvis';
    const body = [typeof content.body === 'string' ? content.body : postText(content), typeof content.cta === 'string' ? content.cta : '']
      .filter(Boolean).join('\n\n');
    return `mailto:?subject=${enc(subject)}&body=${enc(body)}`;
  }
  return null; // manual / linkedin → copy in the UI
}

/** Plain text to copy for any asset kind (used for manual/linkedin and the Copy buttons). */
export function copyText(kind: MarketingAssetKind, content: Record<string, unknown>): string {
  const s = (k: string) => (typeof content[k] === 'string' ? (content[k] as string) : '');
  if (kind === 'email') return `Subject: ${s('subject')}\n\n${s('body')}\n\n${s('cta')}`;
  if (kind === 'landing_page') {
    const sections = Array.isArray(content.sections) ? (content.sections as Record<string, unknown>[]) : [];
    const body = sections.map((x) => `## ${typeof x.heading === 'string' ? x.heading : ''}\n${typeof x.body === 'string' ? x.body : ''}`).join('\n\n');
    return `# ${s('headline')}\n${s('subhead')}\n\n${body}\n\n[${s('cta')}]`;
  }
  return postText(content);
}
