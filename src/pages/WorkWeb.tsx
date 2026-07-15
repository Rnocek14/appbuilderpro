// src/pages/WorkWeb.tsx
// A single Work Web: the living territory on the left (production areas as connected nodes), the
// chartered WORKSPACE on the right when you dive into one. Each area is a thought + a workspace +
// a ledger — its tools, artifacts, and results all in one place. Approval-gated by construction.

import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { uploadAndIngest } from '../lib/garvis/brain';
import { refreshWorldIntelligence, reflectOnWorld, getWorldIntelligence, maybeReflect, type WorldIntelligenceRow } from '../lib/garvis/worldIntelRun';
import { buildFromWorld, SITE_DIRECTIONS } from '../lib/garvis/buildBridge';
import { worldPlan, listProspects, setProspectStatus, scanCategory, prospectToAudience, scanProspectEmails, type ProspectRow } from '../lib/garvis/marketIntelRun';
import { worldResults, setLeadStatus, type LeadRow } from '../lib/garvis/resultsRun';
import { readAdaptive, logAdSpend, type AdaptiveRead } from '../lib/garvis/adaptiveRun';
import { listConnections, saveConnectionAccount, syncProvider, type ConnectionState } from '../lib/garvis/connectionsRun';
import type { ResearchPlan } from '../lib/garvis/marketIntel';
import type { WorldDNA, BusinessContext } from '../lib/garvis/genesis';
import { ArtifactCard } from '../components/garvis/ArtifactCard';
import { StudioChat } from '../components/garvis/StudioChat';
import { PanelBoundary } from '../components/garvis/PanelBoundary';
import { GenerationReadiness } from '../components/garvis/GenerationReadiness';
import { StudioHero } from '../components/garvis/StudioHero';
import { ADS_SPEC } from '../lib/garvis/adsStudio';
import { COPY_SPEC } from '../lib/garvis/copyStudio';
import { SOCIAL_SPEC } from '../lib/garvis/socialStudio';
import { FirstRunGuide } from '../components/garvis/FirstRunGuide';
import { StandingOrdersPanel } from '../components/garvis/StandingOrdersPanel';
import { VerdictReadout } from '../components/garvis/VerdictReadout';
import { AskGarvis } from '../components/garvis/AskGarvis';
import { WorldGoalPanel } from '../components/garvis/WorldGoalPanel';

