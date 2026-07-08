import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Send, Flame, FileCode2, CircleCheck, CircleDashed, CircleX, ClipboardList, Globe, Camera, X, Brain, Undo2, Eye, Paperclip, Square, Copy, RefreshCw, Link2, Image as ImageIcon } from 'lucide-react';
import { extractUrls, fetchLinks, withLinkContext, splitLinkContext, hostOf, LINK_CONTEXT_MARKER } from '../../lib/linkContext';
import { MousePointerClick, ChevronDown } from 'lucide-react';
import { diffLines } from 'diff';
import type { SelectedElement } from '../editor/PreviewPane';
import type { AIMessage, Generation, EditPlan } from '../../types';
import { cn } from '../../lib/utils';
import { Button, Ember } from '../ui';
import { PlanCard } from '../PlanCard';
import { Markdown } from '../Markdown';
import { ModelPicker } from '../ModelPicker';
import { RememberModal } from '../RememberModal';
import { ThreadSwitcher } from './ThreadSwitcher';
import type { Thread } from '../../lib/threads';
import { captureScreenshot } from '../../lib/previewRuntime';
import { costForMessage, subscribeUsage, formatUSD } from '../../lib/usage';

/** Tiny estimated-cost tag shown in the corner of an assistant message. */
function CostTag({ messageId }: { messageId: string }) {
  const cost = useSyncExternalStore(subscribeUsage, () => costForMessage(messageId));
  if (cost == null) return null;
  return (
    <span title="Estimated cost of this response (tokens × model price)" className="font-mono text-[10px] text-forge-dim/70">
      ~{formatUSD(cost)}
    </span>
  );
}

const QUICK_ACTIONS = [
  'Add a dashboard',
  'Make this mobile friendly',
  'Improve the UI',
  'Add an admin role',
  'Connect this to Supabase',
  'Add Stripe billing',
];

const STAGE_LABELS: Record<string, string> = {
  interpret: 'Reading your prompt',
  blueprint: 'Drafting the blueprint',
  schema: 'Planning the database',
  file_tree: 'Laying out files',
  frontend: 'Building the frontend',
  backend: 'Wiring the logic',
  auth_logic: 'Adding auth rules',
  styling: 'Polishing styles',
  validate: 'Checking output',
  fix: 'Fixing issues',
  summarize: 'Writing the summary',
};

interface StreamState { explanation: string; files: { path: string; done: boolean }[]; activity?: string[] }

type FileChange = NonNullable<AIMessage['changes']>[number];

/** One changed file: collapsed diffstat row → expandable unified diff (computed only on expand). */
function FileDiffRow({ c }: { c: FileChange }) {
  const [open, setOpen] = useState(false);
  const big = c.additions + c.deletions > 400;
  return (
    <div className="min-w-0 rounded-md border border-forge-border bg-forge-panel/50">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2 py-1 text-left" aria-expanded={open}>
        <FileCode2 size={10} className="shrink-0 text-forge-dim" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-forge-ink">{c.path}</span>
        {c.additions > 0 && <span className="font-mono text-[10px] text-forge-ok">+{c.additions}</span>}
        {c.deletions > 0 && <span className="font-mono text-[10px] text-forge-err">−{c.deletions}</span>}
        <ChevronDown size={10} className={cn('shrink-0 text-forge-dim transition-transform', open && 'rotate-180')} />
      </button>
      {open && (big ? (
        <p className="border-t border-forge-border px-2 py-1.5 text-[10px] text-forge-dim">Large change — open the file in the editor to review it comfortably.</p>
      ) : (
        <pre className="max-h-64 overflow-auto panel-scroll border-t border-forge-border p-2 font-mono text-[10px] leading-relaxed">
          {diffLines(c.before, c.after).map((p, i) => {
            const raw = p.value.endsWith('\n') ? p.value.slice(0, -1) : p.value;
            let lines = raw.split('\n');
            if (!p.added && !p.removed && lines.length > 6) lines = [...lines.slice(0, 2), '  ⋯', ...lines.slice(-2)];
            const prefix = p.added ? '+ ' : p.removed ? '− ' : '  ';
            return (
              <span key={i} className={cn('block whitespace-pre-wrap', p.added ? 'bg-forge-ok/10 text-forge-ok' : p.removed ? 'bg-forge-err/10 text-forge-err' : 'text-forge-dim/70')}>
                {lines.map((l) => (l === '  ⋯' ? l : prefix + l)).join('\n')}
              </span>
            );
          })}
        </pre>
      ))}
    </div>
  );
}

