// src/pages/ClientBook.tsx  (/garvis/client-book)
// THE CLIENT BOOK — every business you operate FOR someone: who the client is, what you do for
// them, what you still need from them (the intake checklist), and the world that runs their
// work. Engagements arrive from Orchestrate ("add my client Jane the realtor — I do her
// marketing") or get opened here; the client's world goes through the normal draft approval on
// Businesses, then links here.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookUser, Loader2, Plus, Square, CheckSquare } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button, Input } from '../components/ui';
import { cn } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { engagementLine, type ClientEngagement, type EngagementStatus } from '../lib/garvis/clientEngagement';
import { onboardClient, listEngagements, updateEngagement, linkableWorlds } from '../lib/garvis/clientEngagementRun';

const STATUSES: EngagementStatus[] = ['prospect', 'active', 'paused', 'ended'];
const STATUS_TONE: Record<EngagementStatus, 'dim' | 'ember' | 'ok' | 'warn'> = { prospect: 'ember', active: 'ok', paused: 'warn', ended: 'dim' };

export default function ClientBook() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ClientEngagement[] | null>(null);
  const [worlds, setWorlds] = useState<{ id: string; title: string }[]>([]);
  // New-engagement form
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [biz, setBiz] = useState('');
  const [scope, setScope] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [es, ws] = await Promise.all([listEngagements(), linkableWorlds()]);
    setRows(es); setWorlds(ws);
  }, []);
  useEffect(() => { void refresh().catch(() => setRows([])); }, [refresh]);

  const add = async () => {
    setSaving(true);
    try {
      const res = await onboardClient({ clientName: name, business: biz, scope, email });
      toast(res.draftProblem ? 'info' : 'success',
        res.draftProblem
          ? `Engagement opened (${res.intakeCount} intake items). The world draft failed: ${res.draftProblem}`
          : `Engagement opened (${res.intakeCount} intake items) — their business draft is on the Businesses page for your review.`);
      setFormOpen(false); setName(''); setBiz(''); setScope(''); setEmail('');
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not open the engagement.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, p: Parameters<typeof updateEngagement>[1]) => {
    try { await updateEngagement(id, p); await refresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed — nothing changed.'); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <BookUser size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Client book</h1>
            <p className="text-sm text-forge-dim">Businesses you operate for someone else — the client, your scope, what you still need from them, and their world.</p>
          </div>
          <Button size="sm" onClick={() => setFormOpen((v) => !v)}><Plus size={14} /> Client</Button>
        </div>

        {formOpen && (
          <div className="mb-5 rounded-2xl border border-forge-ember/40 bg-forge-panel/40 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name (Jane Smith)" aria-label="Client name" />
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Client email (optional)" aria-label="Client email" />
              <Input value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Their business (residential realty in Madison)" aria-label="Their business" />
              <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Your scope (marketing + listing paperwork)" aria-label="Your scope" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={add} loading={saving}>Open the engagement</Button>
              <span className="text-[10px] text-forge-dim">Creates the intake checklist from your scope and drafts their world for your review.</span>
            </div>
          </div>
        )}

        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the book…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forge-border p-6 text-center">
            <p className="text-sm font-medium text-forge-ink">No client engagements yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-forge-dim">
              Add one here, or say it in <Link to="/garvis/orchestrate" className="text-forge-ember hover:underline">Orchestrate</Link> — "add my client Jane the realtor, I do her marketing."
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li key={e.id} className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-forge-ink">{e.client_name}</span>
                  <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-forge-dim">{e.business} · scope: {e.scope}</span>
                  <select
                    value={e.status}
                    onChange={(ev) => void patch(e.id, { status: ev.target.value as EngagementStatus })}
                    aria-label="Engagement status"
                    className="rounded-md border border-forge-border bg-forge-panel px-1.5 py-1 text-[11px] text-forge-ink"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-forge-dim">{engagementLine(e)}</p>

                {/* Intake checklist — what's still needed from the client, toggled as it arrives. */}
                {e.intake.length > 0 && (
                  <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {e.intake.map((it, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => {
                            const intake = e.intake.map((x, i) => (i === idx ? { ...x, received: !x.received } : x));
                            void patch(e.id, { intake });
                          }}
                          className={cn('flex items-start gap-1.5 text-left text-xs', it.received ? 'text-forge-dim line-through' : 'text-forge-ink/90 hover:text-forge-ember')}
                        >
                          {it.received ? <CheckSquare size={13} className="mt-0.5 shrink-0 text-forge-ok" /> : <Square size={13} className="mt-0.5 shrink-0 text-forge-dim" />}
                          <span>{it.item}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* World link: their approved world runs the work; until then, point at the ceremony. */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {e.world_id ? (
                    <Link to={`/garvis/home/${e.world_id}`} className="text-forge-ember hover:underline">Open their world →</Link>
                  ) : (
                    <>
                      <span className="text-forge-dim">World:</span>
                      <select
                        defaultValue=""
                        onChange={(ev) => { if (ev.target.value) void patch(e.id, { world_id: ev.target.value }); }}
                        aria-label="Link a world"
                        className="rounded-md border border-forge-border bg-forge-panel px-1.5 py-1 text-[11px] text-forge-ink"
                      >
                        <option value="" disabled>link the approved world…</option>
                        {worlds.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                      </select>
                      <Link to="/garvis/webs" className="text-forge-dim hover:text-forge-ember">(drafts live on Businesses)</Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
