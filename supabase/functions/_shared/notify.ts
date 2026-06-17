// supabase/functions/_shared/notify.ts
// Posts job events to the user's webhook. Auto-formats for Discord and Slack;
// anything else gets a generic JSON payload.

export interface JobEvent {
  event: 'job.completed' | 'job.failed' | 'job.paused' | 'job.waiting_approval';
  jobTitle: string;
  projectName: string;
  detail: string;
  spentUsd: number;
  appUrl?: string;
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
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Notification failures must never break a job run.
  }
}