// HEAVY / PER-FLAVOR STUDIO PANELS — lazy so one leaf dependency (qrcode, pdf, docx) failing to
// resolve can never blank the whole Ventures page again. Each renders only for its own flavor, so
// splitting them out of the initial chunk is a straight win; PanelBoundary contains any failure.
const MailerDesigner = lazy(() => import('../components/garvis/MailerDesigner').then((m) => ({ default: m.MailerDesigner })));
const FarmPanel = lazy(() => import('../components/garvis/FarmPanel').then((m) => ({ default: m.FarmPanel })));
const PaperworkStudio = lazy(() => import('../components/garvis/PaperworkStudio').then((m) => ({ default: m.PaperworkStudio })));
const MarketDataPanel = lazy(() => import('../components/garvis/MarketDataPanel').then((m) => ({ default: m.MarketDataPanel })));
const TimelinePanel = lazy(() => import('../components/garvis/TimelinePanel').then((m) => ({ default: m.TimelinePanel })));
const SocialPublisher = lazy(() => import('../components/garvis/SocialPublisher').then((m) => ({ default: m.SocialPublisher })));
const EmailStudio = lazy(() => import('../components/garvis/EmailStudio').then((m) => ({ default: m.EmailStudio })));
const IdeaStudio = lazy(() => import('../components/garvis/IdeaStudio').then((m) => ({ default: m.IdeaStudio })));
const ReelStudio = lazy(() => import('../components/garvis/ReelStudio').then((m) => ({ default: m.ReelStudio })));
const VideoStudio = lazy(() => import('../components/garvis/VideoStudio').then((m) => ({ default: m.VideoStudio })));
const AnsweringDesk = lazy(() => import('../components/garvis/AnsweringDesk').then((m) => ({ default: m.AnsweringDesk })));
const DeliverableStudio = lazy(() => import('../components/garvis/DeliverableStudio').then((m) => ({ default: m.DeliverableStudio })));
const DataWorkspace = lazy(() => import('../components/garvis/DataWorkspace').then((m) => ({ default: m.DataWorkspace })));
const TrackerRegistry = lazy(() => import('../components/garvis/TrackerRegistry').then((m) => ({ default: m.TrackerRegistry })));
const MarketingCanvas = lazy(() => import('../components/garvis/canvas/MarketingCanvas').then((m) => ({ default: m.MarketingCanvas })));

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
  // Marketing-first businesses (they have a direct-mail studio) open on the simple "Make my
  // marketing" flow; the studio tree + areas move behind an "Advanced" toggle.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // The heartbeat updates when observed: refresh the deterministic Living State on open, then read.
  // Learning is no longer manual-only — if reflection is genuinely due (enough real activity, not
  // reflected recently), run it in the background and re-read when it lands.
  useEffect(() => {
    let live = true;
    void refreshWorldIntelligence(worldId)
      .then(() => getWorldIntelligence(worldId))
      .then((row) => { if (live) setIntel(row); })
      .then(() => maybeReflect(worldId))
      .then((ran) => { if (ran && live) return getWorldIntelligence(worldId).then((row) => { if (live) setIntel(row); }); })
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
          // Single-purpose worlds (answering desk / document studio / data workspace) should OPEN on
          // their studio — the working surface — not on the vault/intel the model emitted first.
          const studio = w.clusters.find((c) => c.charter?.flavor === 'assist' || c.charter?.flavor === 'deliver' || c.charter?.flavor === 'data' || c.charter?.flavor === 'tracker');
          return studio?.slug ?? w.clusters.find((c) => c.charter)?.slug ?? null;
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

  // PRODUCT LAB = feature_lab studios, no outreach machinery. The page's framing follows the
  // world's shape: no send/reply chips, product Ask examples, a product ledger.
  const productLab = useMemo(() => !!web
    && web.clusters.some((c) => c.charter?.flavor === 'feature_lab')
    && !web.clusters.some((c) => c.charter?.archetype === 'launch' || c.charter?.archetype === 'audience'), [web]);

  // ANSWERING DESK = an assist studio; DOCUMENT STUDIO = a deliver studio. Both make things you hand
  // off yourself, not campaigns you send — so they share the product lab's "no send/reply chrome"
  // framing and a "measures made, not sent" ledger.
  const assistDesk = useMemo(() => !!web && web.clusters.some((c) => c.charter?.flavor === 'assist'), [web]);
  const docStudio = useMemo(() => !!web && web.clusters.some((c) => c.charter?.flavor === 'deliver'), [web]);
  const dataStudio = useMemo(() => !!web && web.clusters.some((c) => c.charter?.flavor === 'data'), [web]);
  const trackerDesk = useMemo(() => !!web && web.clusters.some((c) => c.charter?.flavor === 'tracker'), [web]);
  const noOutreach = productLab || assistDesk || docStudio || dataStudio || trackerDesk;

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
    if (tool.id === 'open-approvals') { navigate('/garvis/queue'); return; }
    if (tool.id === 'view-contacts') { setShowContacts(true); return; }
    if (tool.id === 'import-docs') { navigate('/garvis/brain'); return; }
    if (tool.id === 'view-results') { setSelected(cluster.slug); return; }
    // The answering desk is already rendered inline for the assist studio — the tool just focuses it.
    if (tool.id === 'open-answering') { setSelected(cluster.slug); return; }
    // Likewise the document studio is inline for the deliver flavor — the tool focuses it.
    if (tool.id === 'open-documents') { setSelected(cluster.slug); return; }
    // And the data workspace is inline for the data flavor — the tool focuses it.
    if (tool.id === 'open-data') { setSelected(cluster.slug); return; }
    // And the registry is inline for the tracker flavor — the tool focuses it.
    if (tool.id === 'open-tracker') { setSelected(cluster.slug); return; }
    if (tool.id === 'upload-list') { setUploadFor(cluster); return; }
    if (tool.id === 'queue-sequence') { setQueueFor(cluster); return; }

    setBusyTool(`${cluster.slug}:${tool.id}`);
    try {
      const res = await runTool(worldId, cluster, tool.id);
      if (res.message) toast(res.ok ? 'success' : 'error', res.message);
      // Non-blocking reconcile (design review): the tool's real work is done and announced — the
      // button unlocks NOW; the full web reload lands in the background instead of holding the UI.
      if (res.ok) void refresh();
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
          <Link to="/garvis/webs" className="mt-3 inline-flex items-center gap-1 text-forge-ember"><ArrowLeft size={14} /> Back to Businesses</Link>
        </div>
      </AppShell>
    );
  }

  // Any marketing/outreach business leads with the simple "Make my marketing" flow (the single-
  // purpose desks — answering / documents / data / tracker / product lab — keep the studio view).
  // Real-estate businesses get listing-shaped announcements; everyone else gets generic ones.
  const hasCampaign = !noOutreach;
  const realEstate = /real.?estate|realtor|realty|listing|propert|broker|\bhomes?\b/i.test(web.title);

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
            {/* outreach chips only where outreach exists — a product lab's or answering desk's "sent 0" is not a stat, it's noise */}
            {!noOutreach && <StatChip label="sent" value={web.rollup.messagesSent} />}
            {!noOutreach && <StatChip label="replies" value={web.rollup.replies} tone="ok" />}
            {/* First-run convenience only: fill EVERY studio at once, and only while the business is
                still empty. Once any real work exists it disappears, so it never competes with each
                studio's own Generate button. */}
            {templatePlay && web.rollup.artifacts === 0 && (
              <Button
                variant="primary" size="md"
                onClick={() => void doRunPlay()} disabled={running}
                title="One-time head start: puts a starter into every studio in this business at once. After that, use each studio's own Generate."
              >
                {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Fill all studios to start
              </Button>
            )}
          </div>
        </div>

        {showIntel && intel && <WorldIntelDashboard intel={intel} />}

        {/* FIRST-RUN ORIENTATION — three concrete steps to the first real marketing. Only shows
            when this world has produced no EARNED work yet; vanishes the moment it has. */}
        <FirstRunGuide worldId={worldId} hasEarnedWork={web.rollup.artifacts > 0} />

        {/* THE GOAL — what this world is for. Every function bends toward it (goals spine). */}
        <div className="mb-4">
          <WorldGoalPanel worldId={worldId} />
        </div>

        {/* THE CLOCK — this world's standing orders: watch a page, digest on a cadence. Read-and-
            record only; findings surface in the waking moment, never auto-sent anywhere. */}
        <div className="mb-4">
          <StandingOrdersPanel worldId={worldId} onToast={(k, m) => toast(k, m)} />
        </div>

        {/* Ask this world — retrieval scoped to its own artifacts, playbooks, research, designs */}
        <div className="mb-4">
          <AskGarvis worldId={worldId} placeholder={assistDesk
            ? `Ask about ${web.title} — "what's our return policy?", "what do we tell people about shipping times?"`
            : docStudio
            ? `Ask about ${web.title} — "what's in our rate card?", "what did we say in the last proposal?"`
            : dataStudio
            ? `Ask about ${web.title} — "what did the last analysis find?", "which dataset covered Q3?"`
            : trackerDesk
            ? `Ask about ${web.title} — "what do I know about Jane?", "what did I log about June?"`
            : productLab
            ? `Ask about ${web.title} — "what do we know about the users?", "which concept should we spec first?"`
            : `Ask about ${web.title} — "what's our plan for direct mail?", "who did we find?"`} />
        </div>

        {/* THE HOME: for a marketing business, the marketing canvas IS the front page — what you're
            marketing glows in the center and everything you can make branches around it. Tap a node
            to open a focused sheet that makes that piece (postcard, social, email) from one set of
            details. The studio areas move behind an "Advanced" toggle so the first thing you see is
            an inviting canvas, not a map of buttons. */}
        {hasCampaign && (
          <div className="mb-5">
            <PanelBoundary name="marketing canvas">
              <MarketingCanvas worldId={worldId} realEstate={realEstate} onToast={(k, m) => toast(k, m)} />
            </PanelBoundary>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-3 flex items-center gap-1.5 text-xs text-forge-dim transition-colors hover:text-forge-ink"
            >
              <ChevronRight size={13} className={cn('transition-transform', showAdvanced && 'rotate-90')} />
              {showAdvanced ? 'Hide' : 'Advanced'} — the studios & areas (social, video, farm lists, paperwork…)
            </button>
          </div>
        )}

        {(!hasCampaign || showAdvanced) && (
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
                productLab={productLab}
                assistDesk={assistDesk}
                docStudio={docStudio}
                dataStudio={dataStudio}
                trackerDesk={trackerDesk}
              />
            )}
          </div>
        </div>
        )}
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

