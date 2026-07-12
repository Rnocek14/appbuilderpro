// src/pages/Contacts.tsx  (/garvis/contacts)
// The CRM: every contact, editable, with a pipeline stage, notes, and a per-contact activity
// timeline (messages sent / replies / leads / notes). The audit's "no contacts CRUD" gap, closed.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Users, Trash2, ChevronRight } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn, timeAgo } from '../lib/utils';
import { listContacts, type ContactRow } from '../lib/garvis/workwebRun';
import {
  getContact, updateContact, deleteContact, listNotes, addNote, contactTimeline,
  type ContactDetail, type ContactNote, type ContactStage,
} from '../lib/garvis/contactsRun';
import type { TimelineItem } from '../lib/garvis/contactsCore';

const STAGES: ContactStage[] = ['new', 'contacted', 'qualified', 'customer', 'lost'];
const STAGE_TONE: Record<ContactStage, string> = {
  new: 'text-forge-dim', contacted: 'text-forge-ember', qualified: 'text-forge-ok',
  customer: 'text-forge-ok', lost: 'text-forge-warn',
};

export default function Contacts() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    // A failed load must SAY it failed — rendering "No contacts yet" over a network error told
    // the user their contacts were gone (system scan).
    try { setLoadFailed(false); setRows(await listContacts(500)); }
    catch { setLoadFailed(true); setRows([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Users size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Contacts</h1>
            <p className="text-sm text-forge-dim">Everyone across your worlds — stage, notes, and the full history of what you've sent and heard back.</p>
          </div>
        </div>

        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : loadFailed ? (
          <div className="rounded-xl border border-forge-err/30 bg-forge-err/10 p-4 text-sm text-forge-err">
            Couldn't load your contacts — this is a connection problem, not an empty list.{' '}
            <button onClick={() => void refresh()} className="underline">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No contacts yet" body="Contacts arrive from website leads, prospect scans, and CSV uploads in your worlds' audience areas." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-2">
              {rows.map((c) => (
                <button key={c.id} onClick={() => setSelected(c.id)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                    selected === c.id ? 'bg-forge-ember/10' : 'hover:bg-forge-raised')}>
                  <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">{c.full_name || c.email}</span>
                  <span className="text-[10px] text-forge-dim">{c.email_status}</span>
                  <ChevronRight size={13} className="text-forge-dim/50" />
                </button>
              ))}
            </div>
            <div>
              {selected ? <ContactDetailPane key={selected} id={selected} onDeleted={() => { setSelected(null); void refresh(); }} onStageChanged={refresh} />
                : <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-center text-sm text-forge-dim">Pick a contact to see their history.</div>}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ContactDetailPane({ id, onDeleted, onStageChanged }: { id: string; onDeleted: () => void; onStageChanged: () => void }) {
  const { toast } = useToast();
  const [c, setC] = useState<ContactDetail | null>(null);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [detailFailed, setDetailFailed] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    let live = true;
    setDetailFailed(false);
    void getContact(id).then((d) => {
      if (!live) return;
      if (!d) { setDetailFailed(true); return; } // a failed load must not spin forever
      setC(d); setNameDraft(d.full_name ?? '');
      void listNotes(id).then((n) => { if (live) setNotes(n); }).catch(() => {});
      void contactTimeline(id, d.email).then((t) => { if (live) setTimeline(t); }).catch(() => {});
    }).catch(() => { if (live) setDetailFailed(true); });
    return () => { live = false; };
  }, [id]);

  const saveStage = async (stage: ContactStage) => {
    try { await updateContact(id, { stage }); setC((p) => p ? { ...p, stage } : p); onStageChanged(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };
  const saveName = async () => {
    if (!c || nameDraft === (c.full_name ?? '')) return;
    try { await updateContact(id, { full_name: nameDraft.trim() || null }); toast('success', 'Saved.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not save.'); }
  };
  const saveNote = async () => {
    if (savingNote || !noteDraft.trim()) return; // two rapid Enters used to write two identical notes
    setSavingNote(true);
    try { const n = await addNote(id, noteDraft); setNotes((p) => [n, ...p]); setNoteDraft('');
      void contactTimeline(id, c?.email ?? '').then(setTimeline).catch(() => {}); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not save the note.'); }
    finally { setSavingNote(false); }
  };
  const remove = async () => {
    try { await deleteContact(id); toast('success', 'Contact deleted.'); onDeleted(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete.'); }
  };

  if (detailFailed) return <div className="rounded-2xl border border-forge-err/30 bg-forge-err/10 p-6 text-sm text-forge-err">Couldn't load this contact — try selecting them again.</div>;
  if (!c) return <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-8 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
        <div className="flex items-start gap-2">
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => void saveName()}
            placeholder="Name" className="flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold text-forge-ink hover:border-forge-border focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void remove()} title="Delete contact" className="text-forge-dim hover:text-forge-warn"><Trash2 size={15} /></button>
        </div>
        <p className="text-sm text-forge-dim">{c.email} · {c.email_status}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button key={s} onClick={() => void saveStage(s)}
              className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors',
                c.stage === s ? cn('border-forge-ember/60', STAGE_TONE[s]) : 'border-forge-border text-forge-dim hover:border-forge-ember/40')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
        <h3 className="text-sm font-semibold text-forge-ink">Notes</h3>
        <div className="mt-2 flex gap-2">
          <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveNote(); }}
            placeholder="Add a note…" className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void saveNote()} className="rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">Add</button>
        </div>
        {notes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {notes.map((n) => (
              <li key={n.id} className="text-xs text-forge-dim"><span className="text-forge-ink/80">{n.body}</span> <span className="text-[10px]">· {timeAgo(n.created_at)}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
        <h3 className="text-sm font-semibold text-forge-ink">Activity</h3>
        {timeline.length === 0 ? (
          <p className="mt-1 text-xs text-forge-dim">Nothing yet — sends, replies, and leads for this contact will appear here.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {timeline.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  t.tone === 'in' ? 'bg-forge-ok' : t.tone === 'out' ? 'bg-forge-ember' : 'bg-forge-dim/50')} />
                <span className="min-w-0 flex-1 text-forge-ink/80">{t.text}</span>
                <span className="text-[10px] text-forge-dim">{timeAgo(t.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
