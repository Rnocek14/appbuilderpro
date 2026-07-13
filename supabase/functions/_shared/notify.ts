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
