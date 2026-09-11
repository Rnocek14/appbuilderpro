// supabase/functions/_shared/notify.ts
// Posts job events to the user's webhook. Auto-formats for Discord and Slack;
// anything else gets a generic JSON payload. The webhook URL is owner-set, so every post goes
// through safeFetch (deep scan): it's the one user-controlled-URL path that was bypassing the SSRF
// guard, letting a malicious profile row probe internal hosts from the edge runtime.

import { safeFetch } from './safeFetch.ts';

export interface JobEvent {
  event: 'job.completed' | 'job.failed' | 'job.paused' | 'job.waiting_approval';
  jobTitle: string;
  projectName: string;
  detail: string;
  spentUsd: number;
  appUrl?: string;
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * THE OWNER ALARM THAT ALWAYS RINGS SOMEWHERE (SW5.1). notifyText silently no-ops without a
 * webhook — which made SILENCE the failure mode for exactly the operator who never set one up.
 * This resolves the channel: webhook when set, else a plain email to the owner's OWN address
 * via Resend using their verified sender identity. Strictly self-addressed (profiles.email
 * only), so it is a self-notification, not outbound — anything else would need the approval
 * queue. Returns which channel delivered so callers (Health, the canary) can name the gap
 * honestly instead of assuming.
 */
export async function notifyOwner(admin: AdminClient, ownerId: string, text: string): Promise<'webhook' | 'email' | 'none'> {
  try {
    const { data: prof } = await admin.from('profiles').select('webhook_url, email').eq('id', ownerId).maybeSingle();
    const webhook = (prof as { webhook_url?: string | null } | null)?.webhook_url;
    if (webhook) { await notifyText(webhook, text); return 'webhook'; }

    const to = (prof as { email?: string | null } | null)?.email;
    const key = Deno.env.get('RESEND_API_KEY');
    if (!to || !key) return 'none';
    const { data: os } = await admin.from('outreach_settings')
      .select('from_name, from_email').eq('owner_id', ownerId).maybeSingle();
    const fromEmail = (os as { from_email?: string | null } | null)?.from_email;
    if (!fromEmail) return 'none';   // no verified sender = no email channel; Health names it
    const fromName = (os as { from_name?: string | null } | null)?.from_name || 'Garvis';
    const subject = text.split('\n')[0].slice(0, 120) || 'Garvis needs you';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? 'email' : 'none';
  } catch {
    return 'none';   // the alarm failing must never break the flow it reports on
  }
}

/** Post a plain text notification to the user's webhook (Discord/Slack auto-format, JSON otherwise). */
export async function notifyText(webhookUrl: string | null | undefined, text: string): Promise<void> {
  if (!webhookUrl) return;
  let body: unknown;
  if (webhookUrl.includes('discord.com/api/webhooks')) body = { content: text.slice(0, 1900) };
  else if (webhookUrl.includes('hooks.slack.com')) body = { text };
  else body = { text };
  try {
    await safeFetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { /* notification failures must never break the flow */ }
}

export async function notify(webhookUrl: string | null | undefined, e: JobEvent): Promise<void> {
  if (!webhookUrl) return;
  const emojiMap = { 'job.completed': '✅', 'job.failed': '❌', 'job.paused': '⏸️', 'job.waiting_approval': '❓' };
  const text =
    `${emojiMap[e.event]} FableForge — ${e.jobTitle} (${e.projectName})\n` +
    `${e.detail}\nSpend so far: $${e.spentUsd.toFixed(2)}` +
    (e.appUrl ? `\n${e.appUrl}` : '');
  let body: unknown;
  if (webhookUrl.includes('discord.com/api/webhooks')) body = { content: text.slice(0, 1900) };
  else if (webhookUrl.includes('hooks.slack.com')) body = { text };
  else body = { ...e, text };
  try {
    await safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Notification failures must never break a job run.
  }
}