/** CREATIVE DEPTH — the answer to "what if I don't like the first take?" One bar, three moves:
 *  💡 an idea board (10 distinct, diversity-gated concepts for THIS studio), 📋 the operator's
 *  business plan (six substantive sections, thin output rejected by name), and 🔁 another take of
 *  this studio's work. The direction box steers all of it in the owner's words — and every
 *  regeneration automatically diverges from prior takes (recent work rides along as
 *  "do-not-repeat"). Renditions are ADDED to the shelf ("· take 2"), never overwritten. */
/** SPARKS — per-studio direction starters that provoke the next take. Prompts, not claims:
 *  clicking one fills the direction box; the producer still grounds output in real materials. */
const SPARKS: Record<string, string[]> = {
  social: ['make it funnier', 'behind-the-scenes series', 'customer-voice posts', 'myth vs fact format', 'the numbers, plainly'],
  ads: ['lead with the strongest proof point', 'speak to the skeptic', 'one sharp offer, nothing else', 'local-first angle'],
  video: ['30-second transformation cut', 'day-in-the-life', 'answer the #1 question on camera', 'before/after with captions only'],
  direct_mail: ['the neighbor story', 'lead with the offer', 'a question they already ask', 'why this season matters'],
  feature_lab: ['for the power user', 'fix the first five minutes', 'what makes people come back daily', 'steal the best idea from an adjacent product', 'smallest shippable version'],
  assist: ['the questions we get most', 'a canned answer for refunds', 'tighten the tone', 'where the knowledge base keeps coming up short', 'a policy we should write down'],
  deliver: ['a boilerplate proposal template', 'the sections clients always ask about', 'a stronger one-pager', 'what to standardize across documents', 'a cover letter tone'],
  data: ['what the numbers actually show', 'which column to group by', 'the outlier worth a look', 'a metric we should track', 'what data we\'re missing'],
  tracker: ['what to log about each client', 'a recurring expense to watch', 'what I always forget to write down', 'the fields every entry should carry', 'what last month\'s entries say'],
  default: ['bolder', 'warmer and more personal', 'for the premium buyer', 'radically simpler', 'contrarian take'],
};

