// src/pages/WorkWeb.tsx
// A single Work Web: the living territory on the left (production areas as connected nodes), the
// chartered WORKSPACE on the right when you dive into one. Each area is a thought + a workspace +
// a ledger — its tools, artifacts, and results all in one place. Approval-gated by construction.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Waypoints, Loader2, ArrowLeft, Play, Sparkles, Upload, Send, Eye, FileText,
  ShieldCheck, ChevronRight, Circle,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Spinner, Modal, Button } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { ARCHETYPES, type CharterStatus, type WorkTool } from '../lib/garvis/workweb';
import { templateById } from '../lib/garvis/workweb';
import { loadWeb, runPlay, runTool, type LoadedWeb, type WebCluster } from '../lib/garvis/workwebRun';

const STATUS_DOT: Record<CharterStatus, string> = {
  active: 'text-forge-ember', waiting: 'text-forge-warn', done: 'text-forge-ok', dormant: 'text-forge-dim/40',
};
const TOOL_ICON: Record<string, typeof Sparkles> = {
  generate: Sparkles, upload: Upload, queue: Send, view: Eye,
};

export default function WorkWeb() {
  const { worldId = '' } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [web, setWeb] = useState<LoadedWeb | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<WebCluster | null>(null);
  const [queueFor, setQueueFor] = useState<WebCluster | null>(null);

  const refresh = useCallback(async () => {
    try {
      const w = await loadWeb(worldId);
      setWeb(w);
      if (w && !selected) setSelected(w.clusters.find((c) => c.charter)?.slug ?? null);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load this web.');
    } finally {
      setLoading(false);
    }
  }, [worldId, selected, toast]);

  useEffect(() => { void refresh(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCluster = useMemo(() => web?.clusters.find((c) => c.slug === selected) ?? null, [web, selected]);

  // The first play declared by this web's template (matched by title → template).
  const templatePlay = useMemo(() => {
    if (!web) return null;
    const t = templateById(web.title === 'Mom Real Estate Marketing' ? 'mom-real-estate' : web.title === 'App Launch' ? 'app-launch' : '');
    return t?.playIds[0] ?? null;
  }, [web]);

  const doRunPlay = async () => {
    if (!templatePlay) return;
    setRunning(true);
    try {
      const r = await runPlay(worldId, templatePlay);
      toast('success', `Ran the play — ${r.artifactCount} artifacts across the web.`);
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The play failed.');
    } finally {
      setRunning(false);
    }
  };

  const doTool = async (cluster: WebCluster, tool: WorkTool) => {
    // View tools navigate; action tools run.
    if (tool.id === 'open-approvals') { navigate('/garvis/approvals'); return; }
    if (tool.id === 'view-contacts') { navigate('/garvis/approvals'); toast('info', 'Contacts live in the outreach data — a dedicated view is coming.'); return; }
    if (tool.id === 'import-docs') { navigate('/garvis/brain'); return; }
    if (tool.id === 'view-results') { setSelected(cluster.slug); return; }
    if (tool.id === 'upload-list') { setUploadFor(cluster); return; }
    if (tool.id === 'queue-sequence') { setQueueFor(cluster); return; }

    setBusyTool(`${cluster.slug}:${tool.id}`);
    try {
      const res = await runTool(worldId, cluster, tool.id);
      if (res.message) toast(res.ok ? 'success' : 'error', res.message);
      if (res.ok) await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Tool failed.');
    } finally {
      setBusyTool(null);
    }
  };

  if (loading) return <AppShell><div className="p-8"><Spinner label="Opening the web…" /></div></AppShell>;
  if (!web) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-forge-dim">This web could not be loaded.</p>
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to webs</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link to="/garvis/webs" className="text-forge-dim hover:text-forge-ink"><ArrowLeft size={18} /></Link>
          <Waypoints size={20} className="text-forge-ember" />
          <h1 className="text-xl font-semibold text-forge-ink">{web.title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <StatChip label="artifacts" value={web.rollup.artifacts} />
            <StatChip label="waiting" value={web.rollup.pendingApprovals} tone="warn" />
            <StatChip label="sent" value={web.rollup.messagesSent} />
            <StatChip label="replies" value={web.rollup.replies} tone="ok" />
            {templatePlay && (
              <button
                onClick={() => void doRunPlay()} disabled={running}
                className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3.5 py-2 text-sm font-medium text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px disabled:opacity-60"
              >
                {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Run the play
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
          {/* The web — production areas as a connected tree */}
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-2">
            {web.clusters.filter((c) => c.charter).map((c) => {
              const depth = c.parentSlug ? 1 : 0;
              const meta = c.charter ? ARCHETYPES[c.charter.archetype] : null;
              const isSel = c.slug === selected;
              return (
                <button
                  key={c.slug}
                  onClick={() => setSelected(c.slug)}
                  style={{ paddingLeft: 8 + depth * 18 }}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left transition-colors',
                    isSel ? 'bg-forge-ember/10' : 'hover:bg-forge-raised',
                  )}
                >
                  {depth > 0 && <span className="text-forge-dim/40">└</span>}
                  <Circle size={9} className={cn('shrink-0 fill-current', STATUS_DOT[c.liveStatus ?? 'dormant'])} />
                  <span className={cn('flex-1 truncate text-sm', isSel ? 'text-forge-ink' : 'text-forge-dim group-hover:text-forge-ink')}>{c.title}</span>
                  {c.artifacts.length > 0 && <span className="text-[10px] text-forge-dim">{c.artifacts.length}</span>}
                  {meta && <span className={cn('h-1.5 w-1.5 rounded-full', meta.tone === 'ember' && 'bg-forge-ember', meta.tone === 'ok' && 'bg-forge-ok', meta.tone === 'warn' && 'bg-forge-warn', meta.tone === 'dim' && 'bg-forge-dim/50')} />}
                </button>
              );
            })}
          </div>

          {/* The workspace — the selected area */}
          <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-5">
            {!selectedCluster || !selectedCluster.charter ? (
              <div className="flex h-40 items-center justify-center text-forge-dim">Select a production area.</div>
            ) : (
              <Workspace
                cluster={selectedCluster}
                busyTool={busyTool}
                onTool={(t) => void doTool(selectedCluster, t)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Upload list modal */}
      {uploadFor && (
        <UploadListModal
          cluster={uploadFor}
          onClose={() => setUploadFor(null)}
          onDone={async (csv) => {
            const res = await runTool(worldId, uploadFor!, 'upload-list', { csvText: csv });
            toast(res.ok ? 'success' : 'error', res.message);
            setUploadFor(null);
            if (res.ok) await refresh();
          }}
        />
      )}

      {/* Queue sequence modal */}
      {queueFor && (
        <QueueModal
          cluster={queueFor}
          onClose={() => setQueueFor(null)}
          onDone={async (email, name) => {
            const res = await runTool(worldId, queueFor!, 'queue-sequence', { toEmail: email, contactName: name });
            toast(res.ok ? 'success' : 'error', res.message);
            setQueueFor(null);
            if (res.ok) await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'ok' }) {
  return (
    <span className={cn(
      'rounded-lg border px-2.5 py-1 text-xs',
      value > 0 && tone === 'warn' ? 'border-forge-warn/40 text-forge-warn' :
      value > 0 && tone === 'ok' ? 'border-forge-ok/40 text-forge-ok' :
      'border-forge-border text-forge-dim',
    )}>
      <span className="font-medium text-forge-ink">{value}</span> {label}
    </span>
  );
}

function Workspace({ cluster, busyTool, onTool }: { cluster: WebCluster; busyTool: string | null; onTool: (t: WorkTool) => void }) {
  const meta = cluster.charter ? ARCHETYPES[cluster.charter.archetype] : null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-forge-ink">{cluster.title}</h2>
        {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
        {cluster.liveStatus && cluster.liveStatus !== 'dormant' && <Badge tone={cluster.liveStatus === 'waiting' ? 'warn' : cluster.liveStatus === 'done' ? 'ok' : 'ember'}>{cluster.liveStatus}</Badge>}
      </div>
      <p className="text-sm text-forge-dim">{cluster.summary}</p>
      {meta && <p className="mt-0.5 text-xs text-forge-dim/70">{meta.tagline}</p>}

      {cluster.pendingApprovals > 0 && (
        <Link to="/garvis/approvals" className="mt-3 flex items-center gap-1.5 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldCheck size={14} /> {cluster.pendingApprovals} action{cluster.pendingApprovals === 1 ? '' : 's'} waiting for approval <ChevronRight size={13} />
        </Link>
      )}

      {/* Tools */}
      <div className="mt-4 flex flex-wrap gap-2">
        {cluster.tools.map((t) => {
          const Icon = TOOL_ICON[t.kind] ?? Sparkles;
          const busy = busyTool === `${cluster.slug}:${t.id}`;
          return (
            <button
              key={t.id}
              onClick={() => onTool(t)} disabled={busy}
              title={t.hint}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                t.kind === 'queue' ? 'border-forge-ember/50 bg-forge-ember/10 text-forge-ember hover:bg-forge-ember/20'
                  : 'border-forge-border text-forge-ink hover:border-forge-ember/50 hover:bg-forge-raised',
              )}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Artifacts */}
      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-forge-dim">Artifacts</h3>
        {cluster.artifacts.length === 0 ? (
          <p className="text-sm text-forge-dim/70">Nothing here yet. Use a tool above — or run the play from the header to fill the whole web at once.</p>
        ) : (
          <div className="space-y-2">
            {cluster.artifacts.map((a) => (
              <details key={a.id} className="rounded-lg border border-forge-border bg-forge-panel/60">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-forge-ink">
                  <FileText size={14} className="text-forge-ember" />
                  <span className="flex-1">{a.title}</span>
                  <Badge tone="dim">{a.kind}</Badge>
                </summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-forge-border px-3 py-2 text-xs text-forge-dim">{a.detail || '—'}</pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadListModal({ cluster, onClose, onDone }: { cluster: WebCluster; onClose: () => void; onDone: (csv: string) => Promise<void> }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Upload a list — ${cluster.title}`}>
      <p className="text-sm text-forge-dim">Paste CSV rows: <span className="font-mono">name,email</span> (or just emails, one per line). Duplicates are skipped.</p>
      <textarea
        value={csv} onChange={(e) => setCsv(e.target.value)} rows={8}
        placeholder={'Jane Shore,jane@lakefront.example\nBob Pier,bob@pier.example'}
        className="mt-3 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 font-mono text-xs text-forge-ink"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => { setBusy(true); await onDone(csv); setBusy(false); }} loading={busy} disabled={!csv.trim()}>Import</Button>
      </div>
    </Modal>
  );
}

function QueueModal({ cluster, onClose, onDone }: { cluster: WebCluster; onClose: () => void; onDone: (email: string, name: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Queue send — ${cluster.title}`}>
      <p className="text-sm text-forge-dim">Garvis drafts the first email of the sequence and puts it in <strong className="text-forge-ink">Approvals</strong>. Nothing sends until you approve it.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient name (optional)"
        className="mt-3 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" type="email"
        className="mt-2 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink" />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => { setBusy(true); await onDone(email, name); setBusy(false); }} loading={busy} disabled={!email.trim()}>Queue for approval</Button>
      </div>
    </Modal>
  );
}
