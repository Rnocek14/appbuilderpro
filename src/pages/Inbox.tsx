// src/pages/Inbox.tsx
// Batch-answer the agent's questions so background builds keep moving.

import { useState } from 'react';
import { Inbox as InboxIcon, CornerDownRight, SkipForward } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button, Card, EmptyState, Input } from '../components/ui';
import { useInbox } from '../hooks/useAutopilot';
import { timeAgo } from '../lib/utils';
import type { AgentQuestion } from '../types';

function QuestionCard({ q, onAnswer, onSkip }: {
  q: AgentQuestion;
  onAnswer: (id: string, text: string) => Promise<void>;
  onSkip: (id: string) => Promise<void>;
}) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = q.status === 'pending';

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    await onAnswer(q.id, text.trim());
    setBusy(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-forge-ink">{q.question}</p>
        <div className="flex shrink-0 items-center gap-2">
          {q.blocking && pending && <Badge tone="warn">Blocking</Badge>}
          <span className="text-xs text-forge-dim">{timeAgo(q.created_at)}</span>
        </div>
      </div>
      {q.context && <p className="mt-1.5 text-xs text-forge-dim">{q.context}</p>}

      {pending ? (
        <div className="mt-3 space-y-2">
          {q.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => (
                <Button key={opt} size="sm" variant="outline" disabled={busy} onClick={() => send(opt)}>
                  {opt}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Or answer in your own words…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(custom)}
            />
            <Button size="sm" disabled={busy || !custom.trim()} onClick={() => send(custom)}>Send</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSkip(q.id)}>
              <SkipForward size={13} /> Skip
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-forge-dim">
          <CornerDownRight size={12} />
          {q.status === 'skipped' ? 'Skipped — the agent used its judgment.' : q.answer}
        </p>
      )}
    </Card>
  );
}

export default function Inbox() {
  const { questions, pendingCount, loading, answer, skip } = useInbox();
  const pending = questions.filter((q) => q.status === 'pending');
  const resolved = questions.filter((q) => q.status !== 'pending');

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-2xl font-semibold text-forge-ink">Inbox</h1>
        <p className="mt-1 text-sm text-forge-dim">
          Questions the agent queued instead of guessing. Answer them in a batch; blocked builds resume automatically.
        </p>

        {!loading && pending.length === 0 && (
          <div className="mt-10">
            <EmptyState
              icon={<InboxIcon size={28} />}
              title="Inbox zero"
              body="No open questions. Autopilot only asks when an answer would genuinely change what gets built."
            />
          </div>
        )}

        {pending.length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="text-xs uppercase tracking-wide text-forge-dim">Needs you · {pendingCount}</p>
            {pending.map((q) => <QuestionCard key={q.id} q={q} onAnswer={answer} onSkip={skip} />)}
          </div>
        )}
        {resolved.length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="text-xs uppercase tracking-wide text-forge-dim">Answered</p>
            {resolved.slice(0, 10).map((q) => <QuestionCard key={q.id} q={q} onAnswer={answer} onSkip={skip} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
