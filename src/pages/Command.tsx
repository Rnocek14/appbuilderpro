import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Play, Boxes, Maximize2 } from 'lucide-react';
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
import { QuickStartRealEstate } from '../components/garvis/QuickStartRealEstate';
import { GenerationReadiness } from '../components/garvis/GenerationReadiness';
import ClusterSpike from './spike/ClusterSpike';
import type { GarvisMission, GarvisTask } from '../types';

const SCAN_THROTTLE_MS = 12 * 60 * 60 * 1000; // proactive scan at most twice a day

// First-screen chips exist FOR the empty-thread user (they render only before the first message),
// so every one must produce real value on a zero-data account — no chips that need an existing
// portfolio. Every objective class gets a door here: venture, rabbit hole, build, and the three
// single-purpose desks (answering / documents / data) that nothing else in the UI advertises.
const SUGGESTIONS = [
  'Design a business for me — I\'ll describe the idea',
  'Set up a desk that answers my emails from my saved answers',
  'Set me up to write proposals for my clients',
  'Help me analyze a spreadsheet of numbers',
  'Take me down the rabbit hole on local lead generation',
  'Build me an app for tracking client appointments',
  'What can you do?',
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
        {/* 'running' with no live driver = the page was refreshed mid-run and the loop died with
            the DB row still saying running. Resume re-dispatches (done tasks are skipped) instead
            of leaving an eternal spinner with no way forward. */}
        {mission.status === 'running' && (running
          ? <span className="ml-auto"><Spinner label="working…" /></span>
          : <Button onClick={onRun} className="ml-auto"><Play size={13} /> Resume</Button>)}
      </div>
      {tasks.length > 0
        ? <MissionTasks tasks={tasks} />
        : <p className="text-xs text-forge-dim">{mission.status === 'planning' && !running
            ? 'Planning was interrupted — just ask me again and I\'ll replan it.'
            : 'Planning…'}</p>}
    </div>
  );
}

export default function Command() {
  const { messages, thinking, send, missions, tasksByMission, runMission, busyId, canvas, closeCanvas } = useCommander();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { loading: oppLoading, scan } = useOpportunities();
  const { profile } = useAuth();
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || ''; // '' → "Good morning." not "…, there."
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
        {m.action && (
          <button
            onClick={() => navigate(m.action!.to)}
            className="mt-2 flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ember transition-colors hover:bg-forge-ember/20"
          >
            {m.action.label}
          </button>
        )}
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
          {/* Honest, self-hiding: only speaks in DIRECT mode with no AI key — the reason generation
              might feel empty. Silent when ready or when readiness can't be verified. */}
          <div className="ml-auto"><GenerationReadiness compact /></div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <WakingMoment name={firstName} />
          <RemindersCard />
          {/* THE FRONT DOOR: for a brand-new operator (no venture yet), the one deterministic click
              that builds the whole Mom Real Estate marketing operation and lands them in a studio.
              Renders itself only when there are zero ventures. */}
          {messages.length === 0 && <QuickStartRealEstate onToast={toast} />}

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
                ? <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-ember-gradient px-3.5 py-2.5 text-sm text-[#1A0E04]">{m.text}</div>
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
            <span className="min-w-0 truncate text-sm font-medium text-forge-ink">
              {canvas.surface === 'explore'
                ? <>🕳️ Rabbit hole — {canvas.query}</>
                : <>{canvas.surface === 'mailer' ? '📮 Postcard studio' : '🎬 Video studio'} — {canvas.worldTitle}</>}
            </span>
            {canvas.surface === 'explore' && (
              <button
                onClick={() => { closeCanvas(); navigate('/garvis/explore'); }}
                className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink"
                title="Go full-bleed — the dive continues right where you are"
              >
                <Maximize2 size={11} /> Full screen
              </button>
            )}
            <button onClick={closeCanvas} className={`${canvas.surface === 'explore' ? '' : 'ml-auto '}rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim hover:text-forge-ink`} title="Close the canvas (everything you grew is saved)">
              Close
            </button>
          </div>
          {canvas.surface === 'explore'
            ? (
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-forge-border">
                <ClusterSpike key={canvas.query} embedded seed={canvas.query} />
              </div>
            )
            : canvas.surface === 'mailer'
              ? <MailerDesigner worldId={canvas.worldId} clusterId={canvas.clusterId} onToast={(k, m) => toast(k, m)} />
              : <VideoStudio worldId={canvas.worldId} clusterId={canvas.clusterId} title={canvas.worldTitle} onToast={(k, m) => toast(k, m)} />}
        </div>
      )}
      </div>
    </AppShell>
  );
}
