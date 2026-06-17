import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Code2, MessageSquare, Rocket, Globe, Brain, Map, Upload, Compass, ShieldCheck, CircleX, TriangleAlert } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { FileTree } from '../components/editor/FileTree';
import { CodeEditorPane } from '../components/editor/CodeEditorPane';
import { PreviewPane } from '../components/editor/PreviewPane';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useProjectFiles, useGenerations, useChatMessages } from '../hooks/useProjectData';
import { sendEdit, startGeneration, researchAnswer, generateProjectMap, generateRoadmap, analyzeDocument, type EditEvent } from '../lib/aiClient';
import { extractText } from '../lib/docExtract';
import { runQA, issuesToFixRequest, type QAIssue } from '../lib/projectQA';
import { Markdown } from '../components/Markdown';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Modal } from '../components/ui';
import { getBrain, saveBrain, getMap, getRoadmap, saveDoc, listDocs, getDoc, DEFAULT_BRAIN, isMetaFile, type BrainDoc } from '../lib/projectBrain';
import { cn } from '../lib/utils';
import type { Project, Deployment, EditPlan } from '../types';

type MiddleTab = 'chat' | 'code';

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { session, refreshProfile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const { files, saveFile, createFile, renameFile, deleteFile, getVersions, refresh: refreshFiles } = useProjectFiles(id);
  const { active: activeGeneration, refresh: refreshGens } = useGenerations(id);
  const { messages } = useChatMessages(id);

  const [tab, setTab] = useState<MiddleTab>('chat');
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  // Unsaved editor edits, keyed by path. These drive the live preview immediately
  // (preview-only); Save is what persists them to the database.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);
  // Quick-reply chips offered when the assistant asks a clarifying question.
  const [askOptions, setAskOptions] = useState<string[]>([]);
  // A plan the assistant proposed (plan mode) awaiting the user's approval.
  const [pendingPlan, setPendingPlan] = useState<EditPlan | null>(null);
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
  // Live edit progress while the assistant streams its response.
  const [stream, setStream] = useState<{ explanation: string; files: { path: string; done: boolean }[] } | null>(null);

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

  const onStreamEvent = useCallback((e: EditEvent) => {
    switch (e.type) {
      case 'start': setStream({ explanation: '', files: [] }); break;
      case 'explanation':
      case 'question': setStream((s) => ({ explanation: e.text, files: s?.files ?? [] })); break;
      case 'file-start': setStream((s) => {
        const files = s?.files ?? [];
        if (files.some((f) => f.path === e.path)) return s;
        return { explanation: s?.explanation ?? '', files: [...files, { path: e.path, done: false }] };
      }); break;
      case 'file-done': setStream((s) => s && ({ ...s, files: s.files.map((f) => f.path === e.path ? { ...f, done: true } : f) })); break;
      case 'done': setStream(null); break;
    }
  }, []);

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

  const handleSend = async (message: string, previewError?: string, planFirst?: boolean, research?: boolean) => {
    if (!id || busy) return;
    setBusy(true);
    setTab('chat');
    setAskOptions([]); // clear any stale quick-replies from a prior question
    setPendingPlan(null); // clear any prior plan once a new turn starts
    try {
      if (research) {
        // Web-research answer (live search) — conversational, never touches files.
        await researchAnswer(id, message, onStreamEvent);
      } else if (files.length === 0) {
        await startGeneration(id, message);
        toast('info', 'Generation started — watch the forge.');
      } else {
        const result = await sendEdit(id, message, previewError, onStreamEvent, planFirst);
        if (result.action === 'ask') {
          setAskOptions(result.options ?? []);
        } else if (result.action === 'plan') {
          if (result.plan) setPendingPlan(result.plan);
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
          if (result.changed.length) {
            const issues = await runQA(id);
            const errs = issues.filter((i) => i.severity === 'error');
            if (errs.length) {
              setQaIssues(issues);
              toast('error', `Self-QA found ${errs.length} issue${errs.length === 1 ? '' : 's'} — open Check to review/fix.`);
            }
          }
        }
      }
      await refreshGens();
      await refreshProfile();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
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
            <Button size="sm" variant="outline" onClick={openBrain}>
              <Brain size={13} /> Brain
            </Button>
            <Button size="sm" variant="outline" onClick={openMap}>
              <Map size={13} /> Map
            </Button>
            <Button size="sm" variant="outline" onClick={openRoadmap}>
              <Compass size={13} /> Next
            </Button>
            <Button size="sm" variant="outline" onClick={openQA}>
              <ShieldCheck size={13} /> Check
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeployOpen(true)}>
              <Rocket size={13} /> Deploy
            </Button>
          </div>
        </div>

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

          <div className={cn('min-w-0 border-r border-forge-border', tab === 'chat' ? 'w-full md:w-[380px] md:shrink-0' : 'flex-1')}>
            {tab === 'chat' ? (
              <ChatPanel messages={messages} activeGeneration={activeGeneration} busy={busy} askOptions={askOptions} plan={pendingPlan} onApprovePlan={approvePlan} stream={stream} onSend={(m, opts) => handleSend(m, undefined, opts?.planFirst, opts?.research)} />
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

          <div className={cn('min-w-0 flex-1', tab === 'code' ? 'hidden lg:block lg:w-[420px] lg:flex-none' : 'hidden md:block')}>
            <PreviewPane files={liveFiles} onFixError={(err) => handleSend('Fix the preview error', err)} />
          </div>
        </div>
      </div>

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

      {/* deploy modal */}
      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Deploy this app">
        <p className="text-sm text-forge-dim">
          Pick a target. FableForge records the deployment and tracks its status; connect a deploy hook
          to push live builds automatically.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['vercel', 'netlify', 'supabase'] as const).map((t) => (
            <Button key={t} variant="outline" loading={deploying} onClick={() => recordDeployment(t)} className="capitalize">
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
