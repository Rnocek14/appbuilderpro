// src/pages/Mind.tsx
// The Mind — the visible surface of the intelligence core (app_0019). Four panels over the record:
// the human-edited identity layer, the live event stream, evidence-counted beliefs, and the decision
// journal. This page is a VIEW over the record; all invariants live in lib/garvis/mind.ts.

import { useMemo, useState } from 'react';
import { Brain, CheckCircle2, CircleDashed, Pencil, Plus, ScrollText, Target, XCircle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button, Card, EmptyState, Input, Spinner, StatCard } from '../components/ui';
import { useMind } from '../hooks/useMind';
import { beliefEvidence, decisionHitRate, isDecisionOpen } from '../lib/garvis/mind';
import type { BeliefVerdict } from '../lib/garvis/mind';
import type { IdentitySlot, MindBelief, MindDecision, MindEvent } from '../types';

const SLOTS: { slot: IdentitySlot; label: string; hint: string }[] = [
  { slot: 'goals', label: 'Goals', hint: 'What are you building toward? Garvis optimizes for this.' },
  { slot: 'values', label: 'Values', hint: 'Lines you will not cross; what matters beyond the numbers.' },
  { slot: 'priorities', label: 'Priorities', hint: 'What comes first right now. Update as seasons change.' },
  { slot: 'voice', label: 'Voice', hint: 'How you write and talk — Garvis matches it in drafts.' },
];

const VERDICT_TONE: Record<BeliefVerdict, 'dim' | 'ok' | 'warn' | 'err'> = {
  tentative: 'dim', supported: 'ok', contested: 'warn', contradicted: 'err',
};

