import { useEffect, useRef, useState } from 'react';
import { Send, Flame, FileCode2, CircleCheck, CircleDashed, CircleX, ClipboardList, Check } from 'lucide-react';
import type { AIMessage, Generation, EditPlan } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

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

interface StreamState { explanation: string; files: { path: string; done: boolean }[] }

interface Props {
  messages: AIMessage[];
  activeGeneration: Generation | null;
  busy: boolean;
  /** Quick-reply chips for a clarifying question the assistant just asked. */
  askOptions?: string[];
  /** A plan the assistant proposed (plan mode), awaiting approval. */
  plan?: EditPlan | null;
  /** Approve the pending plan — triggers the build. */
  onApprovePlan?: () => void;
  /** Live progress while the assistant streams an edit. */
  stream?: StreamState | null;
  onSend: (message: string) => void;
}

/** The plan card: what the assistant proposes before writing any code. */
function PlanCard({ plan, onApprove }: { plan: EditPlan; onApprove?: () => void }) {
  return (
    <div className="rounded-xl border border-forge-ember/40 bg-forge-raised p-3 shadow-ember">
      <div className="flex items-center gap-2">
        <ClipboardList size={15} className="text-forge-ember" />
        <span className="font-display text-sm font-medium">Proposed plan</span>
        <span className="ml-auto rounded-full border border-forge-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-forge-dim">
          no files changed yet
        </span>
      </div>
      {plan.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-forge-ink">{plan.summary}</p>}

      {plan.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-forge-dim">
          {plan.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {plan.fileHints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {plan.fileHints.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">
              <FileCode2 size={10} /> {f}
            </span>
          ))}
        </div>
      )}
      {plan.options.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-forge-dim">Options</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-forge-ink">
            {plan.options.map((o) => <li key={o}>• {o}</li>)}
          </ul>
        </div>
      )}
      {plan.openQuestions.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-forge-dim">Open questions</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-forge-ember">
            {plan.openQuestions.map((q) => <li key={q}>• {q}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={onApprove}>
          <Check size={14} /> Approve &amp; build
        </Button>
        <span className="text-[11px] text-forge-dim">…or reply below to change the plan.</span>
      </div>
    </div>
  );
}

/** Signature element: the forging strip — stages heat up as the agent works. */
function ForgeProgress({ gen }: { gen: Generation }) {
  const stages = gen.stages ?? [];
  return (
    <div className="rounded-xl border border-forge-ember/30 bg-forge-raised p-3 shadow-ember">
      <div className="flex items-center gap-2">
        <Flame size={15} className="animate-emberPulse text-forge-ember" />
        <span className="font-display text-sm font-medium">Forging your app</span>
        <span className="ml-auto font-mono text-[11px] text-forge-dim">
          {stages.filter((s) => s.status === 'done').length}/{Object.keys(STAGE_LABELS).length}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {Object.entries(STAGE_LABELS).map(([key, label]) => {
          const entry = stages.find((s) => s.stage === key);
          const state = entry?.status === 'done' ? 'done' : entry ? 'running' : 'pending';
          return (
            <li key={key} className="flex items-center gap-2 text-xs">
              {state === 'done' && <CircleCheck size={13} className="text-forge-ok" />}
              {state === 'running' && <CircleDashed size={13} className="animate-spin text-forge-ember" />}
              {state === 'pending' && <CircleDashed size={13} className="text-forge-border" />}
              <span className={cn(state === 'pending' ? 'text-forge-dim/60' : 'text-forge-ink')}>{label}</span>
              {entry?.note && <span className="ml-auto truncate text-[10px] text-forge-dim">{entry.note}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChatPanel({ messages, activeGeneration, busy, askOptions = [], plan = null, onApprovePlan, stream = null, onSend }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeGeneration?.current_stage, stream?.explanation, stream?.files.length]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    onSend(text);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-forge-border px-3 py-2">
        <Flame size={14} className="text-forge-ember" />
        <span className="text-xs font-medium uppercase tracking-wide text-forge-dim">Assistant</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto panel-scroll p-3">
        {messages.length === 0 && !activeGeneration && (
          <div className="rounded-xl border border-dashed border-forge-border p-4 text-center">
            <p className="text-sm text-forge-dim">
              Describe what to build or change. The assistant edits only the files it needs to.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[90%] rounded-xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-forge-ember/15 border border-forge-ember/25'
                  : 'bg-forge-raised border border-forge-border',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.files_changed?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.files_changed.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">
                      <FileCode2 size={10} /> {f}
                    </span>
                  ))}
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
            <CircleDashed size={13} className="animate-spin text-forge-ember" />
            <span>Thinking through your request…</span>
          </div>
        )}
        {stream && (
          <div className="rounded-xl border border-forge-ember/30 bg-forge-raised p-3 shadow-ember">
            <div className="flex items-center gap-2">
              <Flame size={15} className="animate-emberPulse text-forge-ember" />
              <span className="font-display text-sm font-medium">Working on it</span>
            </div>
            {stream.explanation && (
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-forge-dim">{stream.explanation}</p>
            )}
            {stream.files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {stream.files.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 text-xs">
                    {f.done
                      ? <CircleCheck size={13} className="text-forge-ok" />
                      : <CircleDashed size={13} className="animate-spin text-forge-ember" />}
                    <span className="font-mono text-forge-ink">{f.path}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {plan && !busy && <PlanCard plan={plan} onApprove={onApprovePlan} />}
        {activeGeneration?.status === 'failed' && (
          <div className="flex items-start gap-2 rounded-xl border border-forge-err/40 bg-forge-raised p-3 text-xs">
            <CircleX size={14} className="mt-0.5 shrink-0 text-forge-err" />
            <div>
              <p className="font-medium text-forge-err">Generation failed</p>
              <p className="mt-0.5 text-forge-dim">{activeGeneration.error ?? 'Unknown error.'} Try again with a simpler prompt.</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a}
              disabled={busy}
              onClick={() => onSend(a)}
              className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-40"
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={2}
            placeholder={busy ? 'Working…' : 'Describe a change… (Enter to send)'}
            disabled={busy}
            aria-label="Message the assistant"
            className="flex-1 resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none disabled:opacity-50"
          />
          <Button onClick={submit} disabled={busy || !input.trim()} aria-label="Send">
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