/** Compact relative timestamp ("just now", "4m", "2h", then a date). */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "42s" / "2m 05s" — durations shown while (and after) the forge works. */
function fmtDur(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Live elapsed seconds since an ISO timestamp — ticks once a second while mounted. */
function useElapsedSec(startIso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startIso) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startIso]);
  if (!startIso) return null;
  return Math.max(0, (now - new Date(startIso).getTime()) / 1000);
}

/** Completed-stage duration ("12s"), from the stage entry's own timestamps. */
function stageDur(e: { started_at: string; finished_at?: string }): string | null {
  if (!e.finished_at) return null;
  const s = (new Date(e.finished_at).getTime() - new Date(e.started_at).getTime()) / 1000;
  return s >= 1 ? fmtDur(s) : null;
}

interface Props {
  projectId: string;
  messages: AIMessage[];
  activeGeneration: Generation | null;
  /** Most recent generation regardless of status — drives the "forged in Xs" / failure notes. */
  lastGeneration?: Generation | null;
  busy: boolean;
  /** Conversation threads + controls (shown in the header in place of "Assistant"). */
  threads: Thread[];
  activeThreadId: string;
  /** False when the thread_id DB migration hasn't been applied (threads can't fully separate yet). */
  threadsReady: boolean;
  onSwitchThread: (id: string) => void;
  onNewThread: () => void;
  onRenameThread: (id: string, title: string) => void;
  onDeleteThread: (id: string) => void;
  /** Quick-reply chips for a clarifying question the assistant just asked. */
  askOptions?: string[];
  /** A plan the assistant proposed (plan mode), awaiting approval. */
  plan?: EditPlan | null;
  /** Approve the pending plan — triggers the build. */
  onApprovePlan?: () => void;
  /** Live progress while the assistant streams an edit. */
  stream?: StreamState | null;
  onSend: (message: string, opts?: { planFirst?: boolean; research?: boolean; image?: string; reviewEdits?: boolean }) => void;
  /** Cancel the in-flight turn (Stop button / Esc). */
  onStop?: () => void;
  /** Initial state of the "Plan first" toggle — defaulted ON for imported/real projects. */
  defaultPlanFirst?: boolean;
  /** Initial state of the "Review" (diff-before-write) toggle — defaulted ON for imported/real projects. */
  defaultReviewEdits?: boolean;
  /** Restore every file a prior edit changed to its pre-edit version (atomic change-set undo). */
  onRevert?: (paths: string[]) => void;
  /** Element picked via the preview's Select mode — attached to the next message as precise context. */
  selection?: SelectedElement | null;
  onClearSelection?: () => void;
  /** Open the project asset library (upload / harvest images that builds will use). */
  onOpenAssets?: () => void;
}

