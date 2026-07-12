// src/pages/OpsInbox.tsx  (/garvis/inbox)
// The one place to READ what came in — email replies + website leads across every world — and
// ANSWER it. Replying routes through the same send_email approval + executor as all outbound, so
// nothing goes out unreviewed. (Distinct from the code-agent's /inbox build-question queue.)

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Inbox as InboxIcon, MessageSquareReply, Send } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn, timeAgo } from '../lib/utils';
import { loadInbox, composeReply, markLeadAnswered, type InboxItem } from '../lib/garvis/inboxRun';
import { rawComplete } from '../lib/aiClient';

export default function OpsInbox() {
  const { toast } = useToast();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [replyTo, setReplyTo] = useState<InboxItem | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const refresh = useCallback(async () => {
    try { setItems(await loadInbox()); } catch { setItems([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  /** UX audit fix: hand-typing replies in an AI OS. Garvis drafts from THEIR actual message —
   *  grounded in the thread only; unknowable facts (prices, dates) become visible [YOU FILL: …]
   *  holes, never inventions. You edit, then queue; the send still gates at Approvals. */
  const draftWithGarvis = async (it: InboxItem) => {
    setDrafting(true);
    try {
      const theirText = (it.kind === 'reply' ? it.body : it.message) || '(no message text)';
      const who = it.kind === 'lead' ? (it.name || it.email) : it.from;
      const r = await rawComplete([
        { role: 'system', content: 'You draft a reply to a warm inbound message for a small-business owner. Warm, direct, under 110 words, plain text. Answer ONLY what their message supports; for anything you cannot know (prices, availability, dates) insert [YOU FILL: what is needed] instead of inventing. One clear next step. No "hope this finds you well".' },
        { role: 'user', content: `They ${it.kind === 'lead' ? 'submitted the website form' : 'replied to our email'}.\nFrom: ${who}\nTheir message:\n"""${theirText.slice(0, 1200)}"""\n\nWrite the reply body only (no subject line).` },
      ], 500);
      const text = r.text.trim();
      if (text) { setBody(text); toast('success', 'Drafted — edit anything, then queue. Holes marked [YOU FILL] are yours.'); }
      else toast('error', 'The draft came back empty — try again or write it directly.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Drafting is unavailable — write it directly.');
    } finally {
      setDrafting(false);
    }
  };

  const openReply = (it: InboxItem) => {
    setReplyTo(it);
    if (it.kind === 'reply') { setSubject(it.subject.startsWith('Re:') ? it.subject : `Re: ${it.subject}`); }
    else { setSubject('Thanks for reaching out'); }
    setBody('');
  };

  const send = async () => {
    if (!replyTo) return;
    const to = replyTo.kind === 'reply' ? replyTo.from : replyTo.email;
    setSending(true);
    try {
      await composeReply({
        to, toName: replyTo.kind === 'lead' ? replyTo.name : null,
        subject, body, worldId: replyTo.kind === 'lead' ? replyTo.worldId : null,
      });
      if (replyTo.kind === 'lead') await markLeadAnswered(replyTo.id).catch(() => {});
      toast('success', 'Reply queued for approval — it sends once you sign off in Approvals.');
      setReplyTo(null); setBody('');
      await refresh();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not queue the reply.'); }
    finally { setSending(false); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <InboxIcon size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Inbox</h1>
            <p className="text-sm text-forge-dim">Every reply and website lead, across all your worlds — read it, answer it. Replies go through Approvals before they send.</p>
          </div>
        </div>

        {items === null ? (
          <div className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<InboxIcon size={20} />} title="Nothing in yet" body="When someone replies to an email or submits your website's form, it lands here — and pings your notification webhook if you set one in Settings." />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                    it.kind === 'lead' ? 'border-forge-ok/40 text-forge-ok' : 'border-forge-ember/40 text-forge-ember')}>
                    {it.kind === 'lead' ? 'lead' : it.classification}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">
                    {it.kind === 'reply' ? it.from : (it.name || it.email)}
                  </span>
                  <span className="text-[10px] text-forge-dim">{timeAgo(it.at)}</span>
                  <button onClick={() => openReply(it)} className="flex items-center gap-1 text-[11px] text-forge-ember hover:underline">
                    <MessageSquareReply size={12} /> reply
                  </button>
                </div>
                {it.kind === 'reply' && it.subject && <p className="mt-1 text-xs font-medium text-forge-ink/80">{it.subject}</p>}
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-forge-dim">
                  {(it.kind === 'reply' ? it.body : it.message) || '(no message body)'}
                </p>
                {replyTo && replyTo.kind === it.kind && replyTo.id === it.id && (
                  <div className="mt-2 space-y-2 border-t border-forge-border/60 pt-2">
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
                      className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Your reply…"
                      className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => void send()} disabled={sending}
                        className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-60">
                        {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue reply
                      </button>
                      <button onClick={() => void draftWithGarvis(it)} disabled={drafting || sending}
                        title="Garvis drafts a reply grounded in their actual message — unknowable facts become [YOU FILL] holes; you edit, then queue."
                        className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-[11px] text-forge-dim hover:border-forge-ember/60 hover:text-forge-ember disabled:opacity-50">
                        {drafting ? <Loader2 size={12} className="animate-spin" /> : '✨'} Draft with Garvis
                      </button>
                      <button onClick={() => setReplyTo(null)} className="text-[11px] text-forge-dim hover:text-forge-ink">cancel</button>
                      <span className="text-[10px] text-forge-dim">Goes to Approvals before it sends.</span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
