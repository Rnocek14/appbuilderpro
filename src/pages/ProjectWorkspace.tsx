import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Code2, MessageSquare, Rocket, Globe, Brain, Map, Upload, Compass, ShieldCheck, CircleX, TriangleAlert, Lightbulb, Zap, Terminal as TerminalIcon, X, Database, Gauge, Server, Palette, Monitor, Tablet, Smartphone, Terminal, KeyRound, Check, ExternalLink, Search, Github, Table2, Cloud, type LucideIcon } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { FileTree } from '../components/editor/FileTree';
import { CodeEditorPane } from '../components/editor/CodeEditorPane';
import { PreviewPane, type Device, type SelectedElement } from '../components/editor/PreviewPane';
import { WebContainerPane } from '../components/editor/WebContainerPane';
import { SearchPanel } from '../components/editor/SearchPanel';
import { DataPanel } from '../components/editor/DataPanel';
import { syncFiles, runTypecheck, runBuild, type TsDiag } from '../lib/webcontainer';
import { WebContainerTerminal } from '../components/editor/WebContainerTerminal';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useProjectFiles, useGenerations, useChatMessages } from '../hooks/useProjectData';
import { useProjectSecrets } from '../hooks/useProjectSecrets';
import { useConnections, fnError } from '../hooks/useConnections';
import { sendEdit, startGeneration, researchAnswer, generateProjectMap, generateRoadmap, generateIdeation, analyzeDocument, generateBackendFromProject, convertProjectToTokens, revertChangeSet, applyPendingEdit, createMissingModules, type EditEvent } from '../lib/aiClient';
import { agenticVerifyAndFix } from '../lib/agent/edit';
import { agentAvailable } from '../lib/agent/loop';
import { resolveAI } from '../lib/aiConfig';
import { DiffModal } from '../components/editor/DiffModal';
import type { PendingEdit } from '../lib/pendingEdit';
import { captureScreenshot, getPreviewSnapshot } from '../lib/previewRuntime';
import { extractText } from '../lib/docExtract';
import { runQA, issuesToFixRequest, type QAIssue } from '../lib/projectQA';
import { runAutopilot, type AutopilotEvent } from '../lib/autopilot';
import { Markdown } from '../components/Markdown';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Input, Modal } from '../components/ui';
import { getBrain, saveBrain, getMap, getRoadmap, getIdeation, saveDoc, listDocs, getDoc, DEFAULT_BRAIN, isMetaFile, type BrainDoc } from '../lib/projectBrain';
import { cn } from '../lib/utils';
import { ThemeModal } from '../components/ThemeModal';
import { getThreads, createThread, renameThread, deleteThread, getActiveThread, setActiveThread, threadsEnabled, threadOf, MAIN_THREAD_ID, type Thread } from '../lib/threads';
import type { Project, Deployment, EditPlan, ProjectFile } from '../types';

type MiddleTab = 'chat' | 'code';

/**
 * Wait for the live preview to render the latest code, then report any uncaught runtime error.
 * Resolves with the error string if the render threw, null if it rendered cleanly (or we couldn't
 * observe within the timeout). This lets the edit flow catch render-time failures that static
 * checks can't see (e.g. a default/named import mismatch → React error #130).
 */