/** Signature element: the forging strip — stages heat up as the agent works, each with its time. */
function ForgeProgress({ gen }: { gen: Generation }) {
  const stages = gen.stages ?? [];
  const elapsed = useElapsedSec(gen.created_at);
  const running = stages.find((s) => s.status === 'running');
  const runningFor = useElapsedSec(running?.started_at ?? null);
  return (
    <div className="rounded-xl border border-forge-ember/30 bg-forge-raised p-3 shadow-ember">
      <div className="flex items-center gap-2">
        <Ember size={15} />
        <span className="font-display text-sm font-medium">Forging your app</span>
        <span className="ml-auto font-mono text-[11px] text-forge-dim" title="Elapsed · stages done">
          {elapsed != null && `${fmtDur(elapsed)} · `}{stages.filter((s) => s.status === 'done').length}/{Object.keys(STAGE_LABELS).length}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {Object.entries(STAGE_LABELS).map(([key, label]) => {
          const entry = stages.find((s) => s.stage === key);
          const state = entry?.status === 'done' ? 'done' : entry ? 'running' : 'pending';
          const time = entry?.status === 'done' ? stageDur(entry) : state === 'running' && runningFor != null && runningFor >= 3 ? fmtDur(runningFor) : null;
          return (
            <li key={key} className="flex items-center gap-2 text-xs">
              {state === 'done' && <CircleCheck size={13} className="text-forge-ok" />}
              {state === 'running' && <Ember size={13} />}
              {state === 'pending' && <CircleDashed size={13} className="text-forge-border" />}
              <span className={cn(state === 'pending' ? 'text-forge-dim/60' : 'text-forge-ink')}>{label}</span>
              <span className="ml-auto flex min-w-0 items-center gap-1.5">
                {entry?.note && <span className="truncate text-[10px] text-forge-dim">{entry.note}</span>}
                {time && <span className={cn('shrink-0 font-mono text-[10px]', state === 'running' ? 'text-forge-ember/80' : 'text-forge-dim/60')}>{time}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {elapsed != null && elapsed > 75 && (
        <p className="mt-2 border-t border-forge-border pt-2 text-[10px] text-forge-dim/70">
          Full builds usually take a few minutes — every stage that finishes is already saved, so nothing is lost if you step away.
        </p>
      )}
    </div>
  );
}

export function ChatPanel({ projectId, messages, activeGeneration, lastGeneration = null, busy, threads, activeThreadId, threadsReady, onSwitchThread, onNewThread, onRenameThread, onDeleteThread, askOptions = [], plan = null, onApprovePlan, stream = null, onSend, onStop, defaultPlanFirst = false, defaultReviewEdits = false, onRevert, selection = null, onClearSelection, onOpenAssets }: Props) {
  const [input, setInput] = useState('');
  // The "Remember a preference" panel + a seed taken from the most recent user message, so
  // correcting something then clicking Remember pre-fills what you just said.
  const [rememberOpen, setRememberOpen] = useState(false);
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  // When on, the next message is planned (proposed for approval) before any code is written.
  const [planFirst, setPlanFirst] = useState(defaultPlanFirst);
  const [reviewEdits, setReviewEdits] = useState(defaultReviewEdits);
  // When on, the next message is answered with live web research (no code).
  const [research, setResearch] = useState(false);
  // A screenshot of the current preview, attached to the next message so the model can see it.
  const [shot, setShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  // Whether the coding-model picker popover is open.
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // When the current turn started — drives the elapsed timers on the working indicators.
  const [busyStart, setBusyStart] = useState<string | null>(null);
  useEffect(() => { setBusyStart(busy ? new Date().toISOString() : null); }, [busy]);
  const busyFor = useElapsedSec(busyStart);
  // Whether the message list is scrolled near the bottom — gates auto-scroll so reading back isn't fought.
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyMessage = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  };
  // Regenerate an assistant reply by re-sending the user message that prompted it.
  const regenerate = (assistantId: string) => {
    if (busy) return;
    const idx = messages.findIndex((x) => x.id === assistantId);
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { onSend(messages[i].content, { planFirst, research, reviewEdits }); return; }
    }
  };

  const capture = async () => {
    if (shooting) return;
    setShooting(true);
    const img = await captureScreenshot();
    setShooting(false);
    setShot(img); // null if the preview isn't running/ready — the button hint reflects that
  };

  // Attach files from disk: images ride the same vision pipeline as screenshots; text files
  // (code, markdown, CSV…) get pasted into the prompt as a fenced block so the model can read them.
  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        setShot(dataUrl); // one image at a time — last attached wins (matches the vision pipeline)
      } else {
        const text = await file.text();
        const clipped = text.length > 20000 ? text.slice(0, 20000) + '\n…(truncated)' : text;
        setInput((prev) => `${prev ? prev + '\n\n' : ''}\`\`\`${file.name}\n${clipped}\n\`\`\`\n`);
      }
    }
  };

  // Auto-scroll to newest content ONLY when already near the bottom, so scrolling up to re-read
  // isn't yanked back on every streamed token. A pill offers a manual jump when there's more below.
  // Opening a project/thread JUMPS to the latest message instantly — never the slow scroll-from-
  // the-top animation over the whole history.
  const prevCount = useRef(0);
  useEffect(() => { prevCount.current = 0; }, [projectId, activeThreadId]);
  useEffect(() => {
    const initialLoad = prevCount.current === 0 && messages.length > 0;
    prevCount.current = messages.length;
    if (initialLoad) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeGeneration?.current_stage, stream?.explanation, stream?.files.length, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };
  const scrollToBottom = () => { setAtBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  // Message QUEUE: typing stays enabled while the agent works; Enter queues the message and it
  // auto-sends when the current turn finishes (the Lovable/Cursor pattern users expect).
  const [queue, setQueue] = useState<string[]>([]);
  const draining = useRef(false);
  useEffect(() => {
    if (busy) { draining.current = false; return; }
    if (queue.length && !draining.current) {
      draining.current = true;
      const [next, ...rest] = queue;
      setQueue(rest);
      void sendWithLinks(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, queue.length]);

  // Pasted LINKS become real context: fetch each page server-side and ride it along with the
  // message (marked block, hidden in the rendered bubble) so the model reads the actual content.
  const [readingLinks, setReadingLinks] = useState(false);
  const pendingUrls = extractUrls(input);

  const sendWithLinks = async (text: string, image?: string) => {
    const urls = extractUrls(text);
    let message = text;
    if (urls.length) {
      setReadingLinks(true);
      try { message = withLinkContext(text, await fetchLinks(urls)); }
      catch { /* best-effort — send the plain text if fetching fails */ }
      setReadingLinks(false);
    }
    // A picked element rides along as precise context (hidden in the bubble, same as link context).
    if (selection) {
      const block = [
        `--- Selected element (<${selection.tag}> at ${selection.loc}) ---`,
        selection.count > 1 ? `Renders ${selection.count} instances (one JSX in a list/map) — editing it changes all of them.` : '',
        `classes: ${selection.className || '(none)'}`,
        `text: ${selection.text || '(empty)'}`,
        `The user's request refers to THIS element — edit it at its source location.`,
      ].filter(Boolean).join('\n');
      message = message.includes(LINK_CONTEXT_MARKER)
        ? `${message}\n\n${block}`
        : `${message}\n\n${LINK_CONTEXT_MARKER}\n${block}`;
      onClearSelection?.();
    }
    onSend(message, { planFirst, research, reviewEdits, image });
  };

  const submit = () => {
    const text = input.trim();
    if (!text || readingLinks) return;
    if (busy) { setQueue((q) => [...q, text]); setInput(''); return; }
    void sendWithLinks(text, shot ?? undefined);
    setInput('');
    setShot(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-forge-border px-2 py-1.5">
        <Flame size={14} className="shrink-0 text-forge-ember" />
        <ThreadSwitcher
          threads={threads}
          activeId={activeThreadId}
          ready={threadsReady}
          onSwitch={onSwitchThread}
          onNew={onNewThread}
          onRename={onRenameThread}
          onDelete={onDeleteThread}
        />
      </div>

      <div className="relative flex-1 overflow-hidden">
      <div ref={scrollRef} onScroll={onScroll} className="h-full space-y-3 overflow-y-auto panel-scroll p-3">
        {messages.length === 0 && !activeGeneration && (
          <div className="rounded-xl border border-dashed border-forge-border p-5 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-forge-ember/10">
              <Flame size={18} className="text-forge-ember" />
            </div>
            <p className="font-display text-sm font-medium text-forge-ink">What should we build?</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-forge-dim">
              Describe a change and I’ll read the code, research anything I’m unsure about, edit, and type-check my work before handing it back.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {QUICK_ACTIONS.slice(0, 4).map((a) => (
                <button
                  key={a}
                  onClick={() => onSend(a, { planFirst, research, reviewEdits })}
                  className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex animate-fadeInUp [animation-duration:0.3s]', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'group min-w-0 rounded-xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'max-w-[90%] bg-ember-gradient text-[#1A0E04] shadow-soft'
                  : 'w-full bg-forge-raised border border-forge-border',
              )}
            >
              {m.role === 'user'
                ? (() => {
                    const { visible, linkCount } = splitLinkContext(m.content);
                    return (
                      <>
                        <p className="whitespace-pre-wrap">{visible}</p>
                        {linkCount > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-medium" title="Context attached to this message (fetched pages / selected elements)">
                            <Link2 size={10} /> {linkCount} context item{linkCount > 1 ? 's' : ''} attached
                          </span>
                        )}
                      </>
                    );
                  })()
                : <Markdown content={m.content} />}
              {(m.changes?.length ?? 0) > 0 ? (
                <div className="mt-2 space-y-1">
                  {m.changes!.map((c) => <FileDiffRow key={c.path} c={c} />)}
                  {onRevert && (
                    <button
                      onClick={() => onRevert(m.files_changed)}
                      title="Restore every file this change touched to its previous version"
                      className="inline-flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink"
                    >
                      <Undo2 size={10} /> Revert this change
                    </button>
                  )}
                </div>
              ) : m.files_changed?.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {m.files_changed.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">
                      <FileCode2 size={10} /> {f}
                    </span>
                  ))}
                  {onRevert && (
                    <button
                      onClick={() => onRevert(m.files_changed)}
                      title="Restore every file this change touched to its previous version"
                      className="inline-flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink"
                    >
                      <Undo2 size={10} /> Revert this change
                    </button>
                  )}
                </div>
              )}
              {m.role === 'assistant' && (
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => copyMessage(m.id, m.content)} title="Copy message" aria-label="Copy message" className="rounded p-1 text-forge-dim hover:bg-forge-panel hover:text-forge-ink">
                      {copiedId === m.id ? <CircleCheck size={12} className="text-forge-ok" /> : <Copy size={12} />}
                    </button>
                    <button type="button" onClick={() => regenerate(m.id)} disabled={busy} title="Regenerate this reply" aria-label="Regenerate" className="rounded p-1 text-forge-dim hover:bg-forge-panel hover:text-forge-ink disabled:opacity-40">
                      <RefreshCw size={12} />
                    </button>
                  </div>
                  <span title={new Date(m.created_at).toLocaleString()} className="text-[10px] text-forge-dim/60">{relTime(m.created_at)}</span>
                  <CostTag messageId={m.id} />
                </div>
              )}
            </div>
          </div>
        ))}

        {activeGeneration && (activeGeneration.status === 'running' || activeGeneration.status === 'queued') && (
          <ForgeProgress gen={activeGeneration} />
        )}
        {busy && !activeGeneration && !stream && (
          <div className="flex items-center gap-2 rounded-xl border border-forge-border bg-forge-raised px-3 py-2 text-xs text-forge-dim">
            <Ember size={14} />
            <span>
              {busyFor != null && busyFor > 30
                ? 'Still at it — bigger requests take a little longer…'
                : busyFor != null && busyFor > 10
                  ? 'Reading the project and working out the change…'
                  : 'Thinking through your request…'}
            </span>
            {busyFor != null && busyFor >= 3 && <span className="ml-auto font-mono text-[11px] text-forge-dim/70">{fmtDur(busyFor)}</span>}
          </div>
        )}
        {stream && (
          <div className="rounded-xl border border-forge-ember/30 bg-forge-raised p-3 shadow-ember">
            <div className="flex items-center gap-2">
              <Ember size={15} />
              <span className="font-display text-sm font-medium">Working on it</span>
              <span className="ml-auto font-mono text-[11px] text-forge-dim" title="Elapsed · files written">
                {busyFor != null && busyFor >= 3 && fmtDur(busyFor)}
                {stream.files.length > 0 && ` · ${stream.files.filter((f) => f.done).length}/${stream.files.length} files`}
              </span>
            </div>
            {stream.explanation && (
              <Markdown content={stream.explanation} className="mt-1.5 text-forge-dim" />
            )}
            {!!stream.activity?.length && (
              <div className="mt-1.5 space-y-0.5">
                {stream.activity.length > 3 && (
                  <p className="text-[10px] text-forge-dim/50">… {stream.activity.length - 3} earlier steps</p>
                )}
                {stream.activity.slice(-3).map((a, i, arr) => (
                  <p key={`${a}-${i}`} className={cn('flex items-center gap-1.5 font-mono text-[11px]', i === arr.length - 1 ? 'text-forge-ink' : 'text-forge-dim/60')}>
                    {i === arr.length - 1 ? <CircleDashed size={11} className="animate-spin text-forge-ember" /> : <CircleCheck size={11} className="text-forge-ok/60" />}
                    {a}
                  </p>
                ))}
              </div>
            )}
            {stream.files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {stream.files.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 text-xs">
                    {f.done
                      ? <CircleCheck size={13} className="text-forge-ok" />
                      : <Ember size={13} />}
                    <span className="font-mono text-forge-ink">{f.path}</span>
                    {!f.done && <span className="text-[10px] text-forge-ember/70">writing…</span>}
                  </li>
                ))}
              </ul>
            )}
            {busyFor != null && busyFor > 75 && (
              <p className="mt-2 border-t border-forge-border pt-2 text-[10px] text-forge-dim/70">
                Files land as they finish — the preview refreshes with each one. You can queue your next message meanwhile.
              </p>
            )}
          </div>
        )}
        {plan && !busy && <PlanCard plan={plan} onApprove={onApprovePlan} />}
        {/* Completion receipt: how long the last forge took (+ what it cost), shown briefly after it lands. */}
        {!busy && !activeGeneration && lastGeneration?.status === 'succeeded' && lastGeneration.finished_at
          && Date.now() - new Date(lastGeneration.finished_at).getTime() < 10 * 60_000 && (
          <div className="flex items-center gap-2 px-1 text-[11px] text-forge-dim/80">
            <CircleCheck size={12} className="text-forge-ok" />
            <span>
              Forged in {fmtDur((new Date(lastGeneration.finished_at).getTime() - new Date(lastGeneration.created_at).getTime()) / 1000)}
              {lastGeneration.cost_usd > 0 && <span className="font-mono"> · ~${lastGeneration.cost_usd.toFixed(2)}</span>}
            </span>
          </div>
        )}
        {/* activeGeneration only covers running/queued, so failures must key off the LATEST generation. */}
        {!busy && !activeGeneration && lastGeneration?.status === 'failed' && (
          <div className="flex items-start gap-2 rounded-xl border border-forge-err/40 bg-forge-raised p-3 text-xs">
            <CircleX size={14} className="mt-0.5 shrink-0 text-forge-err" />
            <div>
              <p className="font-medium text-forge-err">Generation failed</p>
              <p className="mt-0.5 text-forge-dim">{lastGeneration.error ?? 'Unknown error.'} Try again with a simpler prompt.</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-forge-border bg-forge-raised px-3 py-1 text-[11px] text-forge-dim shadow-soft transition-colors hover:text-forge-ink"
          >
            ↓ Jump to latest
          </button>
        )}
      </div>

      <div className="border-t border-forge-border p-3">
        {askOptions.length > 0 && !busy && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {askOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => onSend(opt)}
                className="rounded-full border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-[11px] text-forge-ink transition-colors hover:bg-forge-ember/20"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Suggestions — only while the box is empty, in one tidy scroll row, so the bar stays calm. */}
        {!input.trim() && !busy && askOptions.length === 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 panel-scroll">
            {onOpenAssets && (
              <button
                onClick={onOpenAssets}
                title="Upload photos or import them from your old site — builds use them automatically"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-forge-ember/40 bg-forge-ember/10 px-2.5 py-1 text-[11px] text-forge-ink transition-colors hover:bg-forge-ember/20"
              >
                <ImageIcon size={11} /> Use my own photos
              </button>
            )}
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => onSend(a, { planFirst, research, reviewEdits })}
                className="shrink-0 whitespace-nowrap rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {selection && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-forge-ember/40 bg-forge-ember/10 px-2.5 py-1 text-[11px] text-forge-ink">
            <MousePointerClick size={11} className="text-forge-ember" />
            <span className="font-mono">&lt;{selection.tag}&gt;</span>
            <span className="max-w-[180px] truncate text-forge-dim">{selection.loc.replace(/^\/src\//, '')}</span>
            {selection.count > 1 && <span className="text-forge-dim">×{selection.count}</span>}
            <button type="button" aria-label="Clear selected element" onClick={onClearSelection} className="text-forge-dim hover:text-forge-ink">
              <X size={11} />
            </button>
          </div>
        )}

        {(pendingUrls.length > 0 || readingLinks) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {pendingUrls.map((u) => (
              <span key={u} title={u} className="inline-flex items-center gap-1.5 rounded-full border border-forge-ember/40 bg-forge-ember/10 px-2.5 py-1 text-[11px] text-forge-ink">
                {readingLinks ? <CircleDashed size={11} className="animate-spin text-forge-ember" /> : <Link2 size={11} className="text-forge-ember" />}
                {hostOf(u)}
              </span>
            ))}
            <span className="text-[10px] text-forge-dim">{readingLinks ? 'Reading pages…' : 'Will be read and used as context'}</span>
          </div>
        )}

        {queue.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {queue.map((q, i) => (
              <span key={`${i}-${q.slice(0, 16)}`} className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-forge-border bg-forge-panel px-2.5 py-1 text-[11px] text-forge-dim">
                <span className="truncate">{q}</span>
                <button type="button" aria-label="Remove queued message" onClick={() => setQueue((qs) => qs.filter((_, j) => j !== i))} className="shrink-0 text-forge-dim hover:text-forge-ink">
                  <X size={11} />
                </button>
              </span>
            ))}
            <span className="text-[10px] text-forge-dim">Queued — sends when the current turn finishes</span>
          </div>
        )}

        {shot && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-forge-border bg-forge-panel p-1.5">
            <img src={shot} alt="Image to send" className="h-10 w-auto rounded border border-forge-border" />
            <span className="text-[11px] text-forge-dim">Image attached</span>
            <button type="button" onClick={() => setShot(null)} aria-label="Remove image" className="rounded p-0.5 text-forge-dim hover:text-forge-ink">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Controls — model + mode toggles on the left, utilities on the right. Wraps on narrow
            panels so nothing gets clipped. */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <ModelPicker open={pickerOpen} onToggle={setPickerOpen} />
          <span className="mx-0.5 h-5 w-px bg-forge-border" />
          <button
            type="button"
            onClick={() => setPlanFirst((v) => !v)}
            aria-pressed={planFirst}
            title="Plan first — propose a plan for approval before writing any code"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              planFirst ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
            )}
          >
            <ClipboardList size={12} /> Plan
          </button>
          <button
            type="button"
            onClick={() => setReviewEdits((v) => !v)}
            aria-pressed={reviewEdits}
            title="Review — preview the diff and approve before any file is written"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              reviewEdits ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
            )}
          >
            <Eye size={12} /> Review
          </button>
          <button
            type="button"
            onClick={() => setResearch((v) => !v)}
            aria-pressed={research}
            title="Research — answer with live web research instead of editing"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              research ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
            )}
          >
            <Globe size={12} /> Research
          </button>
          <div className="ml-auto flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.markdown,.ts,.tsx,.js,.jsx,.json,.css,.scss,.html,.csv,.sql,.env,.py,.yml,.yaml"
              className="hidden"
              onChange={(e) => { void attachFiles(e.target.files); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title="Attach a file or image to your message"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-forge-border text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-50"
            >
              <Paperclip size={13} />
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={shooting || busy}
              aria-pressed={!!shot}
              title={shot ? 'Screenshot attached — click to retake' : 'Attach a screenshot of the preview'}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-50',
                shot ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
              )}
            >
              {shooting ? <CircleDashed size={13} className="animate-spin" /> : <Camera size={13} />}
            </button>
            {onOpenAssets && (
              <button
                type="button"
                onClick={onOpenAssets}
                title="Assets — upload photos or import them from an old site; builds use them automatically"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-forge-border text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
              >
                <ImageIcon size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setRememberOpen(true)}
              title="Remember — teach FableForge a lasting preference"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-forge-border text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
            >
              <Brain size={13} />
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              else if (e.key === 'Escape' && busy && onStop) { e.preventDefault(); onStop(); }
            }}
            rows={2}
            placeholder={busy ? 'Working… type your next message — Enter queues it' : 'Describe a change… (Enter to send, paste a link to have it read)'}
            disabled={readingLinks}
            aria-label="Message the assistant"
            className="flex-1 resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none disabled:opacity-50"
          />
          {busy && onStop ? (
            <Button onClick={onStop} aria-label="Stop generating" title="Stop (Esc)" className="bg-forge-raised text-forge-ink hover:bg-forge-panel">
              <Square size={14} className="fill-current" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy || !input.trim()} aria-label="Send">
              <Send size={15} />
            </Button>
          )}
        </div>
      </div>

      <RememberModal projectId={projectId} seed={lastUserMessage} open={rememberOpen} onClose={() => setRememberOpen(false)} />
    </div>
  );
}