function IdentityPanel() {
  const { identity, saveIdentity } = useMind();
  const [editing, setEditing] = useState<IdentitySlot | null>(null);
  const [draft, setDraft] = useState('');
  const contentOf = (slot: IdentitySlot) => identity.find((d) => d.slot === slot)?.content ?? '';

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Target size={15} className="text-forge-ember" />
        <h2 className="text-sm font-semibold">Identity</h2>
        <span className="text-[11px] text-forge-dim/70">only you write this — it frames every judgment Garvis makes</span>
      </div>
      <div className="space-y-3">
        {SLOTS.map(({ slot, label, hint }) => (
          <div key={slot}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-forge-ink">{label}</span>
              <button
                onClick={() => { setEditing(editing === slot ? null : slot); setDraft(contentOf(slot)); }}
                className="text-forge-dim/60 transition-colors hover:text-forge-ember"
                aria-label={`Edit ${label}`}
              >
                <Pencil size={12} />
              </button>
            </div>
            {editing === slot ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder={hint}
                  className="w-full resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink focus:border-forge-ember focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => { await saveIdentity(slot, draft.trim()); setEditing(null); }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-forge-dim">{contentOf(slot) || <span className="italic text-forge-dim/50">{hint}</span>}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function BeliefRow({ b, events, onLink, onRetire }: {
  b: MindBelief; events: MindEvent[];
  onLink: (beliefId: string, eventId: string, kind: 'supports' | 'contradicts') => Promise<void>;
  onRetire: (id: string) => void;
}) {
  const e = beliefEvidence(b);
  const [picking, setPicking] = useState<null | 'supports' | 'contradicts'>(null);
  const linked = new Set([...b.supporting_event_ids, ...b.contradicting_event_ids]);
  const candidates = events.filter((ev) => !linked.has(ev.id)).slice(0, 8);
  return (
    <li className="rounded-lg border border-forge-border bg-forge-panel/40 px-3 py-2">
      <div className="flex items-start gap-2">
        <Badge tone={VERDICT_TONE[e.verdict]}>{e.verdict}</Badge>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-forge-ink">{b.statement}</p>
          <p className="text-[11px] text-forge-dim/70">{b.scope} · {e.supports} for / {e.contradicts} against</p>
        </div>
        {/* Beliefs earn their standing from linked events — the user declares which real event bears
            on the belief (deep scan: this was dead code, so every belief was stuck "tentative"). */}
        <button onClick={() => setPicking((p) => (p === 'supports' ? null : 'supports'))} className="text-[11px] text-forge-ok/70 hover:text-forge-ok" title="Link an event that supports this">+ for</button>
        <button onClick={() => setPicking((p) => (p === 'contradicts' ? null : 'contradicts'))} className="text-[11px] text-forge-warn/70 hover:text-forge-warn" title="Link an event that contradicts this">+ against</button>
        <button onClick={() => onRetire(b.id)} className="text-[11px] text-forge-dim/50 hover:text-forge-ink">retire</button>
      </div>
      {picking && (
        <div className="mt-2 rounded-lg border border-forge-border bg-forge-bg/60 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-forge-dim/70">Pick the event that {picking === 'supports' ? 'supports' : 'contradicts'} this</p>
          {candidates.length === 0 ? (
            <p className="text-[11px] italic text-forge-dim/50">No unlinked events yet — record decisions and notes, and they'll show here.</p>
          ) : (
            <ul className="space-y-1">
              {candidates.map((ev) => (
                <li key={ev.id}>
                  <button onClick={() => { void onLink(b.id, ev.id, picking); setPicking(null); }}
                    className="w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-forge-dim hover:bg-forge-raised hover:text-forge-ink">
                    {ev.subject || ev.event_type}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function BeliefsPanel() {
  const { beliefs, events, addBelief, retireBelief, linkEvidence } = useMind();
  const [draft, setDraft] = useState('');
  const active = beliefs.filter((b) => b.status === 'active');

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Brain size={15} className="text-forge-ember" />
        <h2 className="text-sm font-semibold">Beliefs</h2>
        <span className="text-[11px] text-forge-dim/70">confidence is counted from evidence, never invented</span>
      </div>
      <div className="mb-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { void addBelief(draft.trim()); setDraft(''); } }}
          placeholder='Propose a belief, e.g. "Postcards outperform email for Lake Geneva sellers"'
        />
        <Button onClick={() => { if (draft.trim()) { void addBelief(draft.trim()); setDraft(''); } }} disabled={!draft.trim()}><Plus size={14} /></Button>
      </div>
      {active.length === 0 ? (
        <p className="text-sm italic text-forge-dim/50">No beliefs yet. They start tentative and earn their standing from events.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((b) => (
            <BeliefRow key={b.id} b={b} events={events} onLink={linkEvidence} onRetire={(id) => void retireBelief(id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DecisionRow({ d, onClose }: { d: MindDecision; onClose: (id: string, outcome: string, hit: boolean) => void }) {
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState('');
  const open = isDecisionOpen(d);
  return (
    <li className="rounded-lg border border-forge-border bg-forge-panel/40 px-3 py-2">
      <div className="flex items-start gap-2">
        {open
          ? <CircleDashed size={14} className="mt-0.5 shrink-0 text-forge-dim/60" />
          : d.outcome_hit
            ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
            : <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-forge-ink">{d.decision}</p>
          {d.prediction && <p className="text-[11px] text-forge-dim/70">predicted: {d.prediction}</p>}
          {d.outcome && <p className="text-[11px] text-forge-dim">outcome: {d.outcome}</p>}
        </div>
        {open && <button onClick={() => setClosing(!closing)} className="text-[11px] text-forge-dim/50 hover:text-forge-ink">record outcome</button>}
      </div>
      {closing && (
        <div className="mt-2 flex gap-2 pl-6">
          <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What actually happened?" />
          <Button size="sm" onClick={() => { if (outcome.trim()) onClose(d.id, outcome.trim(), true); }} disabled={!outcome.trim()}>Hit</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (outcome.trim()) onClose(d.id, outcome.trim(), false); }} disabled={!outcome.trim()}>Miss</Button>
        </div>
      )}
    </li>
  );
}

function DecisionsPanel() {
  const { decisions, openDecision, closeDecision } = useMind();
  const [draft, setDraft] = useState('');
  const [prediction, setPrediction] = useState('');
  const rate = useMemo(() => decisionHitRate(decisions), [decisions]);

  const add = () => {
    if (!draft.trim()) return;
    void openDecision(draft.trim(), prediction.trim() || undefined);
    setDraft(''); setPrediction('');
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ScrollText size={15} className="text-forge-ember" />
        <h2 className="text-sm font-semibold">Decision journal</h2>
        {rate.rate !== null && <Badge tone={rate.rate >= 0.5 ? 'ok' : 'warn'}>{Math.round(rate.rate * 100)}% hit rate ({rate.hits}/{rate.closed})</Badge>}
      </div>
      <div className="mb-3 space-y-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What did you decide?" />
        <div className="flex gap-2">
          <Input value={prediction} onChange={(e) => setPrediction(e.target.value)} placeholder="What do you predict will happen? (optional)" />
          <Button onClick={add} disabled={!draft.trim()}><Plus size={14} /></Button>
        </div>
      </div>
      {decisions.length === 0 ? (
        <p className="text-sm italic text-forge-dim/50">No decisions recorded. Predictions plus outcomes are how the mind learns where your instincts are reliable.</p>
      ) : (
        <ul className="space-y-2">
          {decisions.slice(0, 12).map((d) => <DecisionRow key={d.id} d={d} onClose={(id, o, hit) => void closeDecision(id, o, hit)} />)}
        </ul>
      )}
    </Card>
  );
}

function EventStream() {
  const { events, addNote } = useMind();
  const [note, setNote] = useState('');
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <ScrollText size={15} className="text-forge-ember" />
        <h2 className="text-sm font-semibold">The record</h2>
        <span className="text-[11px] text-forge-dim/70">append-only — every surface feeds it, nothing is ever edited</span>
      </div>
      <div className="mb-3 flex gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { void addNote(note.trim()); setNote(''); } }}
          placeholder="Drop an observation into the record…"
        />
        <Button onClick={() => { if (note.trim()) { void addNote(note.trim()); setNote(''); } }} disabled={!note.trim()}><Plus size={14} /></Button>
      </div>
      {events.length === 0 ? (
        <p className="text-sm italic text-forge-dim/50">Empty so far. Talk to Garvis, run a mission, or drop a note — everything lands here.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, 30).map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-sm">
              <span className="shrink-0 font-mono text-[10px] text-forge-dim/50">{e.occurred_at.slice(5, 16).replace('T', ' ')}</span>
              <Badge tone="dim">{e.event_type.replace(/_/g, ' ')}</Badge>
              <span className="min-w-0 flex-1 truncate text-forge-dim" title={e.subject}>{e.subject}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The Mind's content without the shell — mounted by the Memory room (design review P2: Mind +
 *  Brain are halves of one organ) and by the standalone /garvis/mind route. */
export function MindContent() {
  const { events, beliefs, decisions, loading } = useMind();
  const open = decisions.filter(isDecisionOpen).length;

  return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center gap-3">
          <Brain size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">The Mind</h1>
            <p className="text-sm text-forge-dim">Garvis's owned record — every conversation and run feeds it; every judgment is grounded in it.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Loading the record…" /></div>
        ) : events.length === 0 && beliefs.length === 0 && decisions.length === 0 ? (
          <div className="mb-5">
            <EmptyState
              icon={<Brain size={28} />}
              title="The record starts now"
              body="Set your goals below, then just use Garvis — every exchange, mission, and outcome appends here and compounds."
            />
          </div>
        ) : (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Events" value={String(events.length >= 100 ? '100+' : events.length)} hint="in the record" />
            <StatCard label="Beliefs" value={String(beliefs.filter((b) => b.status === 'active').length)} hint="active" />
            <StatCard label="Open decisions" value={String(open)} hint="awaiting outcomes" />
            <StatCard label="Closed" value={String(decisions.length - open)} hint="with outcomes" />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <IdentityPanel />
            <DecisionsPanel />
          </div>
          <div className="space-y-4">
            <BeliefsPanel />
            <EventStream />
          </div>
        </div>
      </div>
  );
}

export default function Mind() {
  return (
    <AppShell>
      <MindContent />
    </AppShell>
  );
}
