// src/pages/Queue.tsx  (/garvis/queue)
// THE QUEUE — the one room for everything awaiting a human. The design review found "what's
// waiting on me?" split across three pages (ops inbox / approvals / build questions); this merges
// them into lanes with one keyboard model. Decisions execute through the same spine as always;
// questions unblock builds inline; messages reply through the one send path. Reversible actions
// (reject, done) act instantly and offer Undo — consequences (approve) still ask nothing twice
// but can never be unsent, so they get no false undo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox as InboxIcon, Loader2, MessageSquareReply, ScrollText, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button, EmptyState, Input, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn, timeAgo } from '../lib/utils';
import { rawComplete } from '../lib/aiClient';
import { useInbox } from '../hooks/useAutopilot';
import type { AgentQuestion } from '../types';
import { KIND_META } from '../components/garvis/approvalMeta';
import {
  listApprovals, approveAndExecute, rejectApproval, reopenApproval, listExecutionRuns,
  type Approval, type ExecutionRun,
} from '../lib/garvis/execution';
import {
  loadInbox, composeReply, markLeadAnswered, markReplyHandled, unmarkReplyHandled, reopenLead,
  draftContext, type InboxItem,
} from '../lib/garvis/inboxRun';

type Row =
  | { key: string; lane: 'decision'; a: Approval }
  | { key: string; lane: 'question'; q: AgentQuestion }
  | { key: string; lane: 'message'; m: InboxItem };

type Undoable = { label: string; run: () => Promise<void> };

