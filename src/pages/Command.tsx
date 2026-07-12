import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Play, Boxes } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { WakingMoment } from '../components/garvis/WakingMoment';
import { RemindersCard } from '../components/garvis/RemindersCard';
import { useAuth } from '../context/AuthContext';
import { MissionTasks } from '../components/garvis/MissionTasks';
import { Markdown } from '../components/Markdown';
import { useCommander } from '../hooks/useCommander';
import { useOpportunities } from '../hooks/useOpportunities';
import { Badge, Button, Ember, Spinner } from '../components/ui';
import type { ChatMessage } from '../hooks/useCommander';
import { useToast } from '../context/ToastContext';
import { MailerDesigner } from '../components/garvis/MailerDesigner';
import { VideoStudio } from '../components/garvis/VideoStudio';
import type { GarvisMission, GarvisTask } from '../types';

const SCAN_THROTTLE_MS = 12 * 60 * 60 * 1000; // proactive scan at most twice a day

const SUGGESTIONS = [
  'Review my portfolio — what should I focus on?',
  'Grow Theory Thread end-to-end',
  'Help my mom grow her Lake Geneva real-estate business',
  'Find new opportunities across my apps',
];

function MissionBlock({ mission, tasks, onRun, running }: { mission: GarvisMission; tasks: GarvisTask[]; onRun: () => void; running: boolean }) {
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="mt-2 rounded-lg border border-forge-ember/30 bg-forge-ember/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-forge-ink">The plan</span>
        <Badge tone={mission.status === 'review' ? 'ok' : mission.status === 'running' ? 'ember' : 'warn'}>{mission.status}</Badge>
        {tasks.length > 0 && <span className="text-[11px] text-forge-dim/70">{done}/{tasks.length} done</span>}
        {mission.status === 'planned' && (
          <Button onClick={onRun} loading={running} className="ml-auto"><Play size={13} /> Run it</Button>
        )}
        {mission.status === 'running' && <span className="ml-auto"><Spinner label="working…" /></span>}
      </div>
      {tasks.length > 0 ? <MissionTasks tasks={tasks} /> : <p className="text-xs text-forge-dim">Planning…</p>}
    </div>
  );
}

export default function Command() {
  const { messages, thinking, send, missions, tasksByMission, runMission, busyId, canvas, closeCanvas } = useCommander();
  const { toast } = useToast();
  const { loading: oppLoading, scan } = useOpportunities();
  const { profile } = useAuth();
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || 'there';
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking, missions, tasksByMission]);

  // Proactive: the WakingMoment component above the chat is the greeting now (it reads the real
  // record — approvals, replies, insights, mind_events — and answers "why should I care" per line).
  // This effect keeps only the throttled background opportunity scan; the old text greeting is gone
  // because two greetings is a notification center, not a partner.
  useEffect(() => {
    if (greeted.current || oppLoading) return;
    greeted.current = true;
    try {
      const last = Number(localStorage.getItem('garvis_opp_scan') ?? 0);
      if (Date.now() - last > SCAN_THROTTLE_MS) {
        localStorage.setItem('garvis_opp_scan', String(Date.now()));
        void scan().catch(() => {});
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppLoading]);

  const submit = () => { const t = input.trim(); if (!t || thinking) return; setInput(''); void send(t); };

  const renderGarvis = (m: ChatMessage) => {
    const mission = m.missionId ? missions.find((x) => x.id === m.missionId) : undefined;
    return (
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-sm border border-forge-border bg-forge-panel px-3.5 py-2.5">
          <Markdown content={m.text} />
        </div>
        {mission && (
          <MissionBlock
            mission={mission}
            tasks={tasksByMission[mission.id] ?? []}
            onRun={() => runMission(mission.id)}
            running={busyId === mission.id}
          />
        )}
      </div>
    );
  };

  return (
    <AppShell>
      {/* SUMMONED CANVAS (UX redesign): when Garvis opens a studio, the page splits — the
          conversation stays live on the left, the studio works on the right. Closing the canvas
          returns to the centered thread; the studio's output persisted as artifacts either way. */}
      <div className={canvas
        ? 'mx-auto grid h-[calc(100vh-3rem)] max-w-[110rem] gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]'
        : 'mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col'}>
      <div className="flex min-h-0 flex-col">
        <div className="mb-4 flex items-center gap-3">
          <Sparkles size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Garvis</h1>
            <p className="text-sm text-forge-dim">Tell me what you want to accomplish. I'll figure out the rest.</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <WakingMoment name={firstName} />
          <RemindersCard />
          {messages.length === 0 && (
            <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-forge-dim"><Boxes size={16} className="text-forge-ember" /> <span className="text-sm">Try one of these — or just say what's on your mind:</span></div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-forge-border px-3 py-1.5 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeInUp`}>
              {m.role === 'user'
                ? <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-ember-gradient px-3.5 py-2.5 text-sm text-white">{m.text}</div>
                : renderGarvis(m)}
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-forge-border bg-forge-panel px-3.5 py-2.5 text-sm text-forge-dim">
                <Ember size={15} /> Garvis is thinking…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-3 flex items-end gap-2 border-t border-forge-border pt-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder="Ask Garvis anything, or tell it what to do…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2.5 text-sm text-forge-ink focus:border-forge-ember focus:outline-none"
          />
          <Button onClick={submit} loading={thinking} disabled={!input.trim()}><Send size={15} /></Button>
        </div>
      </div>

      {canvas && (
        <div className="hidden min-h-0 flex-col overflow-y-auto rounded-2xl border border-forge-border bg-forge-panel/40 p-4 lg:flex">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium text-forge-ink">
              {canvas.surface === 'mailer' ? '📮 Postcard studio' : '🎬 Video studio'} — {canvas.worldTitle}
            </span>
            <button onClick={closeCanvas} className="ml-auto rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink" title="Close the canvas (work is saved as artifacts)">
              Close
            </button>
          </div>
          {canvas.surface === 'mailer'
            ? <MailerDesigner worldId={canvas.worldId} clusterId={canvas.clusterId} onToast={(k, m) => toast(k, m)} />
            : <VideoStudio worldId={canvas.worldId} clusterId={canvas.clusterId} title={canvas.worldTitle} onToast={(k, m) => toast(k, m)} />}
        </div>
      )}
      </div>
    </AppShell>
  );
}
