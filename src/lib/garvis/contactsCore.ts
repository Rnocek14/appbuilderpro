// src/lib/garvis/contactsCore.ts
// Pure core of the contacts CRM (no Supabase; verified by contacts.verify.ts): merge the rows a
// contact touches — messages sent, replies received, leads, notes — into ONE timeline, newest
// first, each labeled honestly. No invention: an item exists only if its row exists.

export interface TimelineItem { at: string; kind: 'sent' | 'reply' | 'lead' | 'note'; text: string; tone: 'out' | 'in' | 'note' }

export function mergeTimeline(input: {
  messages: { subject: string | null; status: string; sent_at: string | null; created_at: string }[];
  replies: { subject: string | null; classification: string; received_at: string }[];
  leads: { message: string | null; source: string; created_at: string }[];
  notes: { body: string; created_at: string }[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const m of input.messages) {
    // Only SENT messages are activity — a draft/queued row isn't something that happened yet.
    if (m.status !== 'sent') continue;
    items.push({
      at: m.sent_at ?? m.created_at, kind: 'sent', tone: 'out',
      text: `Sent: ${(m.subject ?? '(no subject)').slice(0, 100)}`,
    });
  }
  for (const r of input.replies) {
    items.push({
      at: r.received_at, kind: 'reply', tone: 'in',
      text: `${r.classification} reply: ${(r.subject ?? '').slice(0, 100)}`.trim(),
    });
  }
  for (const l of input.leads) {
    items.push({
      at: l.created_at, kind: 'lead', tone: 'in',
      text: `Website lead${l.source && l.source !== 'website' ? ` (${l.source})` : ''}${l.message ? `: "${l.message.slice(0, 80)}"` : ''}`,
    });
  }
  for (const n of input.notes) {
    items.push({ at: n.created_at, kind: 'note', tone: 'note', text: n.body.slice(0, 160) });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
