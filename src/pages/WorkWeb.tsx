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
import { cn, timeAgo } from '../lib/utils';
import { ARCHETYPES, type CharterStatus, type WorkTool } from '../lib/garvis/workweb';
import { templateForWeb } from '../lib/garvis/workweb';
import { listContacts, type ContactRow } from '../lib/garvis/workwebRun';
import { loadWeb, runPlay, runTool, type LoadedWeb, type WebCluster } from '../lib/garvis/workwebRun';
import { listClusterArtifacts, listClusterFiles, uploadClusterFile, getBrandKit, saveBrandKit, type StudioArtifact, type ClusterFile, type BrandKit } from '../lib/garvis/artifacts';
import { refreshWorldIntelligence, reflectOnWorld, getWorldIntelligence, type WorldIntelligenceRow } from '../lib/garvis/worldIntelRun';
import { buildFromWorld } from '../lib/garvis/buildBridge';
import { worldPlan, listProspects, setProspectStatus, scanCategory, prospectToAudience, type ProspectRow } from '../lib/garvis/marketIntelRun';
import type { ResearchPlan } from '../lib/garvis/marketIntel';
import type { WorldDNA, BusinessContext } from '../lib/garvis/genesis';
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
  const [showContacts, setShowContacts] = useState(false);
  const [intel, setIntel] = useState<WorldIntelligenceRow | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [showIntel, setShowIntel] = useState(false);

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

  // The first play declared by this web's template — resolved by STRUCTURE (slug signature),
  // not by title, so renaming the world never silently kills the Run-the-play button.
  const templatePlay = useMemo(() => {
    if (!web) return null;
    const t = templateForWeb(web.clusters.map((c) => c.slug));
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
    if (tool.id === 'view-contacts') { setShowContacts(true); return; }
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
            <button
              onClick={() => setShowIntel((v) => !v)}
              title="The world's living understanding: what changed, what was learned, what's working, what to test next — every line from persisted rows"
              className={cn('rounded-lg border px-2.5 py-1 text-xs transition-colors', showIntel ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink')}
            >Intelligence</button>
            <StatChip label="made" value={web.rollup.artifacts} />
            <StatChip label="playbooks" value={web.clusters.reduce((n, c) => n + c.playbookArtifacts, 0)} />
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

        {showIntel && intel && <WorldIntelDashboard intel={intel} />}

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
                  {(c.earnedArtifacts > 0 || c.playbookArtifacts > 0) && (
                    <span className="text-[10px] text-forge-dim" title={`${c.earnedArtifacts} made here · ${c.playbookArtifacts} playbook doc${c.playbookArtifacts === 1 ? '' : 's'} it was born with`}>
                      {c.earnedArtifacts > 0 ? c.earnedArtifacts : `${c.playbookArtifacts}ᵖ`}
                    </span>
                  )}
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

      {/* Contacts — the real view behind the "View contacts" tool */}
      {showContacts && <ContactsModal onClose={() => setShowContacts(false)} />}

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
  const navigate = useNavigate();
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

      {/* Brand kit — the vault's real workspace. This is where "Set up the brand" lands:
          the kit feeds the studio chat voice and clears the brand-empty blocker. */}
      {cluster.charter?.archetype === 'vault' && (
        <BrandKitPanel worldId={worldId} onSaved={onChanged} />
      )}

      {/* G4 — Market Intelligence: who plausibly needs this business, reasoned from the DNA,
          searched read-only, fit-labeled with grounded reasons. Contact = approvals, always. */}
      {cluster.charter?.archetype === 'audience' && (
        <ProspectFinderPanel worldId={worldId} />
      )}

      {/* G3 — the website bridge: this world's DNA, brand kit, and captioned artwork compile
          into ONE brief and open the app builder. Real photos, never placeholders. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'landing' && (
        <button
          onClick={() => void buildFromWorld(worldId, cluster.id).then((route) => navigate(route)).catch((e) => toast('error', e instanceof Error ? e.message : 'Could not stage the build.'))}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3.5 py-2 text-sm font-medium text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px"
          title="Compiles the world's DNA, brand kit, and website-labeled artwork into a build brief and opens the app builder"
        >
          <Sparkles size={15} /> Build the website — with this world's artwork
        </button>
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

function BrandKitPanel({ worldId, onSaved }: { worldId: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [kit, setKit] = useState<BrandKit | null | undefined>(undefined); // undefined = loading
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [tone, setTone] = useState('');
  const [palette, setPalette] = useState('');
  const [fonts, setFonts] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [compliance, setCompliance] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    getBrandKit(worldId)
      .then((k) => {
        if (!live) return;
        setKit(k);
        setName(k?.name ?? '');
        setTone(k?.tone ?? '');
        setPalette((k?.palette ?? []).join(', '));
        setFonts((k?.fonts ?? []).join(', '));
        setLogoUrl(k?.logo_url ?? '');
        setCompliance(k?.compliance_line ?? '');
        setEditing(!k); // no kit yet → open the form straight away
      })
      .catch(() => { if (live) setKit(null); });
    return () => { live = false; };
  }, [worldId]);

  const save = async () => {
    setSaving(true);
    try {
      const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
      await saveBrandKit(worldId, {
        name: name.trim() || 'Brand kit',
        tone: tone.trim() || undefined,
        palette: csv(palette),
        fonts: csv(fonts),
        logo_url: logoUrl.trim() || undefined,
        compliance_line: compliance.trim() || undefined,
      });
      const fresh = await getBrandKit(worldId);
      setKit(fresh);
      setEditing(false);
      toast('success', 'Brand kit saved — the studios write in this voice now.');
      onSaved();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save the brand kit.');
    } finally {
      setSaving(false);
    }
  };

  if (kit === undefined) return <div className="mt-4"><Spinner label="Loading brand kit…" /></div>;

  const field = 'mt-1 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink';
  const label = 'mt-3 block text-xs font-medium text-forge-dim';

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-forge-ink">Brand kit</h3>
        {!editing && kit && (
          <button onClick={() => setEditing(true)} className="ml-auto rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink">Edit</button>
        )}
      </div>
      {!editing && kit ? (
        <dl className="mt-2 space-y-1.5 text-sm">
          <div><dt className="inline text-forge-dim">Name: </dt><dd className="inline text-forge-ink/90">{kit.name}</dd></div>
          {kit.tone && <div><dt className="inline text-forge-dim">Tone: </dt><dd className="inline text-forge-ink/90">{kit.tone}</dd></div>}
          {(kit.palette ?? []).length > 0 && (
            <div className="flex items-center gap-1.5">
              <dt className="text-forge-dim">Palette:</dt>
              {(kit.palette ?? []).map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-xs text-forge-ink/80">
                  <span className="inline-block h-3 w-3 rounded-sm border border-forge-border" style={{ background: c }} />{c}
                </span>
              ))}
            </div>
          )}
          {(kit.fonts ?? []).length > 0 && <div><dt className="inline text-forge-dim">Fonts: </dt><dd className="inline text-forge-ink/90">{(kit.fonts ?? []).join(', ')}</dd></div>}
          {kit.compliance_line && <div><dt className="inline text-forge-dim">Compliance: </dt><dd className="inline text-forge-ink/90">{kit.compliance_line}</dd></div>}
          <p className="pt-1 text-xs text-forge-dim/70">The studio chat writes in this voice; generators inherit it as it spreads.</p>
        </dl>
      ) : (
        <div>
          <p className="mt-1 text-xs text-forge-dim">Give the studios a voice — until a kit exists, "brand vault is empty" blocks this world.</p>
          <label className={label}>Brand name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="@properties — Jane Nocek" className={field} /></label>
          <label className={label}>Tone<textarea value={tone} onChange={(e) => setTone(e.target.value)} rows={2} placeholder="Warm, local, confident. Lake Geneva expertise without the hard sell." className={field} /></label>
          <label className={label}>Palette (comma-separated hex)<input value={palette} onChange={(e) => setPalette(e.target.value)} placeholder="#123B5C, #C9A227, #F5F1E8" className={field} /></label>
          <label className={label}>Fonts (comma-separated)<input value={fonts} onChange={(e) => setFonts(e.target.value)} placeholder="Playfair Display, Inter" className={field} /></label>
          <label className={label}>Logo URL<input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" className={field} /></label>
          <label className={label}>Compliance line<input value={compliance} onChange={(e) => setCompliance(e.target.value)} placeholder="Jane Nocek · @properties · Licensed in WI" className={field} /></label>
          <div className="mt-3 flex justify-end gap-2">
            {kit && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
            <Button onClick={() => void save()} loading={saving} disabled={!name.trim()}>Save brand kit</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  useEffect(() => {
    let live = true;
    listContacts().then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);
  const bad = new Set(['unsubscribed', 'bounced', 'complained', 'invalid']);
  return (
    <Modal open onClose={onClose} title="Contacts — everyone you can reach">
      {!rows ? (
        <Spinner label="Loading contacts…" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-forge-dim">No contacts yet — upload a list (CSV) in an audience area to build your reach.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <p className="mb-2 text-xs text-forge-dim">
            {rows.length} contact{rows.length === 1 ? '' : 's'} on record{rows.length >= 200 ? ' (showing the newest 200)' : ''}
          </p>
          <ul className="space-y-1">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-forge-border px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-forge-ink/90">{c.full_name || c.email}</span>
                {c.full_name && <span className="hidden truncate text-xs text-forge-dim sm:block">{c.email}</span>}
                <span className={cn('shrink-0 text-[10px] uppercase tracking-wide', bad.has(c.email_status) ? 'text-forge-warn' : 'text-forge-dim/70')}>
                  {c.email_status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}


/** THE CEO VIEW — understanding, not analytics. Every line is a persisted row: the Living
 *  State's momentum and blockers, the reflection's lessons (evidence-gated at write time),
 *  implications, the standing recommendation, and what Garvis still doesn't know. The OBSERVE
 *  half of the operating loop (site clicks, content metrics) lands with G5 instrumentation —
 *  until those rows exist, this dashboard refuses to guess at them. */
function WorldIntelDashboard({ intel }: { intel: WorldIntelligenceRow }) {
  const st = intel.state;
  const box = 'rounded-2xl border border-forge-border bg-forge-panel/40 p-4';
  const h = 'mb-2 text-xs font-semibold uppercase tracking-wide text-forge-dim';
  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-3">
      <section className={box}>
        <h2 className={h}>State now</h2>
        {st?.momentum && <p className="text-sm text-forge-ink/90">Momentum: <span className="font-medium">{st.momentum.label}</span> <span className="text-xs text-forge-dim">({st.momentum.evidence})</span></p>}
        {st?.objective && <p className="mt-1 text-sm text-forge-ink/80">{st.objective}</p>}
        {(st?.blockers ?? []).map((b) => (
          <p key={b.text} className="mt-1.5 text-xs"><span className="text-forge-warn">{b.text}</span><span className="block text-forge-dim/80">{b.evidence}</span></p>
        ))}
        {(st?.risks ?? []).map((r) => (
          <p key={r.text} className="mt-1.5 text-xs"><span className="text-forge-dim">{r.text}</span><span className="block text-forge-dim/70">{r.evidence}</span></p>
        ))}
        {!st?.blockers?.length && !st?.risks?.length && <p className="mt-1 text-xs text-forge-dim">Nothing structural in the way.</p>}
      </section>
      <section className={box}>
        <h2 className={h}>What we learned {intel.last_reflected_at ? `· reflected ${timeAgo(intel.last_reflected_at)}` : '· never reflected yet'}</h2>
        {(intel.reflection?.learned ?? []).slice(0, 4).map((l) => (
          <p key={l.text} className="mt-1 text-sm text-forge-ink/85">{l.text}<span className="block text-[11px] text-forge-dim/80">{l.evidence}</span></p>
        ))}
        {(intel.implications ?? []).slice(0, 3).map((im) => (
          <p key={im.observation} className="mt-1.5 text-xs text-forge-dim"><span className="text-forge-ink/75">{im.observation}</span> → {im.implication}</p>
        ))}
        {!intel.reflection?.learned?.length && !intel.implications?.length && (
          <p className="text-xs text-forge-dim">No lessons on record yet — run a Reflect once real work has happened. Lessons without evidence are dropped, so an empty box is honest.</p>
        )}
      </section>
      <section className={box}>
        <h2 className={h}>What Garvis recommends</h2>
        {intel.recommendation ? <p className="text-sm text-forge-ink/90">{intel.recommendation}</p> : <p className="text-xs text-forge-dim">No standing recommendation yet — it arrives from reflection.</p>}
        {(intel.open_questions ?? []).length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] uppercase tracking-wide text-forge-dim/70">Still unknown</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-forge-ink/75">
              {(intel.open_questions ?? []).map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        )}
        <p className="mt-3 border-t border-forge-border pt-2 text-[11px] text-forge-dim/70">Working/failing by the numbers (site clicks, content performance) arrives with G5 instrumentation — this panel will not guess until those rows exist.</p>
      </section>
    </div>
  );
}

const FIT_TONE: Record<string, string> = {
  strong: 'border-forge-ok/50 text-forge-ok', possible: 'border-forge-warn/50 text-forge-warn',
  weak: 'border-forge-border text-forge-dim', unknown: 'border-forge-border text-forge-dim/60',
};

/** G4 — the prospect finder: DNA-derived scan segments, read-only searches, evidence-labeled
 *  fits. Every verdict shows its reason; unknown stays visibly unknown. */
function ProspectFinderPanel({ worldId }: { worldId: string }) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [dna, setDna] = useState<WorldDNA | null>(null);
  const [ctx, setCtx] = useState<BusinessContext | null>(null);
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [scanning, setScanning] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void worldPlan(worldId).then((w) => { if (live) { setPlan(w.plan); setDna(w.dna); setCtx(w.ctx); } }).catch(() => {});
    void listProspects(worldId).then((r) => { if (live) setRows(r); }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const scan = async (name: string) => {
    const cat = plan?.categories.find((c) => c.name === name);
    if (!cat || scanning) return;
    setScanning(name);
    try {
      const r = await scanCategory(worldId, cat, dna, ctx);
      toast(r.stored > 0 ? 'success' : 'info', r.message);
      setRows(await listProspects(worldId));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Scan failed.');
    } finally {
      setScanning(null);
    }
  };

  const mark = async (row: ProspectRow, status: ProspectRow['status']) => {
    try {
      await setProspectStatus(row.id, status);
      setRows((p) => status === 'dropped' ? p.filter((r) => r.id !== row.id) : p.map((r) => (r.id === row.id ? { ...r, status } : r)));
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };

  // Prospect → audience: scans can't find emails, so the operator pastes the address they found
  // on the prospect's site. Garvis never invents one — the input IS the honesty.
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const toAudience = async (row: ProspectRow) => {
    try {
      const r = await prospectToAudience(worldId, row, emailDraft);
      toast('success', r.message);
      setEmailFor(null); setEmailDraft('');
      setRows((p) => p.map((x) => (x.id === row.id ? { ...x, status: 'in_audience', contact_id: r.contactId } : x)));
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not add the contact.'); }
  };

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-4">
      <h3 className="text-sm font-semibold text-forge-ink">Lead finder — market intelligence</h3>
      {!plan?.categories.length ? (
        <p className="mt-1 text-xs text-forge-dim">This world has no DNA yet (ideal customers unknown), so there is nothing honest to scan for. Genesis worlds get segments automatically.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-forge-dim">Segments reasoned from this world's DNA. Scans are read-only and metered; nothing is contacted without approvals.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.categories.map((c) => (
              <button
                key={c.name}
                onClick={() => void scan(c.name)} disabled={scanning !== null}
                className="flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-ink transition-colors hover:border-forge-ember/50 disabled:opacity-50"
              >
                {scanning === c.name ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-forge-ember" />}
                Scan: {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rows.slice(0, 20).map((r) => (
            <li key={r.id} className="rounded-lg border border-forge-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-forge-ink hover:text-forge-ember">{r.name}</a>
                  : <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">{r.name}</span>}
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide', FIT_TONE[r.fit])}>{r.fit}</span>
                <span className="text-[10px] text-forge-dim">{r.category}</span>
                {r.status === 'new' && (
                  <>
                    <button onClick={() => void mark(r, 'qualified')} className="text-[11px] text-forge-ok hover:underline">qualify</button>
                    <button onClick={() => void mark(r, 'dropped')} className="text-[11px] text-forge-dim hover:text-forge-warn">drop</button>
                  </>
                )}
                {r.status === 'qualified' && (
                  <button onClick={() => { setEmailFor(emailFor === r.id ? null : r.id); setEmailDraft(''); }} className="text-[11px] text-forge-ember hover:underline">→ audience</button>
                )}
                {r.status === 'in_audience' && <span className="text-[10px] uppercase tracking-wide text-forge-ok">in audience</span>}
                {r.status !== 'new' && r.status !== 'qualified' && r.status !== 'in_audience' && <span className="text-[10px] uppercase tracking-wide text-forge-dim">{r.status}</span>}
              </div>
              {emailFor === r.id && (
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void toAudience(r); }}
                    placeholder="their email (from their site — Garvis won't guess it)"
                    className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none"
                  />
                  <button onClick={() => void toAudience(r)} className="rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">Add contact</button>
                </div>
              )}
              {r.fit_reason && <p className="mt-0.5 text-xs text-forge-dim">{r.fit_reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