export default function Queue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'queue' | 'history'>(params.get('tab') === 'history' ? 'history' : 'queue');

  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const { questions, answer, skip } = useInbox();
  const pendingQuestions = useMemo(() => questions.filter((q) => q.status === 'pending'), [questions]);

  const [actingId, setActingId] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // composer
  const [replyTo, setReplyTo] = useState<InboxItem | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  // undo bar — one at a time; a new undoable replaces the last (its window has passed its moment)
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerUndo = (label: string, run: () => Promise<void>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoable({ label, run });
    undoTimer.current = setTimeout(() => setUndoable(null), 6000);
  };
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // history tab — refetched on EVERY entry (review fix: a one-time latch meant "see History"
  // after a failed execution pointed at a stale list that didn't contain the failure).
  const [decided, setDecided] = useState<Approval[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);

  const refresh = useCallback(async () => {
    try { setApprovals(await listApprovals('pending')); } catch { setApprovals((prev) => prev ?? []); }
    try { setItems(await loadInbox()); } catch { setItems((prev) => prev ?? []); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (tab !== 'history') return;
    void (async () => {
      try {
        const [all, r] = await Promise.all([listApprovals('all', 40), listExecutionRuns(40)]);
        setDecided(all.filter((a) => a.status !== 'pending'));
        setRuns(r);
      } catch { /* history renders what it has */ }
    })();
  }, [tab]);

  const rows: Row[] = useMemo(() => [
    ...(approvals ?? []).map((a): Row => ({ key: `d-${a.id}`, lane: 'decision', a })),
    ...pendingQuestions.map((q): Row => ({ key: `q-${q.id}`, lane: 'question', q })),
    ...(items ?? []).map((m): Row => ({ key: `m-${m.kind}-${m.id}`, lane: 'message', m })),
  ], [approvals, pendingQuestions, items]);

  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, rows.length - 1))); }, [rows.length]);
  useEffect(() => {
    const el = rows[sel] && rowRefs.current.get(rows[sel].key);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel, rows]);

  // ---- actions -------------------------------------------------------------

  const decide = async (a: Approval, approve: boolean) => {
    setActingId(a.id);
    const prev = approvals ?? [];
    setApprovals(prev.filter((x) => x.id !== a.id)); // instant — the card leaves NOW
    try {
      if (!approve) {
        await rejectApproval(a.id);
        offerUndo(`Rejected “${a.title}”`, async () => { await reopenApproval(a.id); await refresh(); });
      } else {
        const res = await approveAndExecute(a);
        if (res.ok) {
          const r = res.result as { executed?: boolean; url?: string | null; needsWorkspace?: boolean; projectId?: string } | undefined;
          if (a.kind === 'deploy_site' && r?.url) { toast('success', `Deployed — live at ${r.url}`); window.open(r.url, '_blank'); }
          else if (r?.needsWorkspace && r.projectId) { toast('info', 'Approved — open the project and Publish to complete.'); navigate(`/project/${r.projectId}`); }
          else if (r?.executed !== false) toast('success', a.kind === 'send_email' ? 'Approved and sent.' : 'Approved and executed.');
          else toast('success', 'Approved — recorded for you to run where the capability lives.');
        } else toast('error', res.error ?? 'Execution failed — see History.');
      }
      void refresh();
    } catch (e) {
      setApprovals(prev); // decision failed — the card returns honestly
      toast('error', e instanceof Error ? e.message : 'Could not act on that.');
    } finally { setActingId(null); }
  };

  const done = async (m: InboxItem) => {
    const prev = items ?? [];
    setItems(prev.filter((x) => !(x.kind === m.kind && x.id === m.id)));
    try {
      if (m.kind === 'reply') {
        await markReplyHandled(m.id);
        offerUndo('Marked handled', async () => { await unmarkReplyHandled(m.id); await refresh(); });
      } else {
        await markLeadAnswered(m.id);
        offerUndo('Lead marked answered', async () => { await reopenLead(m.id); await refresh(); });
      }
    } catch (e) {
      setItems(prev);
      toast('error', e instanceof Error ? e.message : 'Could not mark that handled.');
    }
  };

  const openReply = (m: InboxItem) => {
    setReplyTo(m);
    if (m.kind === 'reply') setSubject(m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`);
    else setSubject('Thanks for reaching out');
    setBody('');
  };

  /** Draft grounded in the thread AND the record: contact stage/name (the relationship) plus the
   *  most recent email you actually approved (your voice) — the review's "outcomes teach the
   *  drafters" hook. Unknowable facts stay [YOU FILL] holes, never inventions. */
  const draftWithGarvis = async (m: InboxItem) => {
    setDrafting(true);
    try {
      const theirText = (m.kind === 'reply' ? m.body : m.message) || '(no message text)';
      const email = m.kind === 'reply' ? m.from : m.email;
      const who = m.kind === 'lead' ? (m.name || m.email) : m.from;
      const ctx = await draftContext(email);
      const known = [
        ctx.name ? `Their name on record: ${ctx.name}.` : null,
        ctx.stage ? `Pipeline stage: ${ctx.stage} — match the warmth to the relationship.` : null,
      ].filter(Boolean).join(' ');
      const r = await rawComplete([
        { role: 'system', content: 'You draft a reply to a warm inbound message for a small-business owner. Warm, direct, under 110 words, plain text. Answer ONLY what their message supports; for anything you cannot know (prices, availability, dates) insert [YOU FILL: what is needed] instead of inventing. One clear next step. No "hope this finds you well".' + (ctx.toneExample ? `\n\nMatch the owner's actual voice. A real email they approved and sent:\n"""${ctx.toneExample}"""` : '') },
        { role: 'user', content: `They ${m.kind === 'lead' ? 'submitted the website form' : 'replied to our email'}.\nFrom: ${who}\n${known}\nTheir message:\n"""${theirText.slice(0, 1200)}"""\n\nWrite the reply body only (no subject line).` },
      ], 500);
      const text = r.text.trim();
      if (text) { setBody(text); toast('success', 'Drafted — edit anything, then queue. Holes marked [YOU FILL] are yours.'); }
      else toast('error', 'The draft came back empty — try again or write it directly.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Drafting is unavailable — write it directly.');
    } finally { setDrafting(false); }
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
      if (replyTo.kind === 'reply') await markReplyHandled(replyTo.id).catch(() => {});
      toast('success', 'Reply staged — approve the send in Decisions above.');
      setReplyTo(null); setBody('');
      await refresh();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not queue the reply.'); }
    finally { setSending(false); }
  };

  // ---- keyboard ------------------------------------------------------------
  // j/k move · a approve · x reject · r reply · d done · Enter = the row's primary action.
  // Safety rails (adversarial review): silent while ANY interactive element has focus — a
  // focused button owns its own Enter (the review caught Enter-on-Reject rerouting to APPROVE);
  // auto-repeat never fires (holding 'a' must not walk the lane approving everything); and a
  // decision in flight blocks the next one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'queue' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'A' || t.isContentEditable)) return;
      const row = rows[sel];
      if (e.key === 'j') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
      else if (e.key === 'k') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (!row) return;
      else if (e.key === 'a' && row.lane === 'decision') { e.preventDefault(); if (!actingId) void decide(row.a, true); }
      else if (e.key === 'x' && row.lane === 'decision') { e.preventDefault(); if (!actingId) void decide(row.a, false); }
      else if (e.key === 'r' && row.lane === 'message') { e.preventDefault(); openReply(row.m); }
      else if (e.key === 'd' && row.lane === 'message') { e.preventDefault(); void done(row.m); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (row.lane === 'decision') { if (!actingId) void decide(row.a, true); }
        else if (row.lane === 'message') openReply(row.m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sel, tab, approvals, items, actingId]);

  const loading = approvals === null || items === null;
  const selKey = rows[sel]?.key;
  const laneHead = (label: string) => (
    <h2 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-forge-dim first:mt-0">{label}</h2>
  );
  const selectable = (key: string) =>
    cn('rounded-xl border bg-forge-panel/40 p-3 transition-colors',
      selKey === key ? 'border-forge-ember/60 ring-1 ring-forge-ember/30' : 'border-forge-border');

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <InboxIcon size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Queue</h1>
            <p className="text-sm text-forge-dim">Everything waiting on you — decisions, blocked builds, and people who wrote in. One pass, then back to work.</p>
          </div>
          <div className="flex shrink-0 rounded-lg border border-forge-border p-0.5 text-xs">
            {(['queue', 'history'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('rounded-md px-2.5 py-1 capitalize', tab === t ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'history' ? (
          <div>
            {laneHead('Decisions made')}
            {decided.length === 0 ? <p className="text-sm text-forge-dim">No decided approvals yet.</p> : (
              <ul className="space-y-1.5">
                {decided.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg border border-forge-border px-3 py-2 text-xs">
                    <Badge tone={a.status === 'approved' ? 'ok' : 'err'}>{a.status}</Badge>
                    <span className="min-w-0 flex-1 truncate text-forge-ink">{a.title}</span>
                    <span className="text-forge-dim">{a.decided_at ? timeAgo(a.decided_at) : timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* Answered build questions (review fix: the old /inbox rendered these — the record
                of what you told the agent must stay readable after the merge). */}
            {questions.some((q) => q.status !== 'pending') && (
              <>
                {laneHead('Build questions answered')}
                <ul className="space-y-1.5">
                  {questions.filter((q) => q.status !== 'pending').slice(0, 10).map((q) => (
                    <li key={q.id} className="rounded-lg border border-forge-border px-3 py-2 text-xs">
                      <span className="text-forge-ink">{q.question}</span>
                      <span className="mt-0.5 block text-forge-dim">
                        {q.status === 'skipped' ? 'Skipped — the agent used its judgment.' : q.answer}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h2 className="mb-2 mt-8 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-forge-dim"><ScrollText size={13} /> Execution log</h2>
            {runs.length === 0 ? <p className="text-sm text-forge-dim">No external actions yet. Every send, deploy, and charge lands here.</p> : (
              <ul className="space-y-1.5">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg border border-forge-border px-3 py-2 text-xs">
                    <Badge tone={r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'err' : 'dim'}>{r.status}</Badge>
                    <span className="font-mono text-forge-dim">{r.connector}</span>
                    <span className="text-forge-ink">{r.action}</span>
                    {r.error && <span className="truncate text-forge-err">{r.error}</span>}
                    <span className="ml-auto text-forge-dim">{timeAgo(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : loading ? (
          <Spinner label="Loading the queue…" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} />} title="Queue is clear"
            body="Approvals, blocked build questions, replies, and website leads all land here. Right now: nothing needs you." />
        ) : (
          <>
            {(approvals ?? []).length > 0 && laneHead('Decisions — the only irreversible clicks')}
            <ul className="space-y-2">
              {(approvals ?? []).map((a) => (
                <li key={`d-${a.id}`} ref={(el) => { if (el) rowRefs.current.set(`d-${a.id}`, el); }}
                  className={selectable(`d-${a.id}`)} onMouseEnter={() => setSel(rows.findIndex((r) => r.key === `d-${a.id}`))}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-forge-warn/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-forge-warn">
                      {KIND_META[a.kind]?.label ?? String(a.kind).replace(/_/g, ' ')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">{a.title}</span>
                    <span className="text-[10px] text-forge-dim">{timeAgo(a.created_at)}</span>
                    <button onClick={() => void decide(a, true)} disabled={actingId === a.id}
                      className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-[11px] font-medium text-forge-ember hover:bg-forge-ember/20 disabled:opacity-50">
                      {actingId === a.id ? <Loader2 size={11} className="animate-spin" /> : null} Approve
                    </button>
                    <button onClick={() => void decide(a, false)} disabled={actingId === a.id}
                      className="rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:border-forge-err/60 hover:text-forge-err disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                  {a.preview && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-panel/60 p-2 text-[11px] text-forge-dim">{a.preview}</pre>}
                </li>
              ))}
            </ul>

            {pendingQuestions.length > 0 && laneHead('Questions — builds are blocked on you')}
            <ul className="space-y-2">
              {pendingQuestions.map((q) => (
                <li key={`q-${q.id}`} ref={(el) => { if (el) rowRefs.current.set(`q-${q.id}`, el); }}
                  className={selectable(`q-${q.id}`)} onMouseEnter={() => setSel(rows.findIndex((r) => r.key === `q-${q.id}`))}>
                  <QuestionRow q={q} onAnswer={answer} onSkip={skip} />
                </li>
              ))}
            </ul>

            {(items ?? []).length > 0 && laneHead('Messages — people who wrote to you')}
            <ul className="space-y-2">
              {(items ?? []).map((m) => (
                <li key={`m-${m.kind}-${m.id}`} ref={(el) => { if (el) rowRefs.current.set(`m-${m.kind}-${m.id}`, el); }}
                  className={selectable(`m-${m.kind}-${m.id}`)} onMouseEnter={() => setSel(rows.findIndex((r) => r.key === `m-${m.kind}-${m.id}`))}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                      m.kind === 'lead' ? 'border-forge-ok/40 text-forge-ok' : 'border-forge-ember/40 text-forge-ember')}>
                      {m.kind === 'lead' ? 'lead' : m.classification}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">{m.kind === 'reply' ? m.from : (m.name || m.email)}</span>
                    <span className="text-[10px] text-forge-dim">{timeAgo(m.at)}</span>
                    <button onClick={() => openReply(m)} className="flex items-center gap-1 text-[11px] text-forge-ember hover:underline">
                      <MessageSquareReply size={12} /> reply
                    </button>
                    <button onClick={() => void done(m)} title="Handled — leaves the lane; the record keeps the row (Undo below for 6s)"
                      className="text-[11px] text-forge-dim hover:text-forge-ink">done</button>
                  </div>
                  {m.kind === 'reply' && m.subject && <p className="mt-1 text-xs font-medium text-forge-ink/80">{m.subject}</p>}
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-forge-dim">{(m.kind === 'reply' ? m.body : m.message) || '(no message body)'}</p>
                  {replyTo && replyTo.kind === m.kind && replyTo.id === m.id && (
                    <div className="mt-2 space-y-2 border-t border-forge-border/60 pt-2">
                      <input autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
                        onKeyDown={(e) => { if (e.key === 'Escape') setReplyTo(null); }}
                        className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Your reply… (⌘↵ to queue)"
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setReplyTo(null);
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !sending) void send();
                        }}
                        className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                      <div className="flex items-center gap-2">
                        <button onClick={() => void send()} disabled={sending}
                          className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-60">
                          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Queue reply
                        </button>
                        <button onClick={() => void draftWithGarvis(m)} disabled={drafting || sending}
                          title="Garvis drafts from their message, your contact record, and the voice of emails you actually approved."
                          className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-[11px] text-forge-dim hover:border-forge-ember/60 hover:text-forge-ember disabled:opacity-50">
                          {drafting ? <Loader2 size={12} className="animate-spin" /> : '✨'} Draft with Garvis
                        </button>
                        <button onClick={() => setReplyTo(null)} className="text-[11px] text-forge-dim hover:text-forge-ink">cancel</button>
                        <span className="text-[10px] text-forge-dim">Stages a Decision above before it sends.</span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-center font-mono text-[10px] text-forge-dim/70">
              j/k move · a approve · x reject · r reply · d done · esc closes the composer
            </p>
          </>
        )}
      </div>

      {/* Undo bar — reversible actions act instantly and regret politely. */}
      {undoable && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-forge-border bg-forge-raised px-4 py-2.5 shadow-lift animate-fadeInUp [animation-duration:0.15s]">
          <span className="text-sm text-forge-ink">{undoable.label}</span>
          <button
            onClick={() => { const u = undoable; setUndoable(null); if (undoTimer.current) clearTimeout(undoTimer.current); void u.run().catch(() => toast('error', 'Could not undo that.')); }}
            className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-xs font-medium text-forge-ember hover:bg-forge-ember/20">
            <Undo2 size={12} /> Undo
          </button>
        </div>
      )}
    </AppShell>
  );
}

/** Inline build-question answering — the /inbox flow, living in the lane (answering flips the
 *  job back to queued and the build resumes). */
function QuestionRow({ q, onAnswer, onSkip }: {
  q: AgentQuestion;
  onAnswer: (id: string, text: string) => Promise<void>;
  onSkip: (id: string) => Promise<void>;
}) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    await onAnswer(q.id, text.trim());
    setBusy(false);
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-forge-ink">{q.question}</p>
        <div className="flex shrink-0 items-center gap-2">
          {q.blocking && <Badge tone="warn">Blocking</Badge>}
          <span className="text-[10px] text-forge-dim">{timeAgo(q.created_at)}</span>
        </div>
      </div>
      {q.context && <p className="mt-1 text-xs text-forge-dim">{q.context}</p>}
      <div className="mt-2 space-y-2">
        {q.options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <Button key={opt} size="sm" variant="outline" disabled={busy} onClick={() => void send(opt)}>{opt}</Button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input placeholder="Or answer in your own words…" value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send(custom)} />
          <Button size="sm" disabled={busy || !custom.trim()} onClick={() => void send(custom)}>Send</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onSkip(q.id)}>Skip</Button>
        </div>
      </div>
    </div>
  );
}
