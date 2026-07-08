// src/pages/WorkWeb.tsx
// A single Work Web: the living territory on the left (production areas as connected nodes), the
// chartered WORKSPACE on the right when you dive into one. Each area is a thought + a workspace +
// a ledger — its tools, artifacts, and results all in one place. Approval-gated by construction.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Waypoints, Loader2, ArrowLeft, Play, Sparkles, Upload, Send, Eye, FileText, FileImage,
  ShieldCheck, ChevronRight, Circle, Orbit,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Spinner, Modal, Button } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { ARCHETYPES, type CharterStatus, type WorkTool } from '../lib/garvis/workweb';
import { templateById } from '../lib/garvis/workweb';
import { loadWeb, runPlay, runTool, type LoadedWeb, type WebCluster } from '../lib/garvis/workwebRun';
import { listClusterArtifacts, listClusterFiles, uploadClusterFile, type StudioArtifact, type ClusterFile } from '../lib/garvis/artifacts';
import { refreshWorldIntelligence, reflectOnWorld, getWorldIntelligence, type WorldIntelligenceRow } from '../lib/garvis/worldIntelRun';
import { ArtifactCard } from '../components/garvis/ArtifactCard';
import { StudioChat } from '../components/garvis/StudioChat';

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
  const [intel, setIntel] = useState<WorldIntelligenceRow | null>(null);
  const [reflecting, setReflecting] = useState(false);

  // The heartbeat updates when observed: refresh the deterministic Living State on open, then read.
  useEffect(() => {
    let live = true;
    void refreshWorldIntelligence(worldId)
      .then(() => getWorldIntelligence(worldId))
      .then((row) => { if (live) setIntel(row); })
      .catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const doReflect = async () => {
    setReflecting(true);
    try {
      const r = await reflectOnWorld(worldId);
      toast(r.ok ? 'success' : 'info', r.message);
      if (r.ok) setIntel(await getWorldIntelligence(worldId));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Reflection failed.');
    } finally {
      setReflecting(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const w = await loadWeb(worldId);
      setWeb(w);
      // Auto-select the first chartered area when nothing valid is selected. Guarding on "does the
      // loaded web actually contain the selected slug" (not just "is selected set") means switching
      // webs in place — where selected still holds the OLD web's slug — re-selects correctly instead
      // of landing on a blank pane.
      if (w) {
        // Deep links from the System altitude carry ?area=<slug> — a planet click should land on
        // exactly that production area, not the default first one.
        const area = new URLSearchParams(window.location.search).get('area');
        setSelected((prev) => {
          if (prev && w.clusters.some((c) => c.slug === prev && c.charter)) return prev;
          if (area && w.clusters.some((c) => c.slug === area && c.charter)) return area;
          return w.clusters.find((c) => c.charter)?.slug ?? null;
        });
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load this web.');
    } finally {
      setLoading(false);
    }
  }, [worldId, toast]);

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
            <Link
              to={`/garvis/system/${worldId}`}
              title="System altitude — this world as its solar system: every glow a count, every comet a next move"
              className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
            ><Orbit size={13} /> System</Link>
            {intel?.state?.momentum && (
              <span
                title={`${intel.state.momentum.evidence} — derived from counts, never an opinion`}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium',
                  intel.state.momentum.label === 'surging' ? 'border-forge-ember/50 text-forge-ember'
                  : intel.state.momentum.label === 'steady' ? 'border-forge-ok/40 text-forge-ok'
                  : 'border-forge-border text-forge-dim',
                )}
              >{intel.state.momentum.label}</span>
            )}
            <button
              onClick={() => void doReflect()} disabled={reflecting}
              title="Garvis reviews this world's record — what was tried, what the evidence says, what should change. Evidence-gated: lessons without proof are dropped."
              className="rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-50"
            >{reflecting ? 'reflecting…' : 'Reflect'}</button>
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
                key={selectedCluster.id}
                cluster={selectedCluster}
                worldId={worldId}
                webTitle={web.title}
                results={{ sent: web.rollup.messagesSent, replies: web.rollup.replies, pendingApprovals: selectedCluster.pendingApprovals }}
                busyTool={busyTool}
                onTool={(t) => void doTool(selectedCluster, t)}
                onChanged={() => void refresh()}
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
            try {
              const res = await runTool(worldId, uploadFor!, 'upload-list', { csvText: csv });
              toast(res.ok ? 'success' : 'error', res.message);
              if (res.ok) await refresh();
            } catch (e) {
              toast('error', e instanceof Error ? e.message : 'Upload failed.');
            } finally {
              setUploadFor(null);
            }
          }}
        />
      )}

      {/* Queue sequence modal */}
      {queueFor && (
        <QueueModal
          cluster={queueFor}
          onClose={() => setQueueFor(null)}
          onDone={async (email, name) => {
            try {
              const res = await runTool(worldId, queueFor!, 'queue-sequence', { toEmail: email, contactName: name });
              toast(res.ok ? 'success' : 'error', res.message);
              if (res.ok) await refresh();
            } catch (e) {
              toast('error', e instanceof Error ? e.message : 'Could not queue the email.');
            } finally {
              setQueueFor(null);
            }
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

function Workspace({ cluster, worldId, webTitle, results, busyTool, onTool, onChanged }: {
  cluster: WebCluster; worldId: string; webTitle: string;
  results: { sent: number; replies: number; pendingApprovals: number };
  busyTool: string | null; onTool: (t: WorkTool) => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const meta = cluster.charter ? ARCHETYPES[cluster.charter.archetype] : null;
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>([]);
  const [files, setFiles] = useState<ClusterFile[]>([]);
  const [loadingArts, setLoadingArts] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [a, f] = await Promise.all([listClusterArtifacts(cluster.id), listClusterFiles(cluster.id)]);
      setArtifacts(a); setFiles(f);
    } catch { /* studio still usable without the lists */ } finally { setLoadingArts(false); }
  }, [cluster.id]);

  useEffect(() => { setLoadingArts(true); void reload(); }, [reload]);

  const bumpChanged = useCallback(() => { void reload(); onChanged(); }, [reload, onChanged]);

  const upload = async (file: File) => {
    try { await uploadClusterFile(cluster.id, file); toast('success', `Added ${file.name}.`); await reload(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Upload failed.'); }
  };

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

      {/* Files */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-forge-dim">Files</h3>
          <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink">
            <Upload size={11} /> add
          </button>
        </div>
        {files.length === 0 ? (
          <p className="text-xs text-forge-dim/60">No files. Add photos, a logo, or a CSV the studio can use.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                {f.kind === 'image' ? <FileImage size={11} /> : <FileText size={11} />} {f.name}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Artifacts */}
      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-forge-dim">Artifacts</h3>
        {loadingArts ? (
          <p className="text-sm text-forge-dim/70">Loading…</p>
        ) : artifacts.length === 0 ? (
          <p className="text-sm text-forge-dim/70">Nothing here yet. Use a tool above, run the play from the header, or just ask the studio below.</p>
        ) : (
          <div className="space-y-2">
            {artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} onChanged={bumpChanged} />)}
          </div>
        )}
      </div>

      {/* The studio chat — the thing that makes this a studio, not a node */}
      {cluster.charter && (
        <StudioChat
          worldId={worldId} webTitle={webTitle} clusterId={cluster.id}
          cluster={{ title: cluster.title, summary: cluster.summary, charter: cluster.charter }}
          tools={cluster.tools} results={results} onChanged={bumpChanged}
        />
      )}
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
        <Button onClick={async () => { setBusy(true); try { await onDone(csv); } finally { setBusy(false); } }} loading={busy} disabled={!csv.trim()}>Import</Button>
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
      <p className="text-sm text-forge-dim">Garvis queues the <strong className="text-forge-ink">first</strong> email of the sequence in <strong className="text-forge-ink">Approvals</strong> — nothing sends until you approve it. The two curated follow-ups are saved as drafts to send when you're ready.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient name (optional)"
        className="mt-3 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" type="email"
        className="mt-2 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink" />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => { setBusy(true); try { await onDone(email, name); } finally { setBusy(false); } }} loading={busy} disabled={!email.trim()}>Queue for approval</Button>
      </div>
    </Modal>
  );
}