async function awaitPreviewError(sinceTs: number, timeoutMs = 6000): Promise<string | null> {
  const start = Date.now();
  for (;;) {
    const s = getPreviewSnapshot();
    if (s.updatedAt > sinceTs) {
      if (s.error) return s.error;
      if (s.dom || s.route || s.title) return null; // rendered content, no error
    }
    if (Date.now() - start > timeoutMs) return s.updatedAt > sinceTs ? s.error : null;
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Where to get each known API key — shown as a "Get key ↗" link in the secret popup.
const SECRET_HINT: Record<string, { url: string }> = {
  RESEND_API_KEY: { url: 'https://resend.com/api-keys' },
  SENDGRID_API_KEY: { url: 'https://app.sendgrid.com/settings/api_keys' },
  STRIPE_SECRET_KEY: { url: 'https://dashboard.stripe.com/apikeys' },
  STRIPE_WEBHOOK_SECRET: { url: 'https://dashboard.stripe.com/webhooks' },
  OPENAI_API_KEY: { url: 'https://platform.openai.com/api-keys' },
  ANTHROPIC_API_KEY: { url: 'https://console.anthropic.com/settings/keys' },
  TWILIO_AUTH_TOKEN: { url: 'https://console.twilio.com' },
  TWILIO_ACCOUNT_SID: { url: 'https://console.twilio.com' },
};

/** A compact icon-only header tool button with a tooltip — keeps the toolbar to one clean line. */
function HeaderTool({ icon: Icon, label, onClick, active }: {
  icon: LucideIcon; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        active ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink',
      )}
    >
      <Icon size={15} />
    </button>
  );
}

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { session, refreshProfile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const { files, loading: filesLoading, loadError, saveFile, createFile, renameFile, deleteFile, getVersions, refresh: refreshFiles } = useProjectFiles(id);
  const { active: activeGeneration, refresh: refreshGens } = useGenerations(id);
  const { messages } = useChatMessages(id);

  const [tab, setTab] = useState<MiddleTab>('chat');
  const [termOpen, setTermOpen] = useState(false);
  // Per-project runtime choice: false = fast same-origin blob preview (default), true = real
  // WebContainer (npm install + Vite build, any package). Imported projects always use WebContainer.
  const [fullRuntime, setFullRuntime] = useState(() => !!id && localStorage.getItem(`ff:full-runtime:${id}`) === '1');
  useEffect(() => { setFullRuntime(!!id && localStorage.getItem(`ff:full-runtime:${id}`) === '1'); }, [id]);
  const toggleFullRuntime = (next: boolean) => {
    setFullRuntime(next);
    if (id) localStorage.setItem(`ff:full-runtime:${id}`, next ? '1' : '0');
  };
  // Supabase connection (stored in the project's /.env so the preview + app use it).
  const [connectOpen, setConnectOpen] = useState(false);

  // Integration secrets — the keys the app's edge functions need (the secret popup, Phase 6).
  const { required: reqSecrets, integrations: backendIntegrations, missing: missingSecrets, values: secretValues, deployed: deployedSecrets, setSecret, markDeployed } = useProjectSecrets(id, files);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const secretsSig = reqSecrets.map((s) => s.env).sort().join(',');
  // Pop the secret request once per unique set of required keys (Lovable-style nudge, not naggy).
  useEffect(() => {
    if (!id || !missingSecrets.length || !secretsSig) return;
    const k = `ff:secrets-prompted:${id}`;
    try { if (localStorage.getItem(k) === secretsSig) return; localStorage.setItem(k, secretsSig); } catch { /* ignore */ }
    setSecretsOpen(true);
  }, [id, missingSecrets.length, secretsSig]);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [sbSaving, setSbSaving] = useState(false);
  const [sbGenerating, setSbGenerating] = useState(false);
  const [sbApplying, setSbApplying] = useState(false);
  const [sbDeploying, setSbDeploying] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const { isConnected: isProviderConnected } = useConnections();
  // Does this app already have a live database? (its /.env carries a real Supabase URL)
  const hasDb = files.some((f) => f.path === '/.env' && /VITE_SUPABASE_URL=\s*\S+/.test(f.content));
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  // Cmd/Ctrl+K opens project-wide code search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Unsaved editor edits, keyed by path. These drive the live preview immediately
  // (preview-only); Save is what persists them to the database.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [githubToken, setGithubToken] = useState(() => { try { return localStorage.getItem('ff:gh-token') ?? ''; } catch { return ''; } });
  const [netlifyToken, setNetlifyToken] = useState(() => { try { return localStorage.getItem('ff:netlify-token') ?? ''; } catch { return ''; } });
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);
  // Quick-reply chips offered when the assistant asks a clarifying question.
  const [askOptions, setAskOptions] = useState<string[]>([]);
  // A plan the assistant proposed (plan mode) awaiting the user's approval.
  const [pendingPlan, setPendingPlan] = useState<EditPlan | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [applyingPending, setApplyingPending] = useState(false);
  // Project Brain editor (vision/goals/decisions the assistant carries into every turn).
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainText, setBrainText] = useState('');
  const [brainSaving, setBrainSaving] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [brainEdit, setBrainEdit] = useState(false);
  const [docs, setDocs] = useState<BrainDoc[]>([]);
  const [viewingDoc, setViewingDoc] = useState<{ name: string; text: string } | null>(null);
  // Living project map (auto-summary of what the app currently is).
  const [mapOpen, setMapOpen] = useState(false);
  const [mapText, setMapText] = useState('');
  const [mapLoading, setMapLoading] = useState(false);
  // "What's next" phased roadmap (recommendations grounded in Brain + Map + code).
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [roadmapText, setRoadmapText] = useState('');
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  // Self-QA: deterministic static checks over the generated code.
  const [qaOpen, setQaOpen] = useState(false);
  const [qaIssues, setQaIssues] = useState<QAIssue[] | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  // Ideation: where could this app go?
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideasText, setIdeasText] = useState('');
  const [ideasLoading, setIdeasLoading] = useState(false);
  // Autopilot: supervised build loop.
  const [autoOpen, setAutoOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  // Preview controls — lifted here so they share the Runtime bar (one toolbar row, not two).
  const [device, setDevice] = useState<Device>('desktop');
  const [showConsole, setShowConsole] = useState(false);
  // Conversation threads — separate chat flows within this project (all edit the same code).
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(MAIN_THREAD_ID);
  const [threadsReady, setThreadsReady] = useState(true); // false = thread_id migration not applied
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoSteps, setAutoSteps] = useState(5);
  const [autoLog, setAutoLog] = useState<AutopilotEvent[]>([]);
  const autoStopRef = useRef(false);
  // Live edit progress while the assistant streams its response.
  const [stream, setStream] = useState<{ explanation: string; files: { path: string; done: boolean }[]; activity?: string[] } | null>(null);
  // Element the user picked in the preview's Select mode — precise context for the next chat message.
  const [selection, setSelection] = useState<SelectedElement | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('projects').select('*').eq('id', id).single()
      .then(({ data }) => setProject(data as Project));
    supabase.from('deployments').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setDeployments((data as Deployment[]) ?? []));
  }, [id, activeGeneration?.status]);

  // When a generation finishes, actively refetch files. Generation writes files in the
  // background and relies on project_files realtime to surface them — which isn't always in
  // the realtime publication. The generations channel (which drives the forge bar) is
  // reliable, so we use its active→idle transition as the cue to pull the files.
  const wasGenerating = useRef(false);
  useEffect(() => {
    const isGenerating = !!activeGeneration;
    if (wasGenerating.current && !isGenerating) { refreshFiles(); }
    wasGenerating.current = isGenerating;
  }, [activeGeneration, refreshFiles]);

  // open the entry file once generation lands
  useEffect(() => {
    if (files.length > 0 && openPaths.length === 0) {
      const entry =
        files.find((f) => f.path === '/src/App.tsx') ??
        files.find((f) => f.path === '/App.js') ??
        files.find((f) => /\/(App|main)\.(t|j)sx?$/.test(f.path)) ??
        files[0];
      setOpenPaths([entry.path]);
      setActivePath(entry.path);
    }
  }, [files, openPaths.length]);

  const setDraft = useCallback((path: string, content: string) => {
    setDrafts((d) => ({ ...d, [path]: content }));
  }, []);

  // Persist a file, then drop its draft so the editor falls back to saved content.
  const handleSaveFile = useCallback(async (path: string, content: string) => {
    await saveFile(path, content);
    setDrafts((d) => {
      if (!(path in d)) return d;
      const next = { ...d }; delete next[path]; return next;
    });
  }, [saveFile]);

  // Saved files with unsaved drafts overlaid — what the preview actually runs.
  const liveFiles = useMemo(() => {
    if (Object.keys(drafts).length === 0) return files;
    return files.map((f) => (drafts[f.path] !== undefined ? { ...f, content: drafts[f.path] } : f));
  }, [files, drafts]);

  // Which runtime backs the preview. Imported (possibly full-stack) projects always need the
  // real WebContainer; generated projects use it only when the user flips on "Full build".
  const isImported = project?.template_slug === 'imported';
  const useWebContainer = isImported || fullRuntime;
  const handleFixError = async (err: string) => {
    const image = await captureScreenshot();
    void handleSend('Fix the preview error', err, undefined, undefined, image ?? undefined);
  };

  const onStreamEvent = useCallback((e: EditEvent) => {
    switch (e.type) {
      case 'start': setStream({ explanation: '', files: [], activity: [] }); break;
      case 'explanation':
      case 'question': setStream((s) => ({ explanation: e.text, files: s?.files ?? [], activity: s?.activity ?? [] })); break;
      // The agent's live tool feed ("Reading src/App.tsx", "Type-checking") — its own lane, so
      // it never overwrites the streamed explanation. Deduped consecutive, capped at 40.
      case 'activity': setStream((s) => {
        const activity = s?.activity ?? [];
        if (activity[activity.length - 1] === e.text) return s ?? { explanation: '', files: [], activity };
        return { explanation: s?.explanation ?? '', files: s?.files ?? [], activity: [...activity.slice(-39), e.text] };
      }); break;
      case 'file-start': setStream((s) => {
        const files = s?.files ?? [];
        if (files.some((f) => f.path === e.path)) return s;
        return { explanation: s?.explanation ?? '', files: [...files, { path: e.path, done: false }], activity: s?.activity ?? [] };
      }); break;
      case 'file-done': setStream((s) => s && ({ ...s, files: s.files.map((f) => f.path === e.path ? { ...f, done: true } : f) })); break;
      case 'done': setStream(null); break;
    }
  }, []);

  // STALL WATCHDOG — a server-side generation can be killed by the edge wall-clock limit on very
  // large builds, leaving the record 'running' forever ("stuck on drafting the blueprint"). If no
  // stage progress happens for 4 minutes, mark it failed so the user gets a clear retry path
  // instead of an eternal spinner.
  const stallRef = useRef<{ sig: string; at: number }>({ sig: '', at: Date.now() });
  useEffect(() => {
    if (!activeGeneration || (activeGeneration.status !== 'running' && activeGeneration.status !== 'queued')) return;
    const iv = window.setInterval(() => {
      const sig = activeGeneration.id + '|' + activeGeneration.current_stage + '|' + JSON.stringify(activeGeneration.stages ?? []);
      if (sig !== stallRef.current.sig) { stallRef.current = { sig, at: Date.now() }; return; }
      if (Date.now() - stallRef.current.at < 240_000) return;
      void supabase.from('project_generations').update({
        status: 'failed',
        error: 'The build stalled server-side — very large apps can exceed the server time limit. Retry with the same prompt (it often succeeds), split the ask into "generate the core, then add features in chat", or add a browser API key in the model picker for unlimited-length builds.',
        finished_at: new Date().toISOString(),
      }).eq('id', activeGeneration.id).then(() => refreshGens());
    }, 30_000);
    return () => window.clearInterval(iv);
  }, [activeGeneration, refreshGens]);

  // EDGE-GENERATION VERIFY — generations that ran in the edge function (non-direct, browser key
  // present) have no compile gate server-side (no WebContainer). The moment one finishes, run the
  // same deep verify + agentic repair here. Client-orchestrated builds (direct OR cloud chunked)
  // already verified inline in chunkedGenerate, so they're skipped.
  const lastGenId = useRef<string | null>(null);
  const verifiedGenId = useRef<string | null>(null);
  useEffect(() => {
    if (activeGeneration) { lastGenId.current = activeGeneration.id; return; }
    const genId = lastGenId.current;
    if (!id || !genId || verifiedGenId.current === genId) return;
    verifiedGenId.current = genId;
    const ai = resolveAI();
    if (ai.direct || !ai.ready) return; // client-orchestrated pipelines verified in-line
    if (!agentAvailable() || busy) return;
    void (async () => {
      setBusy(true);
      onStreamEvent({ type: 'start' });
      onStreamEvent({ type: 'activity', text: 'Verifying the build with the real compiler…' });
      try {
        // Fresh builds get a PERSISTENT repair budget — finishing with known issues is the
        // "worse than Lovable" failure mode; 24 steps ≈ read/fix/re-check ~8 files.
        await agenticVerifyAndFix(id, { maxSteps: 24, onActivity: (l) => onStreamEvent({ type: 'activity', text: l }) });
      } catch { /* best-effort — residual issues surface in the Types chip */ }
      onStreamEvent({ type: 'done' });
      refreshFiles();
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGeneration, id]);

  // Approve the proposed plan: clear it and send a follow-up the model recognizes as
  // approval. Implementation plans (with file hints) route to an edit; analysis/audit
  // plans (no files) route to the model carrying out the analysis and reporting back.
  const approvePlan = () => {
    const isBuild = (pendingPlan?.fileHints.length ?? 0) > 0;
    setPendingPlan(null);
    void handleSend(
      isBuild
        ? 'Approved — go ahead and implement this plan now, exactly as described.'
        : 'Approved — go ahead and carry out this plan; report your findings.',
    );
  };

  const openBrain = async () => {
    setBrainOpen(true);
    setViewingDoc(null);
    setBrainEdit(false);
    if (!id) return;
    const [existing, docList] = await Promise.all([getBrain(id), listDocs(id)]);
    setBrainText(existing || DEFAULT_BRAIN);
    setDocs(docList);
  };

  const viewDoc = async (doc: BrainDoc) => {
    if (!id) return;
    setViewingDoc({ name: doc.name, text: await getDoc(id, doc.path) });
  };

  const handleSaveBrain = async () => {
    if (!id) return;
    setBrainSaving(true);
    try {
      await saveBrain(id, brainText);
      await refreshFiles();
      toast('success', 'Project Brain saved — the assistant will use it in every chat.');
      setBrainOpen(false);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save the Brain.');
    } finally {
      setBrainSaving(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (!file || !id) return;
    setDocBusy(true);
    try {
      const text = await extractText(file);
      await saveDoc(id, file.name, text); // keep the doc — viewable later
      const notes = await analyzeDocument(file.name, text);
      setBrainText((prev) => `${prev.trim()}\n\n## From: ${file.name}\n${notes}\n`);
      setDocs(await listDocs(id));
      setBrainEdit(true); // show the appended notes so the user can review before saving
      toast('success', `Analyzed ${file.name} — review the notes, then Save Brain.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not analyze that document.');
    } finally {
      setDocBusy(false);
    }
  };

  const openIdeas = async () => {
    setIdeasOpen(true);
    if (!id) return;
    setIdeasText(await getIdeation(id));
  };

  const refreshIdeas = async () => {
    if (!id) return;
    setIdeasLoading(true);
    try {
      setIdeasText(await generateIdeation(id));
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not generate ideas.');
    } finally {
      setIdeasLoading(false);
    }
  };

  const startAuto = async () => {
    if (!id || autoRunning) return;
    setAutoRunning(true);
    setAutoLog([]);
    autoStopRef.current = false;
    try {
      await runAutopilot(id, {
        maxSteps: autoSteps,
        shouldStop: () => autoStopRef.current,
        onEvent: (e) => {
          setAutoLog((log) => [...log, e]);
          if (e.status === 'done' || e.status === 'finished') void refreshFiles();
        },
      });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Autopilot hit an error.');
    } finally {
      setAutoRunning(false);
      await refreshFiles();
      await refreshGens();
    }
  };

  const stopAuto = () => { autoStopRef.current = true; };

  const openQA = async () => {
    setQaOpen(true);
    if (!id) return;
    setQaLoading(true);
    try {
      setQaIssues(await runQA(id));
    } finally {
      setQaLoading(false);
    }
  };

  const fixIssues = () => {
    if (!qaIssues?.length) return;
    const msg = issuesToFixRequest(qaIssues);
    setQaOpen(false);
    void handleSend(msg);
  };

  const openRoadmap = async () => {
    setRoadmapOpen(true);
    if (!id) return;
    setRoadmapText(await getRoadmap(id));
  };

  const refreshRoadmap = async () => {
    if (!id) return;
    setRoadmapLoading(true);
    try {
      setRoadmapText(await generateRoadmap(id));
      await refreshFiles();
      toast('success', 'Roadmap updated.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not generate the roadmap.');
    } finally {
      setRoadmapLoading(false);
    }
  };

  const openMap = async () => {
    setMapOpen(true);
    if (!id) return;
    setMapText(await getMap(id));
  };

  const refreshMap = async () => {
    if (!id) return;
    setMapLoading(true);
    try {
      setMapText(await generateProjectMap(id));
      await refreshFiles();
      toast('success', 'Project map updated.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not generate the map.');
    } finally {
      setMapLoading(false);
    }
  };

  // One-click: install the shadcn token theme foundation, then run an AI pass to convert the
  // app's hardcoded colors to tokens + add a ThemeToggle — fixes dark mode properly for an
  // existing app (e.g. LearnFlow) rather than patching one surface at a time.
  const setupTheme = async () => {
    if (!id || busy) return;
    try {
      toast('info', 'Converting the app to theme tokens…');
      const { changed } = await convertProjectToTokens(id);
      await refreshFiles();
      toast('success', `Tokenized ${changed} file${changed === 1 ? '' : 's'}. Pick a theme in the Theme panel — and adding a dark-mode toggle…`);
      // Small, reliable follow-up: mount the toggle + catch any color the mapper couldn't (gradients, inline styles).
      await handleSend(
        "Add a <ThemeToggle/> (import it from the project's ui kit, e.g. ../components/ui) into the app's main header or top nav so users can switch light/dark. " +
        'Also, if any element STILL uses a hardcoded color (bg-white, bg-gray-*, text-gray-*, text-black, border-gray-*, a hex value, or an inline style color), replace it with the matching shadcn token (bg-card/bg-background/bg-muted, text-foreground/text-muted-foreground, border-border, bg-primary). Otherwise change nothing.',
      );
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not convert the theme.');
    }
  };

  // AI design-polish pass: improve spacing/hierarchy/consistency without touching features.
  const polishDesign = async () => {
    if (!id || busy) return;
    await handleSend(
      'Polish the VISUAL DESIGN of this app without changing its features, page structure, routes, or logic — styling only. ' +
      'Apply modern shadcn/ui polish: a clear page header on each page (a text-2xl font-semibold tracking-tight title + a one-line text-muted-foreground description, primary action on the right); ' +
      'constrain content width with max-w-7xl mx-auto px-4 sm:px-6 lg:px-8; cards as rounded-xl border border-border bg-card shadow-sm with p-5/p-6; ' +
      'generous, consistent spacing (gap-2/3/4/6, section py-6/py-8); ALL secondary text as text-muted-foreground; consistent control sizing (h-10 buttons/inputs); lucide icons at h-4 w-4; ' +
      'hover + transition-colors + focus-visible:ring-2 ring-ring on interactive elements; tables with a muted header row, border-b rows, and hover:bg-muted/50; and proper empty/loading/skeleton states. ' +
      'Keep using theme tokens — never hardcoded colors. Make it feel clean, spacious, and premium.',
    );
  };

  // Load this project's threads + restore the last-active one, and check the migration status.
  useEffect(() => {
    if (!id) return;
    setActiveThreadId(getActiveThread(id));
    void getThreads(id).then(setThreads);
    void threadsEnabled().then(setThreadsReady);
  }, [id]);

  const reloadThreads = useCallback(async () => { if (id) setThreads(await getThreads(id)); }, [id]);
  const switchThread = (tid: string) => { if (!id) return; setActiveThreadId(tid); setActiveThread(id, tid); setTab('chat'); };
  const newThread = async () => {
    if (!id) return;
    const t = await createThread(id);
    await reloadThreads();
    switchThread(t.id);
  };
  const handleRenameThread = async (tid: string, title: string) => { if (id) { await renameThread(id, tid, title); await reloadThreads(); } };
  const handleDeleteThread = async (tid: string) => {
    if (!id) return;
    if (activeThreadId === tid) switchThread(MAIN_THREAD_ID);
    await deleteThread(id, tid);
    await reloadThreads();
  };

  const open = (path: string) => {
    setOpenPaths((p) => (p.includes(path) ? p : [...p, path]));
    setActivePath(path);
    setTab('code');
  };

  const closeTab = (path: string) => {
    setOpenPaths((p) => {
      const next = p.filter((x) => x !== path);
      if (activePath === path) setActivePath(next[next.length - 1] ?? null);
      return next;
    });
  };

  const handleRevert = async (paths: string[]) => {
    if (!id || !paths.length) return;
    try {
      const { restored, removed } = await revertChangeSet(id, paths);
      await refreshFiles();
      toast('success', `Reverted ${restored.length + removed.length} file(s) to their previous version.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not revert this change.');
    }
  };

  // Post-edit safety net, shared by the normal apply path and the review-then-apply path: a bounded
  // QA auto-fix loop + a one-shot runtime preview-error fix. (The internal fix calls run reviewMode:
  // false — auto-fixes after you've approved the main change shouldn't re-prompt the diff modal.)
  const runPostEditChecks = async () => {
    if (!id) return;
    let issues = await runQA(id);
    let errs = issues.filter((i) => i.severity === 'error');
    const hadErrors = errs.length;
    // Missing files first, deterministically: one dedicated generation per file, in parallel.
    // (An edit that rewrites App.tsx to route to pages it never emitted is the worst failure —
    // asking one bounded fix stream to write them all is exactly what fails to converge.)
    if (errs.length) {
      try {
        const made = await createMissingModules(id);
        if (made.length) {
          toast('info', `Created ${made.length} missing file${made.length === 1 ? '' : 's'} the app imports…`);
          await refreshFiles();
          issues = await runQA(id);
          errs = issues.filter((i) => i.severity === 'error');
        }
      } catch { /* best-effort — the QA loop below still runs */ }
    }
    // Progress-gated, not fixed-count: keep fixing while each pass actually reduces the error
    // count; a pass that fixed nothing won't fix it on repeat, so stop burning turns there.
    for (let pass = 1; pass <= 3 && errs.length; pass++) {
      toast('info', `Found ${errs.length} issue${errs.length === 1 ? '' : 's'} — auto-fixing…`);
      const before = errs.length;
      await sendEdit(id, issuesToFixRequest(errs), undefined, onStreamEvent, false, undefined, activeThreadId, false);
      await refreshFiles();
      issues = await runQA(id);
      errs = issues.filter((i) => i.severity === 'error');
      if (errs.length >= before) break; // stalled
    }
    if (errs.length) {
      setQaIssues(issues);
      toast('error', `Couldn't auto-fix ${errs.length} issue${errs.length === 1 ? '' : 's'} — open Check to review.`);
    } else if (hadErrors) {
      toast('success', 'Auto-fixed the issues — all checks pass.');
    }
    if (!useWebContainer) {
      const since = Date.now();
      await refreshFiles();
      const runtimeErr = await awaitPreviewError(since);
      if (runtimeErr) {
        toast('info', 'Preview threw a runtime error — auto-fixing…');
        await sendEdit(
          id,
          'The live preview threw the runtime error shown below. Find the ROOT CAUSE — most often a default-vs-named import/export mismatch, or rendering undefined/an object as a component — and make the smallest correct fix.',
          runtimeErr, onStreamEvent, false, undefined, activeThreadId, false,
        );
        await refreshFiles();
      }
    } else {
      // Full-build mode: run the REAL TypeScript type-check in the WebContainer and auto-heal.
      await refreshFiles();
      await healTypeErrors(await recheckTypes());
    }
  };

  // Sync the latest DB files into the running container, then run `tsc --noEmit` and return errors.
  // Deterministic ordering (don't rely on WebContainerPane's reactive sync racing the check).
  const recheckTypes = async (): Promise<TsDiag[]> => {
    if (!id) return [];
    const { data } = await supabase.from('project_files').select('*').eq('project_id', id).is('deleted_at', null);
    try { await syncFiles(id, (data ?? []) as ProjectFile[]); } catch { /* runner may be idle */ }
    return runTypecheck(id);
  };

  // Self-heal against real type errors — progress-gated like the static-QA loop: keep going
  // while each pass reduces the error count (up to 5), stop the moment a pass fixes nothing.
  const healTypeErrors = async (diags: TsDiag[]) => {
    if (!id || !diags.length) return;
    let remaining = diags;
    for (let pass = 1; pass <= 5 && remaining.length; pass++) {
      toast('info', `Found ${remaining.length} type error${remaining.length === 1 ? '' : 's'} — auto-fixing…`);
      const before = remaining.length;
      const msg = issuesToFixRequest(remaining.map((d) => ({ path: d.path, severity: 'error' as const, message: `Type error (line ${d.line}): ${d.message}` })));
      await sendEdit(id, msg, undefined, onStreamEvent, false, undefined, activeThreadId, false);
      await refreshFiles();
      remaining = await recheckTypes();
      if (remaining.length >= before) break; // stalled — repeating the same request won't converge
    }
    if (remaining.length) toast('error', `Couldn't auto-fix ${remaining.length} type error${remaining.length === 1 ? '' : 's'} — see the Types panel.`);
    else toast('success', 'Type-check clean — the app compiles.');
  };

  const handleApplyPending = async () => {
    if (!id || !pendingEdit) return;
    setApplyingPending(true);
    try {
      const changed = await applyPendingEdit(id, pendingEdit, activeThreadId);
      setPendingEdit(null);
      setDrafts((d) => { const next = { ...d }; for (const p of changed) delete next[p]; return next; });
      await refreshFiles();
      toast('success', `Applied ${changed.length} change${changed.length === 1 ? '' : 's'}.`);
      if (changed.length) await runPostEditChecks();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not apply changes.');
    } finally {
      setApplyingPending(false);
    }
  };

  // Lets the user cancel an in-flight turn (the Stop button). Aborting rejects the model fetch with
  // an AbortError, which handleSend swallows quietly.
  const abortRef = useRef<AbortController | null>(null);
  const stopSend = () => abortRef.current?.abort();

  const handleSend = async (message: string, previewError?: string, planFirst?: boolean, research?: boolean, image?: string, reviewMode?: boolean) => {
    if (!id || busy) return;
    // Auto-name a fresh thread from its first message, so threads get meaningful titles.
    if (activeThreadId !== MAIN_THREAD_ID) {
      const t = threads.find((x) => x.id === activeThreadId);
      if (t && t.title === 'New thread') void renameThread(id, activeThreadId, message.slice(0, 48)).then(reloadThreads);
    }
    setBusy(true);
    setTab('chat');
    setAskOptions([]); // clear any stale quick-replies from a prior question
    setPendingPlan(null); // clear any prior plan once a new turn starts
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (research) {
        // Web-research answer (live search) — conversational, never touches files.
        await researchAnswer(id, message, onStreamEvent, activeThreadId);
      } else if (files.length === 0) {
        await startGeneration(id, message);
        toast('info', 'Generation started — watch the forge.');
      } else {
        const result = await sendEdit(id, message, previewError, onStreamEvent, planFirst, image, activeThreadId, reviewMode, controller.signal);
        if (result.action === 'ask') {
          setAskOptions(result.options ?? []);
        } else if (result.action === 'plan') {
          if (result.plan) setPendingPlan(result.plan);
        } else if (result.action === 'review') {
          // Review-before-write: surface the diff; nothing is written until the user clicks Apply.
          if (result.pending) setPendingEdit(result.pending);
        } else if (result.action === 'discuss') {
          // Conversational answer — it's already in the chat; nothing else to do.
        } else {
          toast('success', result.changed.length
            ? `Updated ${result.changed.length} file${result.changed.length === 1 ? '' : 's'}.`
            : 'Done — see the assistant’s reply.');
          // Drop drafts for files the AI just rewrote — its version supersedes the
          // stale unsaved overlay, so the preview shows the actual new content.
          if (result.changed.length) {
            setDrafts((d) => {
              const next = { ...d };
              for (const p of result.changed) delete next[p];
              return next;
            });
          }
          await refreshFiles();
          if (result.changed.length) await runPostEditChecks();
        }
      }
      await refreshGens();
      await refreshProfile();
    } catch (err) {
      // User pressed Stop — not an error; leave whatever landed in place.
      if ((err as { name?: string })?.name === 'AbortError') toast('info', 'Stopped.');
      else toast('error', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStream(null);
    }
  };

  const recordDeployment = async (target: 'vercel' | 'netlify' | 'supabase') => {
    if (!id || !session) return;
    setDeploying(true);
    // INTEGRATION: swap this stub for a real Vercel/Netlify deploy hook call.
    // The record + status UI below is production-ready; only the trigger is stubbed.
    const { data } = await supabase.from('deployments')
      .insert({ project_id: id, user_id: session.user.id, target, status: 'pending', logs: 'Queued. Connect a deploy hook in Settings → Deployment to go live.' })
      .select().single();
    if (data) setDeployments((d) => [data as Deployment, ...d]);
    setDeploying(false);
    toast('info', `Deployment to ${target} recorded. Connect a deploy hook to push live builds.`);
  };

  // ONE-CLICK PUBLISH — build the app in the WebContainer, then upload dist/ to Netlify via the
  // deploy-site edge function (token stays server-side). Returns a live https URL.
  const publishSite = async () => {
    if (!id || !session) return;
    if (!useWebContainer) {
      toast('info', 'Switching to Full build — publishing needs a real production build. Try Publish again once it’s ready.');
      toggleFullRuntime(true);
      return;
    }
    setDeploying(true);
    try {
      toast('info', 'Building the app for production…');
      const built = await runBuild(id);
      if (!built.ok) { toast('error', built.error ?? 'Build failed.'); return; }
      toast('info', `Built ${built.files.length} files — publishing to Netlify…`);
      const siteId = localStorage.getItem(`ff:netlify-site:${id}`) || undefined;
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; siteId?: string; url?: string }>(
        'deploy-site', { body: { projectId: id, siteId, files: built.files, netlifyToken: netlifyToken.trim() || undefined } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.siteId) localStorage.setItem(`ff:netlify-site:${id}`, data.siteId);
      const url = data?.url ?? null;
      const { data: dep } = await supabase.from('deployments')
        .insert({ project_id: id, user_id: session.user.id, target: 'netlify', status: url ? 'live' : 'building', url, logs: `Published ${built.files.length} files.` })
        .select().single();
      if (dep) setDeployments((d) => [dep as Deployment, ...d]);
      if (url) { toast('success', `Live at ${url}`); window.open(url, '_blank'); }
      else toast('info', 'Published — Netlify is finishing the deploy.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed.';
      toast('error', /not found|failed to send|fetch|404|not deployed/i.test(msg)
        ? 'The deploy-site function isn’t deployed yet — run "supabase functions deploy deploy-site" and set NETLIFY_AUTH_TOKEN.'
        : msg);
    } finally {
      setDeploying(false);
    }
  };

  // Connect a Supabase project: store its URL + anon key in this project's /.env so the live
  // preview (and the generated app's /src/lib/db.ts) talk to the real backend.
  const openConnect = () => {
    const env = files.find((f) => f.path === '/.env')?.content ?? '';
    setSbUrl(/VITE_SUPABASE_URL\s*=\s*(.*)/.exec(env)?.[1]?.trim() ?? '');
    setSbKey(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/.exec(env)?.[1]?.trim() ?? '');
    setConnectOpen(true);
  };
  const saveConnection = async () => {
    setSbSaving(true);
    try {
      await saveFile('/.env', `VITE_SUPABASE_URL=${sbUrl.trim()}\nVITE_SUPABASE_ANON_KEY=${sbKey.trim()}\n`);
      toast('success', 'Supabase connected — the preview now uses your backend.');
      setConnectOpen(false);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save the connection.');
    } finally {
      setSbSaving(false);
    }
  };
  const migrationSql = () => files.find((f) => f.path === '/supabase/migrations/0001_init.sql')?.content ?? '';
  const projectRef = () => /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(sbUrl)?.[1];

  // One-click: apply the migration to the user's Supabase via the apply-migration edge
  // function (server-side Management API — the browser can't call it directly: no CORS).
  // One-click "Set up database": provision a Supabase project in the user's connected org, wire /.env,
  // and apply the migration — all via the user's OAuth token (provision-supabase edge fn).
  const provisionDatabase = async () => {
    if (!id) return;
    setProvisioning(true);
    try {
      toast('info', 'Creating your database — this takes a minute…');
      const call = () => supabase.functions.invoke<{ ok?: boolean; status?: string; ref?: string; url?: string; error?: string; migrated?: boolean }>('provision-supabase', { body: { projectId: id } });
      let res = await call();
      for (let i = 0; i < 6 && !res.error && res.data?.status === 'provisioning'; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        res = await call();
      }
      if (res.error) throw new Error(await fnError(res.error));
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.status === 'ready') {
        await refreshFiles();
        toast('success', `Database ready${res.data.migrated ? ' + schema applied' : ''}. Your app is now wired to it.`);
        setConnectOpen(false);
      } else {
        toast('info', 'Database is still spinning up — click "Set up database" again in a moment.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provisioning failed.';
      toast('error', /not found|failed to send|fetch|404|not deployed/i.test(msg)
        ? 'Deploy provision-supabase + connect Supabase (Settings → Connections) first.'
        : msg);
    } finally {
      setProvisioning(false);
    }
  };

  const autoApply = async () => {
    const sql = migrationSql();
    const ref = projectRef();
    if (!sql) { toast('error', 'No migration to apply — generate the backend first.'); return; }
    if (!ref) { toast('error', 'Enter your Supabase project URL above first.'); return; }
    setSbApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('apply-migration', { body: { projectId: id, projectRef: ref, sql } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast('success', 'Database populated — tables, RLS policies, and auth created in your Supabase project.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Apply failed.';
      toast('error', /not found|failed to send|fetch|404|not deployed/i.test(msg)
        ? 'The apply-migration function isn’t deployed yet — deploy it once (see the note below), or use "Copy SQL & open editor".'
        : msg);
    } finally {
      setSbApplying(false);
    }
  };

  // Fallback (zero-deploy): copy the SQL and open the project's SQL editor to paste + Run.
  const copySqlAndOpen = async () => {
    const sql = migrationSql();
    if (sql) {
      try { await navigator.clipboard.writeText(sql); toast('success', 'Migration SQL copied — paste it in the editor and click Run.'); }
      catch { toast('info', 'Open the SQL file and copy it, then paste in the editor.'); }
    }
    const ref = projectRef();
    window.open(ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard', '_blank');
  };
  // Export the project's source to a real GitHub repo (create-or-update) via the github-export edge fn.
  const exportGitHub = async () => {
    if (!id) return;
    const repo = ((project?.name ?? 'fableforge-app').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)) || 'fableforge-app';
    const payload = files
      .filter((f) => !f.path.includes('/.fableforge/') && !!f.content.trim())
      .map((f) => ({ path: f.path.replace(/^\/+/, ''), content: f.content }));
    if (!payload.length) { toast('error', 'Nothing to export yet.'); return; }
    setDeploying(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; url?: string }>(
        'github-export', { body: { projectId: id, repo, files: payload, githubToken: githubToken.trim() || undefined } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) { toast('success', `Exported to ${data.url}`); window.open(data.url, '_blank'); }
      else toast('success', 'Exported to GitHub.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed.';
      toast('error', /not found|failed to send|fetch|404|not deployed/i.test(msg)
        ? 'The github-export function isn’t deployed yet — run "supabase functions deploy github-export" and set GITHUB_TOKEN.'
        : msg);
    } finally {
      setDeploying(false);
    }
  };

  // The project's generated edge functions: one self-contained index.ts per /supabase/functions/<slug>/.
  const edgeFunctions = () => files
    .filter((f) => /^\/supabase\/functions\/[^/]+\/index\.ts$/.test(f.path) && !f.path.startsWith('/supabase/functions/_shared/'))
    .map((f) => ({ slug: f.path.split('/')[3], source: f.content }));

  // One-click: deploy the edge functions + push the collected secrets to the user's Supabase via the
  // deploy-backend edge function (server-side Management API). This is what makes the integrations RUN.
  const deployBackend = async () => {
    const env = files.find((f) => f.path === '/.env')?.content ?? '';
    const ref = /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(env)?.[1] ?? projectRef();
    if (!ref) { toast('error', 'Connect your Supabase project first (the Database button) so we know where to deploy.'); return; }
    const fns = edgeFunctions();
    const secretsToPush = reqSecrets
      .map((s) => ({ name: s.env, value: secretValues[s.env] ?? '' }))
      .filter((s) => s.value.trim());
    if (!fns.length && !secretsToPush.length) { toast('error', 'Nothing to deploy — generate integrations and add their keys first.'); return; }
    setSbDeploying(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; results?: { step: string; ok: boolean; detail?: string }[] }>(
        'deploy-backend', { body: { projectId: id, projectRef: ref, functions: fns, secrets: secretsToPush } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const failed = (data?.results ?? []).filter((r) => !r.ok);
      if (failed.length) {
        toast('error', `Deployed with issues: ${failed.map((f) => f.step).join(', ')}. ${failed[0]?.detail ?? ''}`.slice(0, 200));
      } else {
        markDeployed(secretsToPush.map((s) => s.name)); // keys now live server-side — clear local plaintext
        toast('success', `Backend live — ${fns.length} function(s) deployed, ${secretsToPush.length} secret(s) set on your Supabase project.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deploy failed.';
      toast('error', /not found|failed to send|fetch|404|not deployed/i.test(msg)
        ? 'The deploy-backend function isn’t deployed yet — deploy it once (supabase functions deploy deploy-backend), or deploy from the CLI: supabase functions deploy <name>.'
        : msg);
    } finally {
      setSbDeploying(false);
    }
  };

  // Infer + generate a backend (migration + client) for this project from its code.
  const handleGenerateBackend = async () => {
    if (!id) return;
    setSbGenerating(true);
    try {
      const { tables } = await generateBackendFromProject(id);
      await refreshFiles();
      toast(tables ? 'success' : 'info', tables
        ? `Generated a backend: ${tables} table${tables === 1 ? '' : 's'} + RLS at /supabase/migrations/0001_init.sql. Run it in Supabase, then connect below.`
        : 'No persistent data found in this app — no backend needed.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not generate the backend.');
    } finally {
      setSbGenerating(false);
    }
  };

  return (
    <AppShell fullBleed>
      <div className="flex h-full flex-col">
        {/* workspace header */}
        <div className="flex items-center gap-3 border-b border-forge-border px-4 py-2">
          <Link to="/dashboard" className="text-forge-dim hover:text-forge-ink" aria-label="Back to projects">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="truncate font-display text-sm font-semibold">{project?.name ?? '…'}</h1>
          {project && (
            <Badge tone={project.status === 'ready' ? 'ok' : project.status === 'generating' ? 'ember' : project.status === 'error' ? 'err' : 'dim'}>
              {project.status}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg border border-forge-border p-0.5 md:hidden" role="tablist">
              <button onClick={() => setTab('chat')} aria-pressed={tab === 'chat'} className={cn('rounded-md p-1.5', tab === 'chat' ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim')}><MessageSquare size={14} /></button>
              <button onClick={() => setTab('code')} aria-pressed={tab === 'code'} className={cn('rounded-md p-1.5', tab === 'code' ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim')}><Code2 size={14} /></button>
            </div>
            <div className="hidden items-center gap-0.5 rounded-lg border border-forge-border p-0.5 md:flex" role="tablist" aria-label="Middle panel">
              <button onClick={() => setTab('chat')} aria-pressed={tab === 'chat'} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs', tab === 'chat' ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}>
                <MessageSquare size={13} /> Chat
              </button>
              <button onClick={() => setTab('code')} aria-pressed={tab === 'code'} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs', tab === 'code' ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}>
                <Code2 size={13} /> Code
              </button>
            </div>
            {/* Secondary tools — grouped icon buttons (tooltips on hover) so the bar stays to one clean line. */}
            <div className="flex items-center gap-0.5 rounded-lg border border-forge-border p-0.5">
              <HeaderTool icon={Search} label="Search code (⌘/Ctrl+K)" onClick={() => setSearchOpen(true)} />
              <HeaderTool icon={Brain} label="Brain — project memory & vision" onClick={openBrain} />
              <HeaderTool icon={Map} label="Map — what the app contains" onClick={openMap} />
              <HeaderTool icon={Compass} label="Next — what to build next" onClick={openRoadmap} />
              <HeaderTool icon={ShieldCheck} label="Check — scan for issues" onClick={openQA} />
              <HeaderTool icon={Lightbulb} label="Ideas — where this could go" onClick={openIdeas} />
              <HeaderTool icon={Palette} label="Theme — colors & dark mode" onClick={() => setThemeOpen(true)} />
              <HeaderTool icon={Database} label="Supabase — connect a backend" onClick={openConnect} />
              <HeaderTool icon={Table2} label="Data — view your app's database" onClick={() => setDataOpen(true)} />
              {reqSecrets.length > 0 && (
                <HeaderTool icon={KeyRound} label={missingSecrets.length ? `Secrets — ${missingSecrets.length} API key(s) needed` : 'Secrets — API keys'} onClick={() => setSecretsOpen(true)} active={missingSecrets.length > 0} />
              )}
              {useWebContainer && (
                <HeaderTool icon={TerminalIcon} label="Terminal" onClick={() => setTermOpen((v) => !v)} active={termOpen} />
              )}
            </div>
            <Button size="sm" onClick={() => setAutoOpen(true)}>
              <Zap size={13} /> Autopilot
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeployOpen(true)}>
              <Cloud size={13} /> Cloud
            </Button>
          </div>
        </div>

        {/* file-load failure — visible instead of an endless "Waiting for project files…" */}
        {loadError && (
          <div className="flex items-center gap-3 border-b border-forge-err/40 bg-forge-err/10 px-4 py-2 text-xs text-forge-err">
            <TriangleAlert size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">Couldn't load project files: {loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void refreshFiles()}>Retry</Button>
          </div>
        )}
        {!loadError && !filesLoading && files.length === 0 && (
          <div className="border-b border-forge-border bg-forge-panel px-4 py-2 text-xs text-forge-dim">
            This project has no files yet.
          </div>
        )}

        {/* 3-pane body */}
        <div className="flex min-h-0 flex-1">
          {tab === 'code' && (
            <div className="hidden w-52 shrink-0 border-r border-forge-border bg-forge-panel md:block">
              <FileTree
                files={files.filter((f) => !isMetaFile(f.path))}
                activePath={activePath}
                onOpen={open}
                onCreate={createFile}
                onRename={renameFile}
                onDelete={deleteFile}
              />
            </div>
          )}

          <div className={cn('min-w-0 border-r border-forge-border', tab === 'chat' ? 'w-full md:w-[440px] md:shrink-0' : 'flex-1')}>
            {tab === 'chat' ? (
              <ChatPanel
                projectId={id ?? ''}
                messages={messages.filter((m) => threadOf(m.thread_id) === activeThreadId)}
                activeGeneration={activeGeneration}
                busy={busy}
                threads={threads}
                activeThreadId={activeThreadId}
                threadsReady={threadsReady}
                onSwitchThread={switchThread}
                onNewThread={newThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                askOptions={askOptions}
                plan={pendingPlan}
                onApprovePlan={approvePlan}
                stream={stream}
                onSend={(m, opts) => handleSend(m, undefined, opts?.planFirst, opts?.research, opts?.image, opts?.reviewEdits)}
                onStop={stopSend}
                defaultPlanFirst={isImported}
                defaultReviewEdits={isImported}
                onRevert={handleRevert}
                selection={selection}
                onClearSelection={() => setSelection(null)}
              />
            ) : (
              <CodeEditorPane
                files={files}
                openPaths={openPaths}
                activePath={activePath}
                drafts={drafts}
                onDraftChange={setDraft}
                onActivate={setActivePath}
                onCloseTab={closeTab}
                onSave={handleSaveFile}
                getVersions={getVersions}
              />
            )}
          </div>

          <div className={cn('flex min-w-0 flex-1 flex-col', tab === 'code' ? 'hidden lg:flex lg:w-[420px] lg:flex-none' : 'hidden md:flex')}>
            {/* Unified preview bar: Runtime switch + (Fast mode) device size & console, all one row.
                Hidden for imported apps (no runtime toggle, no device controls — WebContainerPane has its own). */}
            {(!isImported || !useWebContainer) && (
            <div className="flex items-center gap-2 border-b border-forge-border bg-forge-panel px-2 py-1.5">
              {!isImported && (
                <>
                  <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-forge-dim">Runtime</span>
                  <div className="flex items-center gap-0.5 rounded-lg border border-forge-border p-0.5" role="group" aria-label="Preview runtime">
                    <button
                      onClick={() => toggleFullRuntime(false)} aria-pressed={!fullRuntime}
                      title="Instant preview — loads any browser package from a CDN, no build step"
                      className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]', !fullRuntime ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}
                    >
                      <Gauge size={12} /> Fast
                    </button>
                    <button
                      onClick={() => toggleFullRuntime(true)} aria-pressed={fullRuntime}
                      title="Real Vite + npm install — any package incl. build-time ones; slower to start"
                      className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]', fullRuntime ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}
                    >
                      <Server size={12} /> Full build
                    </button>
                  </div>
                  <span className="hidden truncate text-[10px] text-forge-dim xl:inline">
                    {fullRuntime ? 'Real Vite + npm (slower start)' : 'Instant (CDN, no build)'}
                  </span>
                </>
              )}
              {/* Device size + console only apply to the Fast (in-browser) preview. */}
              {!useWebContainer && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg border border-forge-border p-0.5" role="group" aria-label="Device size">
                    {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
                      <button key={d} aria-label={`${d} preview`} aria-pressed={device === d} onClick={() => setDevice(d)}
                        className={cn('rounded-md p-1.5', device === d ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                  <button aria-label="Toggle console" aria-pressed={showConsole} onClick={() => setShowConsole((v) => !v)}
                    title="Toggle console output"
                    className={cn('rounded-md p-1.5', showConsole ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}>
                    <Terminal size={14} />
                  </button>
                </div>
              )}
            </div>
            )}
            <div className="min-h-0 flex-1">
              {useWebContainer ? (
                <WebContainerPane files={files} projectId={id!} onFixError={handleFixError} onHealTypes={healTypeErrors} aiBusy={busy} />
              ) : (
                <PreviewPane files={liveFiles} onFixError={handleFixError} device={device} showConsole={showConsole} busy={busy} onSelectElement={(sel) => { setSelection(sel); setTab('chat'); }} />
              )}
            </div>
          </div>
        </div>

        {/* Interactive shell into the running WebContainer (any project on the real runtime) */}
        {termOpen && useWebContainer && (
          <div className="flex h-60 shrink-0 flex-col border-t border-forge-border bg-[#0A0B0F]">
            <div className="flex items-center justify-between border-b border-forge-border px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forge-dim">
                <TerminalIcon size={13} /> Terminal
              </span>
              <button onClick={() => setTermOpen(false)} aria-label="Close terminal" className="text-forge-dim hover:text-forge-ink">
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-2">
              <WebContainerTerminal />
            </div>
          </div>
        )}
      </div>

      {/* Autopilot — supervised build loop */}
      <Modal open={autoOpen} onClose={() => { if (!autoRunning) setAutoOpen(false); }} title="Autopilot">
        <p className="text-sm text-forge-dim">
          A supervised loop: decide the next step from your Brain, Map & roadmap → build it → run
          Check → fix → repeat. It pauses for real decisions and stops when you say so. Reviewable,
          bounded, and you can watch every step.
        </p>
        <div className="mt-3 flex items-center gap-2">
          {!autoRunning ? (
            <>
              <label className="text-xs text-forge-dim">Max steps</label>
              <input
                type="number" min={1} max={15} value={autoSteps}
                onChange={(e) => setAutoSteps(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                className="w-16 rounded-lg border border-forge-border bg-forge-panel px-2 py-1 text-sm"
              />
              <Button size="sm" onClick={startAuto}><Zap size={13} /> Start</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={stopAuto}>Stop after this step</Button>
          )}
          {autoRunning && <span className="text-xs text-forge-dim">Working…</span>}
        </div>
        {autoLog.length > 0 && (
          <ul className="mt-3 max-h-[45vh] space-y-1.5 overflow-y-auto">
            {autoLog.map((e, i) => (
              <li key={i} className="rounded-lg border border-forge-border bg-forge-panel px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    e.status === 'done' || e.status === 'finished' ? 'bg-forge-ok/20 text-forge-ok'
                    : e.status === 'error' || e.status === 'blocked' ? 'bg-forge-err/20 text-forge-err'
                    : 'bg-forge-ember/20 text-forge-ember',
                  )}>{e.status}</span>
                  <span className="text-forge-ink">{e.title}</span>
                </div>
                {e.detail && <p className="mt-0.5 text-forge-dim">{e.detail}</p>}
              </li>
            ))}
          </ul>
        )}
        {autoLog.some((e) => e.status === 'blocked') && (
          <p className="mt-2 text-[11px] text-forge-ember">Autopilot needs a decision — answer in the chat, then run again.</p>
        )}
      </Modal>

      {/* Ideation — where could this app go? */}
      <Modal open={ideasOpen} onClose={() => setIdeasOpen(false)} title="Ideas — where could this go?">
        <p className="text-sm text-forge-dim">
          Divergent directions for the app, grounded in your Brain, Map, and code — from natural
          expansions to bigger pivots. Promote any direction by adding it to the Brain.
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" loading={ideasLoading} onClick={refreshIdeas}>
            {ideasText ? 'Regenerate' : 'Generate ideas'}
          </Button>
        </div>
        <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-forge-border bg-forge-panel p-3">
          {ideasText
            ? <Markdown content={ideasText} />
            : <p className="text-sm text-forge-dim">No ideas yet — click Generate to explore directions.</p>}
        </div>
      </Modal>

      {/* Self-QA / static checks */}
      <Modal open={qaOpen} onClose={() => setQaOpen(false)} title="Self-QA — static checks">
        <p className="text-sm text-forge-dim">
          Deterministic checks over the generated code: broken imports, Node built-ins that don't
          run in the browser, packages outside the allowed set, and a missing entry file.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" loading={qaLoading} onClick={openQA}>Re-check</Button>
          {!!qaIssues?.some((i) => i.severity === 'error') && (
            <Button size="sm" onClick={fixIssues}>Fix these</Button>
          )}
        </div>
        <div className="mt-3 max-h-[50vh] overflow-y-auto">
          {qaLoading && <p className="text-sm text-forge-dim">Checking…</p>}
          {!qaLoading && qaIssues && qaIssues.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-forge-ok/40 bg-forge-raised p-3 text-sm text-forge-ok">
              <ShieldCheck size={15} /> No issues found.
            </div>
          )}
          {!qaLoading && qaIssues && qaIssues.length > 0 && (
            <ul className="space-y-1.5">
              {qaIssues.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 rounded-lg border border-forge-border bg-forge-raised p-2 text-xs">
                  {i.severity === 'error'
                    ? <CircleX size={14} className="mt-0.5 shrink-0 text-forge-err" />
                    : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-forge-warn" />}
                  <div>
                    <span className="font-mono text-forge-ink">{i.path}</span>
                    <p className="text-forge-dim">{i.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* What's-next roadmap */}
      <Modal open={roadmapOpen} onClose={() => setRoadmapOpen(false)} title="What's next">
        <p className="text-sm text-forge-dim">
          A phased, prioritized roadmap — what to build next, what to automate, and which APIs to
          add — grounded in your Brain, Map, and code. For sharpest results, set the Brain and
          generate the Map first.
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" loading={roadmapLoading} onClick={refreshRoadmap}>
            {roadmapText ? 'Regenerate' : 'Generate roadmap'}
          </Button>
        </div>
        <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-lg border border-forge-border bg-forge-panel p-3">
          {roadmapText
            ? <Markdown content={roadmapText} />
            : <p className="text-sm text-forge-dim">No roadmap yet — click Generate to get prioritized next steps.</p>}
        </div>
      </Modal>

      {/* Project Map viewer */}
      <Modal open={mapOpen} onClose={() => setMapOpen(false)} title="Project Map">
        <p className="text-sm text-forge-dim">
          An auto-generated overview of what this app contains, what's stubbed, and the gaps. The
          assistant uses this to reason about the whole project. Regenerate it after big changes.
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" loading={mapLoading} onClick={refreshMap}>
            {mapText ? 'Refresh map' : 'Generate map'}
          </Button>
        </div>
        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-forge-border bg-forge-panel p-3">
          {mapText
            ? <Markdown content={mapText} />
            : <p className="text-sm text-forge-dim">No map yet — click Generate to summarize the current app.</p>}
        </div>
      </Modal>

      {/* Project Brain editor */}
      <Modal open={brainOpen} onClose={() => setBrainOpen(false)} title="Project Brain">
        <input ref={docInputRef} type="file" accept=".txt,.md,.docx" className="hidden" onChange={handleDocUpload} />

        {viewingDoc ? (
          <div>
            <button onClick={() => setViewingDoc(null)} className="text-xs text-forge-ember hover:underline">← Back to Brain</button>
            <h3 className="mt-2 font-display text-sm font-semibold">{viewingDoc.name}</h3>
            <div className="mt-2 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-panel p-3 text-xs text-forge-ink">
              {viewingDoc.text || '(empty)'}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-forge-dim">
                The vision, goals, and decisions for this project. The assistant reads this in every
                chat — it builds, plans, and advises with your intent in mind.
              </p>
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-forge-border p-0.5">
                <button onClick={() => setBrainEdit(false)} className={cn('rounded-md px-2 py-1 text-xs', !brainEdit ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim')}>Read</button>
                <button onClick={() => setBrainEdit(true)} className={cn('rounded-md px-2 py-1 text-xs', brainEdit ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim')}>Edit</button>
              </div>
            </div>

            {brainEdit ? (
              <textarea
                value={brainText}
                onChange={(e) => setBrainText(e.target.value)}
                rows={14}
                aria-label="Project Brain"
                className="mt-3 w-full resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2 font-mono text-xs focus:border-forge-ember/60 focus:outline-none"
              />
            ) : (
              <div className="mt-3 max-h-[45vh] overflow-y-auto rounded-lg border border-forge-border bg-forge-panel p-3">
                {brainText.trim()
                  ? <Markdown content={brainText} />
                  : <p className="text-sm text-forge-dim">Empty — switch to Edit to set your North Star and goals.</p>}
              </div>
            )}

            {/* Documents — kept after upload, viewable, and distilled into the Brain */}
            <div className="mt-4 border-t border-forge-border pt-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-forge-dim">Documents</h4>
                <Button size="sm" variant="outline" loading={docBusy} onClick={() => docInputRef.current?.click()}>
                  <Upload size={12} /> {docBusy ? 'Analyzing…' : 'Upload & analyze'}
                </Button>
              </div>
              {docs.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {docs.map((d) => (
                    <li key={d.path} className="flex items-center justify-between rounded-lg border border-forge-border bg-forge-panel px-2.5 py-1.5 text-xs">
                      <span className="truncate font-mono text-forge-ink">{d.name}</span>
                      <button onClick={() => viewDoc(d)} className="ml-2 shrink-0 text-forge-ember hover:underline">View</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-forge-dim">No documents yet — upload a brief, spec, or research doc (.txt, .md, .docx). It's kept here and distilled into the Brain.</p>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBrainOpen(false)}>Cancel</Button>
              <Button loading={brainSaving} onClick={handleSaveBrain}>Save Brain</Button>
            </div>
          </>
        )}
      </Modal>

      {/* Connect Supabase — stores the project's backend credentials in /.env */}
      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect Supabase">
        <div className="mb-3 rounded-lg border border-forge-ember/40 bg-forge-ember/10 p-3">
          <p className="text-xs text-forge-ink">
            <b>One-click setup.</b> {isProviderConnected('supabase')
              ? 'FableForge creates a dedicated database for this app in your connected Supabase org, wires it up, and applies the schema — automatically.'
              : 'FableForge Cloud creates and manages a database for this app automatically — no Supabase account needed. (Or connect your own Supabase in Settings → Connections to own it.)'}
          </p>
          <Button size="sm" className="mt-2" loading={provisioning} onClick={provisionDatabase}>
            <Database size={13} /> Set up database
          </Button>
        </div>
        <p className="text-sm text-forge-dim">
          Paste your Supabase project's URL and anon key (Supabase → Project Settings → API). They're
          saved to this project's <span className="font-mono">.env</span>, so the live preview and the
          generated app's data layer talk to your real backend. The anon key is safe to store here.
        </p>
        <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel p-3">
          {files.some((f) => f.path === '/supabase/migrations/0001_init.sql') ? (
            <p className="text-xs text-forge-dim">
              Migration ready at{' '}
              <span className="font-mono text-forge-ink">/supabase/migrations/0001_init.sql</span> — run it in
              your Supabase SQL editor to create the tables, RLS policies, and auth trigger, then connect below.
            </p>
          ) : (
            <p className="text-xs text-forge-dim">
              No backend yet. Generate one from this app's code — FableForge infers the data model and writes a
              Supabase migration (tables + RLS + auth) plus a typed client.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={sbGenerating} onClick={handleGenerateBackend}>
              <Database size={13} />
              {files.some((f) => f.path === '/supabase/migrations/0001_init.sql') ? 'Regenerate from code' : 'Generate backend from this app'}
            </Button>
            {files.some((f) => f.path === '/supabase/migrations/0001_init.sql') && (
              <>
                <Button size="sm" loading={sbApplying} onClick={autoApply}>
                  <Rocket size={13} /> Apply to Supabase
                </Button>
                <Button size="sm" variant="outline" onClick={copySqlAndOpen}>Copy SQL & open editor</Button>
              </>
            )}
          </div>
          {files.some((f) => f.path === '/supabase/migrations/0001_init.sql') && (
            <p className="mt-2 text-[11px] text-forge-dim">
              <b>Apply to Supabase</b> populates your database automatically (enter the project URL above first).
              It needs the one-time server function — deploy it once:{' '}
              <span className="font-mono">supabase functions deploy apply-migration</span> then{' '}
              <span className="font-mono">supabase secrets set SB_MANAGEMENT_TOKEN=&lt;your token&gt;</span>.
              No setup? Use <b>Copy SQL & open editor</b> and paste + Run.
            </p>
          )}
        </div>
        <label className="mt-3 block text-xs text-forge-dim">
          Project URL
          <Input className="mt-1" placeholder="https://xxxxxxxx.supabase.co" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} />
        </label>
        <label className="mt-2 block text-xs text-forge-dim">
          Anon key
          <Input className="mt-1" type="password" placeholder="eyJhbGci…" value={sbKey} onChange={(e) => setSbKey(e.target.value)} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConnectOpen(false)}>Cancel</Button>
          <Button loading={sbSaving} onClick={saveConnection}>Save connection</Button>
        </div>
      </Modal>

      {/* Project-wide code search (⌘/Ctrl+K) */}
      {searchOpen && <SearchPanel files={files} onOpen={(p) => { open(p); setSearchOpen(false); }} onClose={() => setSearchOpen(false)} />}

      {/* In-app database viewer (Lovable-Cloud-style) */}
      {dataOpen && <DataPanel projectId={id!} onClose={() => setDataOpen(false)} />}

      {/* Secrets — the API keys this app's server-side edge functions need (Phase 6 secret popup). */}
      <Modal open={secretsOpen} onClose={() => setSecretsOpen(false)} title="API keys & secrets">
        <p className="text-sm text-forge-dim">
          This app calls external services from secure server-side edge functions. Add the keys below —
          they stay out of the app bundle and are used only by the functions.
        </p>

        {/* Backend Map — the server-side system at a glance, so big ideas stay legible. */}
        {backendIntegrations.length > 0 && (
          <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-forge-dim"><Server size={11} /> Backend map</div>
            <div className="space-y-1.5">
              {backendIntegrations.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="font-medium text-forge-ink">{it.service || 'service'}</span>
                  {(it.edgeFunctions ?? []).map((fn, j) => (
                    <span key={j} className="rounded bg-forge-raised px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">ƒ {fn.name}</span>
                  ))}
                  {it.needsWebhook && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">webhook</span>}
                  {it.needsCron && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">cron</span>}
                  {it.purpose && <span className="w-full text-[10px] text-forge-dim/80">{it.purpose}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {reqSecrets.length === 0 ? (
          <p className="mt-3 text-xs text-forge-dim">No integrations need keys yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {reqSecrets.map((s) => {
              const isSet = !!secretValues[s.env]?.trim() || deployedSecrets.includes(s.env);
              const draft = secretDrafts[s.env] ?? '';
              const url = SECRET_HINT[s.env]?.url;
              return (
                <div key={s.env} className="rounded-lg border border-forge-border bg-forge-panel p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-forge-ink">{s.env}</span>
                    {isSet && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><Check size={11} /> set</span>}
                    {url && <a href={url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">Get key <ExternalLink size={10} /></a>}
                  </div>
                  {(s.service || s.purpose) && <p className="mt-0.5 text-[11px] text-forge-dim">{[s.service, s.purpose].filter(Boolean).join(' — ')}</p>}
                  <div className="mt-2 flex gap-2">
                    <Input type="password" placeholder={isSet ? '•••••••• saved — paste to replace' : 'Paste the key'} value={draft} onChange={(e) => setSecretDrafts((d) => ({ ...d, [s.env]: e.target.value }))} />
                    <Button size="sm" variant="outline" disabled={!draft.trim()} onClick={() => { setSecret(s.env, draft); setSecretDrafts((d) => ({ ...d, [s.env]: '' })); toast('success', `${s.env} saved`); }}>Save</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-forge-dim">
          Kept out of the app bundle. <b>Deploy backend</b> pushes these to Supabase Function Secrets and
          deploys the edge functions to your connected project, so the integrations go live. Until then
          (or in preview) those features show a "connect to enable" state. Needs Supabase connected (the
          Database button) and the one-time <span className="font-mono">deploy-backend</span> function.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          {edgeFunctions().length > 0 && (
            <Button loading={sbDeploying} onClick={deployBackend}>
              <Rocket size={13} /> Deploy backend
            </Button>
          )}
          <Button variant="outline" onClick={() => setSecretsOpen(false)}>Done</Button>
        </div>
      </Modal>

      {/* review-before-write diff approval */}
      <DiffModal
        pending={pendingEdit}
        applying={applyingPending}
        onApply={() => void handleApplyPending()}
        onDiscard={() => { setPendingEdit(null); toast('info', 'Discarded — nothing was written.'); }}
      />

      {/* deploy modal */}
      <ThemeModal
        projectId={id ?? ''}
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        onApplied={() => void refreshFiles()}
        onConvert={setupTheme}
        onPolish={polishDesign}
      />

      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Your app's cloud">
        {/* DATABASE — the most-asked "where do I set this up" — front and center. */}
        <div className="rounded-lg border border-forge-border bg-forge-panel p-3">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-forge-ember" />
            <span className="text-sm font-medium text-forge-ink">Database</span>
            {hasDb
              ? <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400"><Check size={11} /> connected</span>
              : <span className="ml-auto text-[11px] text-forge-dim">not set up</span>}
          </div>
          <p className="mt-1 text-[11px] text-forge-dim">
            {hasDb ? 'This app has a live database. View or query it any time.'
              : 'Create a database for this app — one click. FableForge Cloud sets one up automatically (or uses your connected Supabase).'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" loading={provisioning} onClick={provisionDatabase}>
              <Database size={13} /> {hasDb ? 'Re-run setup' : 'Set up database'}
            </Button>
            {hasDb && (
              <Button size="sm" variant="outline" onClick={() => { setDeployOpen(false); setDataOpen(true); }}>
                <Table2 size={13} /> View data
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 mb-1 text-sm font-medium text-forge-ink">Ship it</div>
        <p className="text-[11px] text-forge-dim">
          <b>Publish to the web</b> builds the app and deploys a live https URL. <b>Export to GitHub</b> pushes it to a repo.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button loading={deploying} onClick={publishSite}>
            <Rocket size={14} /> Publish to the web
          </Button>
          <Button variant="outline" loading={deploying} onClick={exportGitHub}>
            <Github size={14} /> Export to GitHub
          </Button>
        </div>
        <label className="mt-3 block text-[11px] text-forge-dim">
          <span className="inline-flex items-center gap-1"><Globe size={11} /> Netlify token — connect your own hosting (optional)</span>
          <Input className="mt-1" type="password" placeholder="nfp_… (stored locally; app.netlify.com → User settings → Applications)"
            value={netlifyToken}
            onChange={(e) => { setNetlifyToken(e.target.value); try { localStorage.setItem('ff:netlify-token', e.target.value.trim()); } catch { /* ignore */ } }} />
        </label>
        <label className="mt-2 block text-[11px] text-forge-dim">
          <span className="inline-flex items-center gap-1"><Github size={11} /> GitHub token (repo scope) — connect your own account</span>
          <Input className="mt-1" type="password" placeholder="ghp_… (stored locally; create one at github.com/settings/tokens)"
            value={githubToken}
            onChange={(e) => { setGithubToken(e.target.value); try { localStorage.setItem('ff:gh-token', e.target.value.trim()); } catch { /* ignore */ } }} />
        </label>
        <p className="mt-4 text-[11px] text-forge-dim">Or just record a deployment to track elsewhere:</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(['vercel', 'netlify', 'supabase'] as const).map((t) => (
            <Button key={t} size="sm" variant="outline" loading={deploying} onClick={() => recordDeployment(t)} className="capitalize">
              {t}
            </Button>
          ))}
        </div>
        {deployments.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {deployments.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-forge-border px-3 py-2 text-xs">
                <Globe size={13} className="text-forge-dim" />
                <span className="capitalize">{d.target}</span>
                <Badge tone={d.status === 'live' ? 'ok' : d.status === 'failed' ? 'err' : 'warn'}>{d.status}</Badge>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="ml-auto text-forge-ember hover:underline">Open</a>}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </AppShell>
  );
}
