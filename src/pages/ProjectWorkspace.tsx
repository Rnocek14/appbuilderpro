import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Code2, MessageSquare, Rocket, Globe } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { FileTree } from '../components/editor/FileTree';
import { CodeEditorPane } from '../components/editor/CodeEditorPane';
import { PreviewPane } from '../components/editor/PreviewPane';
import { ChatPanel } from '../components/chat/ChatPanel';
import { useProjectFiles, useGenerations, useChatMessages } from '../hooks/useProjectData';
import { sendEdit, startGeneration, type EditEvent } from '../lib/aiClient';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Modal } from '../components/ui';
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

  // Approve the proposed plan: clear it and send a follow-up that the model
  // recognizes as approval, which routes it straight to an edit that implements the plan.
  const approvePlan = () => {
    setPendingPlan(null);
    void handleSend('Approved — go ahead and implement this plan now, exactly as described.');
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

  const handleSend = async (message: string, previewError?: string) => {
    if (!id || busy) return;
    setBusy(true);
    setTab('chat');
    setAskOptions([]); // clear any stale quick-replies from a prior question
    setPendingPlan(null); // clear any prior plan once a new turn starts
    try {
      if (files.length === 0) {
        await startGeneration(id, message);
        toast('info', 'Generation started — watch the forge.');
      } else {
        const result = await sendEdit(id, message, previewError, onStreamEvent);
        if (result.action === 'ask') {
          setAskOptions(result.options ?? []);
        } else if (result.action === 'plan') {
          if (result.plan) setPendingPlan(result.plan);
        } else {
          toast('success', `Updated ${result.changed.length} file${result.changed.length === 1 ? '' : 's'}.`);
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
                files={files}
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
              <ChatPanel messages={messages} activeGeneration={activeGeneration} busy={busy} askOptions={askOptions} plan={pendingPlan} onApprovePlan={approvePlan} stream={stream} onSend={(m) => handleSend(m)} />
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