function CreateMoreBar({ worldId, cluster, onDone, ideaTitles = [] }: { worldId: string; cluster: WebCluster; onDone: () => void; ideaTitles?: string[] }) {
  const { toast } = useToast();
  const [direction, setDirection] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const sparks = SPARKS[cluster.charter?.flavor ?? ''] ?? SPARKS.default;

  const generatorFor = (flavor?: string | null): string => {
    switch (flavor) {
      case 'social': return 'gen-social';
      case 'video': return 'gen-video-script';
      case 'ads': return 'gen-ads';
      case 'feature_lab': return 'gen-features'; // "another take" regenerates concepts; the spec has its own button
      default: return 'gen-ideas'; // studios without a single generator explore via ideas
    }
  };
  const takeTool = generatorFor(cluster.charter?.flavor);

  const go = async (toolId: string) => {
    setBusy(toolId);
    try {
      const res = await runTool(worldId, cluster, toolId, { direction: direction.trim() || undefined });
      toast(res.ok ? 'success' : 'error', res.message || (res.ok ? 'Done.' : 'Nothing generated.'));
      if (res.ok) { setDirection(''); onDone(); }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(null);
    }
  };

  const btn = 'flex items-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim transition-colors hover:border-forge-ember/60 hover:text-forge-ember disabled:opacity-50';
  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-forge-dim">
        <Sparkles size={13} className="text-forge-ember" />
        <span className="font-medium text-forge-ink">Want a different version?</span>
        <span className="hidden sm:inline">— each one is added to the shelf, never replaces what you have</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={direction} onChange={(e) => setDirection(e.target.value)} maxLength={200}
          placeholder="Steer it (optional): “bolder”, “luxury buyers”, “lead with the $61k-over-ask story”…"
          className="min-w-[220px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none"
        />
        <button onClick={() => void go('gen-ideas')} disabled={!!busy} className={btn} title="10 distinct concepts for this studio — near-duplicates collapsed, each with its first step">
          {busy === 'gen-ideas' ? <Loader2 size={13} className="animate-spin" /> : <span>💡</span>} Idea board
        </button>
        <button onClick={() => void go(takeTool)} disabled={!!busy} className={btn} title="Regenerate this studio's work — automatically different from your prior takes">
          {busy === takeTool ? <Loader2 size={13} className="animate-spin" /> : <span>🔁</span>} Another take
        </button>
        {cluster.charter?.flavor === 'feature_lab' ? (
          <button onClick={() => void go('gen-spec')} disabled={!!busy} className={btn} title="A full feature spec — problem → v1 scope → success metric → risks; thin output is rejected, platform internals become [YOU FILL] holes">
            {busy === 'gen-spec' ? <Loader2 size={13} className="animate-spin" /> : <span>📐</span>} Feature spec
          </button>
        ) : (
          <button onClick={() => void go('gen-plan')} disabled={!!busy} className={btn} title="The operator's 90-day business plan — six substantive sections; thin output is rejected, unknowable numbers become [YOU FILL] holes">
            {busy === 'gen-plan' ? <Loader2 size={13} className="animate-spin" /> : <span>📋</span>} Business plan
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-forge-dim/70">Sparks:</span>
        {sparks.map((s) => (
          <button
            key={s} onClick={() => setDirection(s)}
            className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ember"
          >{s}</button>
        ))}
      </div>
      {/* IDEA → NEXT STEP in one click: the latest idea board's concepts become steer chips —
          no reading a title out of an artifact and retyping it into the box. */}
      {ideaTitles.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-forge-dim/70">Your concepts:</span>
          {ideaTitles.slice(0, 6).map((t) => (
            <button
              key={t} onClick={() => setDirection(t)}
              title={cluster.charter?.flavor === 'feature_lab' ? 'Steer with this concept, then press Feature spec' : 'Steer the next take with this concept'}
              className="rounded-full border border-forge-ok/30 px-2.5 py-1 text-[11px] text-forge-ok/90 transition-colors hover:border-forge-ok/60"
            >{t.length > 42 ? `${t.slice(0, 42)}…` : t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Workspace({ cluster, worldId, webTitle, results, busyTool, onTool, onChanged, productLab, assistDesk, docStudio, dataStudio, trackerDesk }: {
  cluster: WebCluster; worldId: string; webTitle: string;
  results: { sent: number; replies: number; pendingApprovals: number };
  busyTool: string | null; onTool: (t: WorkTool) => void; onChanged: () => void;
  productLab?: boolean;
  assistDesk?: boolean;
  docStudio?: boolean;
  dataStudio?: boolean;
  trackerDesk?: boolean;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const meta = cluster.charter ? ARCHETYPES[cluster.charter.archetype] : null;
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>([]);
  const [files, setFiles] = useState<ClusterFile[]>([]);
  // The latest idea board's numbered concepts, parsed into one-click steer chips (ideasToDetail
  // emits "N. Title" lines) — the idea→next-step handoff without retyping.
  const ideaTitles = useMemo(() => {
    const board = artifacts.find((a) => a.slug?.startsWith('idea-board'));
    if (!board?.detail) return [];
    return [...board.detail.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
  }, [artifacts]);
  const [loadingArts, setLoadingArts] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  // The world's brand accent tints the artifact previews (a postcard in her colors, not grey).
  const [brandAccent, setBrandAccent] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getBrandKit(worldId).then((k) => { if (live) setBrandAccent(k?.palette?.[0]); }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const reload = useCallback(async () => {
    try {
      const [a, f] = await Promise.all([listClusterArtifacts(cluster.id), listClusterFiles(cluster.id)]);
      setArtifacts(a); setFiles(f);
    } catch { /* studio still usable without the lists */ } finally { setLoadingArts(false); }
  }, [cluster.id]);

  useEffect(() => { setLoadingArts(true); void reload(); }, [reload]);

  const bumpChanged = useCallback(() => { void reload(); onChanged(); }, [reload, onChanged]);

  const upload = async (file: File) => {
    // Images/binaries the studios RENDER go to cluster_files. Text/docs/CSVs are KNOWLEDGE — they must
    // be ingested into THIS world (world-scoped + embedded) or retrieval can never see them, and the
    // grounded studios would refuse forever. This is the difference between "stored" and "usable".
    const isImage = file.type.startsWith('image/');
    try {
      if (isImage) {
        await uploadClusterFile(cluster.id, file);
        toast('success', `Added ${file.name}.`);
      } else {
        await uploadAndIngest(file, { worldId });
        toast('success', `Added ${file.name} to this world’s knowledge — the studios can use it now.`);
      }
      await reload();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Upload failed.'); }
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
        <Link to="/garvis/queue" className="mt-3 flex items-center gap-1.5 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          <ShieldCheck size={14} /> {cluster.pendingApprovals} action{cluster.pendingApprovals === 1 ? '' : 's'} waiting for approval <ChevronRight size={13} />
        </Link>
      )}

      {/* THE STUDIO HERO — names what this studio makes and gives ONE obvious Generate action.
          The answer to "I don't even know how to generate it." Only for studio areas; other
          archetypes (vault, audience, ledger…) have their own dedicated panels below. */}
      {cluster.charter?.archetype === 'studio' && (
        <div className="mt-3">
          <StudioHero
            cluster={cluster}
            worldId={worldId}
            hasEarnedWork={cluster.earnedArtifacts > 0}
            onDone={bumpChanged}
            onToast={(k, m) => toast(k, m)}
          />
        </div>
      )}

      {/* Brand kit — the vault's real workspace. This is where "Set up the brand" lands:
          the kit feeds the studio chat voice and clears the brand-empty blocker. */}
      {cluster.charter?.archetype === 'vault' && (
        <BrandKitPanel worldId={worldId} onSaved={onChanged} />
      )}

      {/* G4 — Market Intelligence: who plausibly needs this business, reasoned from the DNA,
          searched read-only, fit-labeled with grounded reasons. Contact = approvals, always. */}
      {cluster.charter?.archetype === 'audience' && (
        <>
          <LeadsPanel worldId={worldId} />
          <ProspectFinderPanel worldId={worldId} />
        </>
      )}

      {/* G5/G6 — the honest per-channel results, the adaptive read, and platform connections.
          A PRODUCT LAB's ledger counts shipped thinking, not sends — the 5-channel marketing
          table ("Email: no campaigns yet · Meta ads: not running") was noise wearing a dashboard. */}
      {cluster.charter?.archetype === 'ledger' && (assistDesk ? (
        <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-4 text-sm text-forge-dim">
          <p className="mb-1 font-medium text-forge-ink">This desk measures answered, not sent.</p>
          <p>Nothing here goes out on its own — you copy and send. After each copied draft, the desk
          asks whether you sent it as-is or rewrote it — and this ledger counts the real answers.
          When a reply comes back refused, add the missing answer with the “Add knowledge” box on
          the desk — and the next draft can stand on it.</p>
          <VerdictReadout worldId={worldId} kind="assist" />
        </div>
      ) : docStudio ? (
        <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-4 text-sm text-forge-dim">
          <p className="mb-1 font-medium text-forge-ink">This studio measures documents made, not sent.</p>
          <p>Nothing is auto-delivered — you review and hand each document off yourself. After each
          copy or export, the studio asks whether you sent it as-is or rewrote it — and this ledger
          counts the real answers. When a section keeps asking for the same input, add that source
          material with the “Add source material” box on the studio.</p>
          <VerdictReadout worldId={worldId} kind="deliver" />
        </div>
      ) : trackerDesk ? (
        <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-4 text-sm text-forge-dim">
          <p className="mb-1 font-medium text-forge-ink">This registry measures what's on record.</p>
          <p>Entries you log accumulate as this world's memory — nothing is sent or automated from
          them. The honest measure here is coverage: when an answer comes back "nothing on record",
          that's the entry to log next.</p>
        </div>
      ) : dataStudio ? (
        <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-4 text-sm text-forge-dim">
          <p className="mb-1 font-medium text-forge-ink">This studio measures analyses, not sends.</p>
          <p>Every figure here is computed from your data, never guessed. Saved summaries land on the
          workspace's shelf — the fact sheet stands on its own, and any written read is grounded only
          in those numbers. This ledger keeps the analyses you've run so you can compare them over time.</p>
        </div>
      ) : productLab ? (
        <div className="mt-4 rounded-xl border border-forge-border bg-forge-panel/50 p-4 text-sm text-forge-dim">
          <p className="mb-1 font-medium text-forge-ink">This lab measures shipped thinking.</p>
          <p>Concepts and specs live on each studio's shelf; the progress ledger doc here tracks
          explored → chosen → specced → pitched. If this world ever starts launching things
          (outreach, a site), the channel results appear here automatically.</p>
        </div>
      ) : (
        <>
          <ResultsPanel worldId={worldId} />
          <ConnectionsCard worldId={worldId} onSynced={onChanged} />
        </>
      ))}

      {/* Direct mail as a real product: a print-ready 6×9 postcard built from this world's own
          brand kit + vault photos, with a QR from the tracking link, a print/PDF path, and a
          mail log so mailed batches count as real outreach. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'direct_mail' && (
        <PanelBoundary name="postcard designer"><MailerDesigner worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* THE FARM — neighborhood prospecting: territories, address-first household lists (columns
          kept), farm-viability math, do-not-mail suppression, and an addressed merged print run
          from this world's saved postcard design. Lives on both the lists desk and the mail studio. */}
      {cluster.charter?.archetype === 'studio' && (cluster.charter.flavor === 'lists' || cluster.charter.flavor === 'direct_mail') && (
        <PanelBoundary name="neighborhood farm"><FarmPanel worldId={worldId} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* MARKET DATA from the owner's own RESO/MLS feed — computed stats, honest empty state,
          and the sold-by-zip number the Farm's turnover math needs. */}
      {cluster.charter?.flavor === 'market' && (
        <PanelBoundary name="market data"><MarketDataPanel onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* Video as a real product: a timed, captioned storyboard from this world's own photos —
          plays in the browser now, renders a real mp4 when a render key is set. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'video' && (
        <PanelBoundary name="video studio"><VideoStudio worldId={worldId} clusterId={cluster.id} title={cluster.title} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* SOCIAL STUDIO — a gallery of post ideas → a ready caption. Sits above the publisher: pick an
          idea + edit it here, then schedule/post it below. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'social' && (
        <PanelBoundary name="social studio"><IdeaStudio spec={SOCIAL_SPEC} worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onSaved={reload} /></PanelBoundary>
      )}

      {/* AUTO-POST to her real connected social accounts (Ayrshare), scheduled + approval-gated. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'social' && (
        <div className="mt-4"><PanelBoundary name="social publisher"><SocialPublisher worldId={worldId} onToast={(k, m) => toast(k, m)} /></PanelBoundary></div>
      )}

      {/* EMAIL STUDIO — a gallery of email ideas, each a ready example you spin/edit/save as a draft. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'email' && (
        <PanelBoundary name="email studio"><EmailStudio worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onSaved={reload} /></PanelBoundary>
      )}

      {/* ADS STUDIO — a gallery of Meta/Google campaign ideas, each a ready ad draft (nothing spends). */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'ads' && (
        <PanelBoundary name="ads studio"><IdeaStudio spec={ADS_SPEC} worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onSaved={reload} /></PanelBoundary>
      )}

      {/* COPY STUDIO — the core messaging every channel reuses (value prop, story, taglines, …). Also
          the working surface for a plain (flavorless) studio cluster, so it's never a dead end. */}
      {cluster.charter?.archetype === 'studio' && (cluster.charter.flavor === 'generic' || cluster.charter.flavor == null) && (
        <PanelBoundary name="copy studio"><IdeaStudio spec={COPY_SPEC} worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onSaved={reload} /></PanelBoundary>
      )}

      {/* REEL STUDIO — a real three-stage pipeline for a faceless content account: ideate an angle →
          script the beats (Hook→Value→CTA) → storyboard every shot. Saved as a draft; rendering to
          video needs a connected video model. Modeled on the traction-engine repo's flow. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'content_growth' && (
        <PanelBoundary name="reel studio"><ReelStudio worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onSaved={reload} /></PanelBoundary>
      )}

      {/* OPERATOR ASSISTANT — the answering desk: paste an incoming message, get a reply grounded
          only in this world's knowledge base, cited, with its gaps flagged. Refuses over an empty
          corpus. The human copies and sends; nothing is auto-sent. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'assist' && (
        <PanelBoundary name="answering desk"><AnsweringDesk worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* DELIVERABLE GENERATOR — the document studio: produce a finished, exportable document
          (proposal / report / one-pager) grounded in this world's knowledge, one or a batch. You
          review and send; nothing is auto-delivered. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'deliver' && (
        <PanelBoundary name="document studio"><DeliverableStudio worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* AUTO-PAPERWORK: the operator's own templates merged from real records — unfilled fields
          refuse to send, and every envelope goes through Approvals to docusign-send. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'deliver' && (
        <PanelBoundary name="paperwork studio"><PaperworkStudio worldId={worldId} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* DATA & NUMBERS WORKSPACE — a CSV becomes a typed table, honest per-column stats, and a chart
          drawn only from a real aggregation. Every number is computed in pure code; the optional read
          narrates only those figures, never inventing one. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'data' && (
        <PanelBoundary name="data workspace"><DataWorkspace worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* PERSONAL/INTERNAL REGISTRY — log entries that become queryable memory. Records, not
          automations: nothing is computed or sent from them unless the owner asks. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'tracker' && (
        <PanelBoundary name="registry"><TrackerRegistry worldId={worldId} clusterId={cluster.id} onToast={(k, m) => toast(k, m)} onChanged={onChanged} /></PanelBoundary>
      )}

      {/* TRANSACTION TIMELINES: contract-to-close checklists whose dated steps can become firing
          reminders — deadlines that ring, not rows that wait. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'tracker' && (
        <PanelBoundary name="transaction timelines"><TimelinePanel worldId={worldId} onToast={(k, m) => toast(k, m)} /></PanelBoundary>
      )}

      {/* G3 — the website bridge: this world's DNA, brand kit, and captioned artwork compile
          into ONE brief and open the app builder. Real photos, never placeholders. */}
      {cluster.charter?.archetype === 'studio' && cluster.charter.flavor === 'landing' && (
        <div className="mt-4">
          <Button
            variant="primary" size="md"
            onClick={() => void buildFromWorld(worldId, cluster.id).then((route) => navigate(route)).catch((e) => toast('error', e instanceof Error ? e.message : 'Could not stage the build.'))}
            title="Compiles the world's DNA, brand kit, and website-labeled artwork into a build brief and opens the app builder"
          >
            <Sparkles size={15} /> Build the website — with this world's artwork
          </Button>
          {/* SITE RENDITIONS — pick the design mechanism before the generator runs; same real
              materials, a genuinely different site. Rebuild under another direction any time. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-forge-dim/70">Or pick a design direction:</span>
            {SITE_DIRECTIONS.map((d) => (
              <button
                key={d.id} title={d.brief.replace('DESIGN DIRECTION: ', '')}
                onClick={() => void buildFromWorld(worldId, cluster.id, d.id).then((route) => navigate(route)).catch((e) => toast('error', e instanceof Error ? e.message : 'Could not stage the build.'))}
                className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ember"
              >{d.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* CREATIVE DEPTH — ideas, another take, the business plan, all steerable. HIDDEN until the
          studio has real work: an empty studio shows exactly ONE way to make something (the hero /
          its dedicated panel). Once there's a piece on the shelf, this appears as an opt-in
          "want a different version?" — so the first-time view is never a wall of buttons. */}
      {cluster.charter && cluster.earnedArtifacts > 0 && (
        <CreateMoreBar worldId={worldId} cluster={cluster} onDone={bumpChanged} ideaTitles={ideaTitles} />
      )}

      {/* Tools — only for NON-studio areas (audience lists, launch/queue, vault imports…). A studio's
          one action is its hero Generate button or its dedicated panel above, so its tool row would
          just be the same producer under a second label — hidden here to keep one obvious action. */}
      {cluster.charter?.archetype !== 'studio' && (
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
      )}

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
          <p className="text-xs text-forge-dim/60">No files. Images are stored for the studios to use; a dropped document, text file, or CSV is ingested into this world’s knowledge so the studios can ground on it.</p>
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
          <p className="text-sm text-forge-dim/70">
            {cluster.charter?.archetype === 'studio'
              ? 'Nothing here yet — use the studio above to make your first piece. It lands here.'
              : 'Nothing here yet. Use a tool above to get started.'}
          </p>
        ) : (
          <div className="space-y-2">
            {artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} onChanged={bumpChanged} accent={brandAccent} />)}
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

  // Prospect → audience. Emails come from the prospect's OWN site (fetch-url contact scan) or
  // the operator's paste — Garvis never invents an address. Found emails prefill; one click adds.
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [findingFor, setFindingFor] = useState<string | null>(null);
  const toAudience = async (row: ProspectRow, email?: string) => {
    try {
      const r = await prospectToAudience(worldId, row, email ?? emailDraft);
      toast('success', r.message);
      setEmailFor(null); setEmailDraft('');
      setRows((p) => p.map((x) => (x.id === row.id ? { ...x, status: 'in_audience', contact_id: r.contactId } : x)));
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not add the contact.'); }
  };
  const findEmails = async (row: ProspectRow) => {
    if (findingFor) return;
    setFindingFor(row.id);
    try {
      const r = await scanProspectEmails(worldId, row);
      toast(r.emails.length ? 'success' : 'info', r.message);
      setRows((p) => p.map((x) => (x.id === row.id ? { ...x, contact_emails: r.emails, scanned_at: new Date().toISOString() } : x)));
      if (r.emails.length) { setEmailFor(row.id); setEmailDraft(r.emails[0]); }
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Scan failed.'); }
    finally { setFindingFor(null); }
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
                  <>
                    {r.url && (
                      <button onClick={() => void findEmails(r)} disabled={findingFor !== null} className="flex items-center gap-1 text-[11px] text-forge-ink/80 hover:text-forge-ember disabled:opacity-50">
                        {findingFor === r.id && <Loader2 size={10} className="animate-spin" />}
                        {r.scanned_at && !r.contact_emails?.length ? 'rescan site' : 'find email'}
                      </button>
                    )}
                    <button onClick={() => { setEmailFor(emailFor === r.id ? null : r.id); setEmailDraft(r.contact_emails?.[0] ?? ''); }} className="text-[11px] text-forge-ember hover:underline">→ audience</button>
                  </>
                )}
                {r.status === 'in_audience' && <span className="text-[10px] uppercase tracking-wide text-forge-ok">in audience</span>}
                {r.status !== 'new' && r.status !== 'qualified' && r.status !== 'in_audience' && <span className="text-[10px] uppercase tracking-wide text-forge-dim">{r.status}</span>}
              </div>
              {(r.contact_emails?.length ?? 0) > 0 && r.status === 'qualified' && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-forge-dim">on their site:</span>
                  {r.contact_emails!.map((e) => (
                    <button key={e} onClick={() => { setEmailFor(r.id); setEmailDraft(e); }}
                      className={cn('rounded border px-1.5 py-0.5 text-[11px] transition-colors', emailDraft === e && emailFor === r.id ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-ink/80 hover:border-forge-ember/40')}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
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

/** G5 — inbound leads from the generated website: real humans who submitted the form. Each is
 *  already linked (or matched) to a contact by the ingest function, so follow-up is one queue
 *  tool away. Status transitions are the operator's honest report of what they actually did. */
function LeadsPanel({ worldId }: { worldId: string }) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [instrumented, setInstrumented] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void worldResults(worldId).then((r) => {
      if (!live) return;
      setLeads(r.leadsList);
      setInstrumented(r.site !== null);
    }).catch(() => { if (live) setInstrumented(false); });
    return () => { live = false; };
  }, [worldId]);

  const mark = async (row: LeadRow, status: LeadRow['status']) => {
    try {
      await setLeadStatus(row.id, status);
      setLeads((p) => status === 'spam' ? p.filter((l) => l.id !== row.id) : p.map((l) => (l.id === row.id ? { ...l, status } : l)));
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };

  if (instrumented === null) return null;
  if (!instrumented && !leads.length) return null;  // no site channel yet — the finder panel below stands alone

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-4">
      <h3 className="text-sm font-semibold text-forge-ink">Leads — from your website</h3>
      {leads.length === 0 ? (
        <p className="mt-1 text-xs text-forge-dim">The site is instrumented and reporting. No form submissions yet — every one will land here (and in your waking moment) the moment it happens.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {leads.slice(0, 12).map((l) => (
            <li key={l.id} className="rounded-lg border border-forge-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-forge-ink">{l.name || l.email}</span>
                {l.source !== 'website' && <span className="rounded border border-forge-ember/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-forge-ember">{l.source}</span>}
                <span className="text-[10px] text-forge-dim">{timeAgo(l.created_at)}</span>
                {l.status === 'new' ? (
                  <>
                    <button onClick={() => void mark(l, 'contacted')} className="text-[11px] text-forge-ok hover:underline">mark answered</button>
                    <button onClick={() => void mark(l, 'spam')} className="text-[11px] text-forge-dim hover:text-forge-warn">spam</button>
                  </>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-forge-dim">{l.status}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-forge-dim">{l.email}{l.phone ? ` · ${l.phone}` : ''}</p>
              {l.message && <p className="mt-0.5 text-xs text-forge-ink/80">&ldquo;{l.message.slice(0, 200)}&rdquo;</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** G5+G6 — per-channel results AND what the numbers say. Counts are rows; recommendations are the
 *  verified adapt() engine's output, each carrying its evidence and an honest confidence tier
 *  (act / watch / too-early). Spend is logged by the operator until platform APIs are connected —
 *  so cost-per-lead is always logged-spend ÷ measured-leads, two real numbers. */
function ResultsPanel({ worldId }: { worldId: string }) {
  const { toast } = useToast();
  const [read, setRead] = useState<AdaptiveRead | null>(null);
  const [spendChannel, setSpendChannel] = useState('meta ads');
  const [spendAmount, setSpendAmount] = useState('');

  const reload = useCallback(async () => {
    try { setRead(await readAdaptive(worldId)); } catch { /* panel hides */ }
  }, [worldId]);
  useEffect(() => { void reload(); }, [reload]);

  const logSpend = async () => {
    const n = parseFloat(spendAmount);
    if (!Number.isFinite(n) || n <= 0) { toast('error', 'Enter the real amount spent.'); return; }
    try {
      await logAdSpend(worldId, spendChannel, n);
      setSpendAmount('');
      toast('success', `Logged $${n} on ${spendChannel} — cost-per-lead now computes from real numbers.`);
      await reload();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not log spend.'); }
  };

  if (!read) return null;
  const res = read.results;
  const rows: { channel: string; out: string; back: string }[] = [
    {
      channel: 'Email',
      out: res.email ? `${res.email.sent} sent` : 'no campaigns yet',
      back: res.email ? `${res.email.replies} repl${res.email.replies === 1 ? 'y' : 'ies'}` : '—',
    },
    {
      channel: 'Direct mail',
      out: res.mail ? `${res.mail.pieces} pieces (${res.mail.batches} batch${res.mail.batches === 1 ? '' : 'es'})` : 'nothing logged yet',
      back: res.site
        ? `${res.site.bySource.find((s) => s.source === 'postcard')?.visits ?? 0} QR visits · ${res.site.bySource.find((s) => s.source === 'postcard')?.leads ?? 0} leads`
        : 'site not instrumented',
    },
    {
      channel: 'Website',
      out: res.site ? `${res.site.visits} visits (${res.site.visits7d} this week)` : 'not instrumented — build/rebuild the site to wire reporting',
      back: res.site ? `${res.site.leads} lead${res.site.leads === 1 ? '' : 's'} (${res.site.leads7d} this week)` : '—',
    },
    {
      channel: 'Meta ads',
      out: (read.spendByChannel['meta ads'] ?? 0) > 0 || (res.site?.bySource.some((s) => s.source === 'meta-ads') ?? false)
        ? `$${read.spendByChannel['meta ads'] ?? 0} logged · ${res.site?.bySource.find((s) => s.source === 'meta-ads')?.visits ?? 0} visits`
        : 'not running — generate the campaign in an ads studio',
      back: `${res.site?.bySource.find((s) => s.source === 'meta-ads')?.leads ?? 0} leads`,
    },
    {
      channel: 'Google ads',
      out: (read.spendByChannel['google ads'] ?? 0) > 0 || (res.site?.bySource.some((s) => s.source === 'google-ads') ?? false)
        ? `$${read.spendByChannel['google ads'] ?? 0} logged · ${res.site?.bySource.find((s) => s.source === 'google-ads')?.visits ?? 0} visits`
        : 'not running — generate the campaign in an ads studio',
      back: `${res.site?.bySource.find((s) => s.source === 'google-ads')?.leads ?? 0} leads`,
    },
  ];

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-4">
      <h3 className="text-sm font-semibold text-forge-ink">Results by channel</h3>
      <p className="mt-0.5 text-[11px] text-forge-dim">Every number is a count of real rows — sends, batches, visits, leads. Nothing modeled, nothing estimated.</p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-forge-dim">
            <th className="py-1 pr-2 font-medium">Channel</th>
            <th className="py-1 pr-2 font-medium">Went out</th>
            <th className="py-1 font-medium">Came back</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.channel} className="border-t border-forge-border/60">
              <td className="py-1.5 pr-2 text-forge-ink">{r.channel}</td>
              <td className="py-1.5 pr-2 text-forge-dim">{r.out}</td>
              <td className="py-1.5 text-forge-dim">{r.back}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {res.site && res.site.bySource.length > 0 && (
        <p className="mt-2 text-[11px] text-forge-dim">
          Visit sources: {res.site.bySource.slice(0, 5).map((s) => `${s.source} ${s.visits}v/${s.leads}l`).join(' · ')}
        </p>
      )}

      {/* Spend log — real dollars in, so cost-per-lead is measured, never modeled */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-forge-border/60 pt-3">
        <span className="text-[11px] uppercase tracking-wide text-forge-dim">Log spend:</span>
        <select value={spendChannel} onChange={(e) => setSpendChannel(e.target.value)}
          className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none">
          <option value="meta ads">Meta ads</option>
          <option value="google ads">Google ads</option>
          <option value="direct mail">Direct mail</option>
          <option value="email">Email</option>
        </select>
        <input value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} inputMode="decimal" placeholder="$ spent"
          className="w-24 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        <button onClick={() => void logSpend()} className="rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">Log</button>
      </div>

      {/* Adaptive Operation — what the numbers say, evidence attached, confidence honest */}
      {read.recs.length > 0 && (
        <div className="mt-3 border-t border-forge-border/60 pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-forge-ink">What the numbers say</h4>
          <ul className="mt-1.5 space-y-1.5">
            {read.recs.map((r, i) => (
              <li key={i} className="rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className={cn(
                    'mt-px rounded border px-1 py-px font-mono text-[8.5px] uppercase tracking-wide',
                    r.confidence === 'act' ? 'border-forge-ok/40 text-forge-ok'
                      : r.confidence === 'watch' ? 'border-forge-warn/40 text-forge-warn'
                      : 'border-forge-border text-forge-dim/70',
                  )}>{r.confidence}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-forge-ink">{r.text}</p>
                    <p className="mt-0.5 text-[11px] text-forge-dim">{r.evidence} <span className="text-forge-dim/60">({r.basis})</span></p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The ad-platform connections card — honest state per provider: connected (sync works), needs
 *  your account id, or not registered yet (with the EXACT registration steps from the server).
 *  Secrets never touch the browser; this card only holds account ids and the sync button. */
function ConnectionsCard({ worldId, onSynced }: { worldId: string; onSynced: () => void }) {
  const { toast } = useToast();
  const [conns, setConns] = useState<ConnectionState[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listConnections().then((c) => { if (live) { setConns(c); setDrafts(Object.fromEntries(c.map((x) => [x.provider, x.accountId]))); } }).catch(() => {});
    return () => { live = false; };
  }, []);

  const doSync = async (c: ConnectionState) => {
    setBusy(c.provider);
    try {
      const draft = (drafts[c.provider] ?? '').trim();
      if (draft && draft !== c.accountId) await saveConnectionAccount(c.provider, draft);
      const r = await syncProvider(c.provider, worldId);
      toast(r.ok ? 'success' : 'info', r.message);
      if (r.ok) { setConns(await listConnections()); onSynced(); }
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Sync failed.'); }
    finally { setBusy(null); }
  };

  if (!conns.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/40 p-4">
      <h3 className="text-sm font-semibold text-forge-ink">Ad platform connections</h3>
      <p className="mt-0.5 text-[11px] text-forge-dim">Read-only sync (reporting first — the fast approval lane). Secrets live on the server; this card holds only your account ids.</p>
      <div className="mt-2 space-y-2">
        {conns.map((c) => (
          <div key={c.provider} className="rounded-lg border border-forge-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-forge-ink">{c.label}</span>
              <span className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                c.serverConfigured && c.status === 'ready' ? 'border-forge-ok/40 text-forge-ok'
                  : c.serverConfigured ? 'border-forge-warn/40 text-forge-warn'
                  : 'border-forge-border text-forge-dim',
              )}>
                {c.serverConfigured ? (c.status === 'ready' ? 'connected' : 'needs account id') : 'not registered'}
              </span>
              {c.lastSyncedAt && <span className="text-[10px] text-forge-dim">synced {timeAgo(c.lastSyncedAt)}</span>}
              <span className="flex-1" />
              {c.serverConfigured ? (
                <>
                  <input
                    value={drafts[c.provider] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.provider]: e.target.value }))}
                    placeholder={c.provider === 'meta_ads' ? 'act_123… or 123…' : '123-456-7890'}
                    className="w-36 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none"
                  />
                  <button onClick={() => void doSync(c)} disabled={busy !== null}
                    className="flex items-center gap-1 rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10 disabled:opacity-50">
                    {busy === c.provider && <Loader2 size={11} className="animate-spin" />} Sync 30 days
                  </button>
                </>
              ) : (
                <button onClick={() => setShowSetup(showSetup === c.provider ? null : c.provider)}
                  className="text-[11px] text-forge-ember hover:underline">how to connect</button>
              )}
            </div>
            {c.lastError && <p className="mt-1 text-[11px] text-forge-warn">Last sync error: {c.lastError}</p>}
            {showSetup === c.provider && (
              <ol className="mt-2 space-y-1 border-t border-forge-border/60 pt-2 text-[11px] text-forge-dim">
                {c.setup.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
