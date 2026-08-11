// src/components/ConciergeDock.tsx
// THE CONCIERGE — the corner agent on every page: say what you want ("lets work on moms
// postcard", "start a clothing brand") and it takes you there, then stays open walking you
// through the steps. Known asks resolve instantly through the verified pure core (concierge.ts)
// — no AI round-trip, no cost; ambiguous asks get honest suggestions; free-form falls through to
// Garvis on Home. Creation is never silent: create-tasks prefill the existing genesis flow where
// making the thing stays an explicit "Draft the web" press.
// State survives navigation via sessionStorage because AppShell remounts per page.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Loader2, MessageCircle, Mic, Play, Sparkles, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import {
  aliasKey, aliasLookup, aliasRemember, isBrief, isRevision, parseCommandPrefix, resolve, routeFor, statsFor,
  type ConciergeAlias, type ConciergeTask, type ConciergeWorld,
} from '../lib/garvis/concierge';
import { answerStat } from '../lib/garvis/conciergeStats';
import { ALL_CONCIERGE_TASKS } from '../lib/garvis/conciergeTasks';
import type { CompiledPlan, StepStatus } from '../lib/garvis/orchestrator';
import { actionById } from '../lib/garvis/actionRegistry';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const OPEN_KEY = 'ff:concierge-open';
const TASK_KEY = 'ff:concierge-task';
export const GENESIS_PREFILL_KEY = 'ff:genesis-intent';
/** The sentence handoff: whatever the operator SAID rides along to the destination, so pages
 *  with a primary input (Orchestrate's intent box, the studio's topic) open already filled in.
 *  Read once and clear — a stale sentence must never prefill a later visit. */
export const HANDOFF_KEY = 'ff:concierge-handoff';

export interface ConciergeHandoff { taskId: string; sentence: string }

/** Destination-side helper: consume the handoff if it came from the given task(s). */
export function readHandoff(...taskIds: string[]): ConciergeHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as ConciergeHandoff;
    if (!h?.sentence || (taskIds.length && !taskIds.includes(h.taskId))) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return h;
  } catch { return null; }
}

interface ActiveGuide { taskId: string; done: number[] }

const ALIAS_KEY = 'ff:concierge-aliases';
const VOICE_KEY = 'ff:concierge-voice';
const loadAliases = (): ConciergeAlias[] => {
  try { return (JSON.parse(localStorage.getItem(ALIAS_KEY) || '[]') as ConciergeAlias[]).filter((a) => a?.sentence && a?.taskId); }
  catch { return []; }
};

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** The Do-engine's in-dock state: a compiled plan awaiting the Run press, or a live run. */
interface DoState {
  intent: string;
  plan: CompiledPlan;
  warnings: string[];
  planId?: string;
  statuses?: StepStatus[];
  finished?: 'done' | 'waiting' | 'failed';
  finalNote?: string;
}

export function ConciergeDock() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => sessionStorage.getItem(OPEN_KEY) === '1');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ConciergeTask[]>([]);
  const [lastSentence, setLastSentence] = useState('');
  const [compound, setCompound] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<ConciergeTask | null>(null);
  const [guide, setGuide] = useState<ActiveGuide | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(TASK_KEY) || 'null') as ActiveGuide | null; } catch { return null; }
  });
  const [doState, setDoState] = useState<DoState | null>(null);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem(VOICE_KEY) === '1');
  const aliasesRef = useRef<ConciergeAlias[]>(loadAliases());
  const worldsRef = useRef<ConciergeWorld[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); }, [open]);
  useEffect(() => {
    try { sessionStorage.setItem(TASK_KEY, JSON.stringify(guide)); } catch { /* session-only */ }
  }, [guide]);
  // Zero-input value: the dock opens knowing the ONE number that matters — approvals waiting.
  // A failed count hides the line (honest silence), never a fake zero.
  useEffect(() => {
    if (!open) return;
    let dead = false;
    void supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count, error }) => { if (!dead && !error) setPendingCount(count ?? 0); });
    return () => { dead = true; };
  }, [open]);

  // Cross-device tier 0: learned phrases sync through concierge_aliases (app_0136). DB rows merge
  // over local on mount (newest wins by construction); saves are fire-and-forget both places.
  useEffect(() => {
    let dead = false;
    void supabase.from('concierge_aliases').select('sentence, task_id').order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (dead || error || !data) return;
        let merged = aliasesRef.current;
        for (const r of (data as { sentence: string; task_id: string }[]).reverse()) {
          merged = aliasRemember(r.sentence, r.task_id, merged);
        }
        aliasesRef.current = merged;
        try { localStorage.setItem(ALIAS_KEY, JSON.stringify(merged)); } catch { /* fine */ }
      });
    return () => { dead = true; };
  }, []);

  // Voice replies: short outcome lines, spoken only when the operator turned the voice on.
  const speak = (text: string) => {
    if (!voiceOn || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 300));
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch { /* voice is best-effort */ }
  };
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    try { localStorage.setItem(VOICE_KEY, next ? '1' : '0'); } catch { /* fine */ }
    if (!next) { try { window.speechSynthesis?.cancel(); } catch { /* fine */ } }
  };

  // ⌘J / Ctrl+J toggles the concierge from anywhere (⌘K stays the command palette's).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadWorlds = async (): Promise<ConciergeWorld[]> => {
    if (worldsRef.current) return worldsRef.current;
    const { data } = await supabase.from('knowledge_clusters')
      .select('slug, world_id, knowledge_worlds!inner(id, title)').limit(200);
    const byWorld = new Map<string, ConciergeWorld>();
    for (const c of (data ?? []) as unknown as { slug: string; world_id: string; knowledge_worlds: { id: string; title: string } }[]) {
      if (!c.world_id) continue;
      const w = byWorld.get(c.world_id) ?? { id: c.world_id, title: c.knowledge_worlds?.title ?? '', slugs: [] };
      w.slugs.push(c.slug);
      byWorld.set(c.world_id, w);
    }
    worldsRef.current = [...byWorld.values()];
    return worldsRef.current;
  };

  // Persist SYNCHRONOUSLY before navigating: the route change unmounts this dock (AppShell is
  // per-page) before any effect could run — an effect-based save loses the guide every time.
  const startGuide = (taskId: string) => {
    const g: ActiveGuide = { taskId, done: [] };
    try { sessionStorage.setItem(TASK_KEY, JSON.stringify(g)); sessionStorage.setItem(OPEN_KEY, '1'); } catch { /* fine */ }
    setGuide(g);
  };

  const act = (task: ConciergeTask, route: string, missingWorld?: boolean, sentence?: string) => {
    setSuggestions([]);
    setCompound(false);
    if (task.kind === 'create') {
      // Creation is confirmed, never silent — show the one-tap confirm.
      setPendingCreate(task);
      setNote(null);
      return;
    }
    // The operator's words ride along — destinations with a primary input read them once.
    if (sentence) { try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ taskId: task.id, sentence })); } catch { /* fine */ } }
    startGuide(task.id);
    setNote(missingWorld ? `That business doesn't exist yet — pick or create it here, then say it again.` : null);
    navigate(route);
  };

  const confirmCreate = (task: ConciergeTask) => {
    if (task.genesisIntent) { try { sessionStorage.setItem(GENESIS_PREFILL_KEY, task.genesisIntent); } catch { /* fine */ } }
    setPendingCreate(null);
    startGuide(task.id);
    navigate(task.route);
  };

  // Tier 2 — the AI router. Only a tier-1 MISS pays for this round-trip: the edge function
  // classifies the sentence against the SAME task list and either picks one task id (validated
  // server-side against the list — it can't invent destinations) or answers in two sentences.
  // Degraded (no AI key) or failing, the dock says so honestly and points at Garvis on Home.
  const FALLBACK = "I don't have a shortcut for that — Garvis on Home handles anything free-form.";
  const askBrain = async (sentence: string, worlds: ConciergeWorld[]) => {
    setBusy(true);
    setSuggestions([]);
    setCompound(false);
    setNote('Thinking…');
    try {
      const { data, error } = await supabase.functions.invoke('concierge', {
        body: {
          sentence,
          context: window.location.pathname,
          tasks: ALL_CONCIERGE_TASKS.map(({ id, label }) => ({ id, label })),
        },
      });
      if (error || !data) { setNote(FALLBACK); return; }
      const d = data as { available?: boolean; setup?: string[]; taskId?: string | null; answer?: string | null };
      if (d.available === false) { setNote(d.setup?.[0] ?? FALLBACK); return; }
      const picked = d.taskId ? ALL_CONCIERGE_TASKS.find((t) => t.id === d.taskId) ?? null : null;
      if (picked) {
        rememberAlias(sentence, picked.id);   // tier 0 learns — next time this phrasing is instant
        const { route, missingWorld } = routeFor(picked, worlds);
        act(picked, route, missingWorld, sentence);
        return;
      }
      const ans = d.answer?.trim() ? d.answer : FALLBACK;
      setNote(ans);
      speak(ans);
    } catch {
      setNote(FALLBACK);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  // Compound intent → Orchestrate, sentence riding along; Compile stays the explicit press.
  const goOrchestrate = (sentence: string) => {
    const orch = ALL_CONCIERGE_TASKS.find((t) => t.id === 'orchestrate');
    if (!orch) return;
    act(orch, orch.route, false, sentence);
  };

  // THE BRIEF DOOR — a pasted wall of thinking skips every matching tier and arrives INTACT.
  // "Design the business" puts the WHOLE brief in the genesis intent box (Draft the web stays
  // the explicit press); "Compile a plan" carries it to Orchestrate the same way.
  const captureBrief = (text: string) => {
    setBriefText(text);
    setInput('');
    setSuggestions([]);
    setCompound(false);
    setDoState(null);
    setNote(null);
  };
  const briefToGenesis = () => {
    if (!briefText) return;
    try { sessionStorage.setItem(GENESIS_PREFILL_KEY, briefText); } catch { /* fine */ }
    setBriefText(null);
    startGuide('big-brief');
    navigate('/garvis/webs');
  };
  const briefToOrchestrate = () => {
    if (!briefText) return;
    const b = briefText;
    setBriefText(null);
    goOrchestrate(b);
  };

  // THE DO-ENGINE — "garvis, do X" without leaving the corner. Reuses the Orchestrator wholesale:
  // compile → the SAME reviewable contract (steps, risks, holes, questions) rendered small →
  // "Run it" is the explicit press → the arc executes live with per-step outcomes. Nothing runs
  // from words alone, and outbound steps still land in Queue behind their own approvals.
  const doIt = async (sentence: string) => {
    setBusy(true);
    setSuggestions([]);
    setCompound(false);
    setDoState(null);
    setNote('Compiling the plan…');
    try {
      const { compileIntent } = await import('../lib/garvis/orchestratorRun');
      const { plan, problems, warnings } = await compileIntent(sentence);
      if (!plan) {
        setNote(problems[0] ?? "I couldn't compile that — Orchestrate has the full composer.");
        return;
      }
      setNote(null);
      setDoState({ intent: sentence, plan, warnings });
      speak(`Plan ready: ${plan.summary}`);
    } catch (e) {
      setNote(e instanceof Error && /key|credit/i.test(e.message)
        ? e.message
        : "The compiler isn't reachable — is an AI key set? Orchestrate shows the same composer with setup notes.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const runIt = async (ds: DoState) => {
    setBusy(true);
    try {
      const { savePlan, runArc } = await import('../lib/garvis/orchestratorRun');
      const planId = ds.planId ?? await savePlan(ds.intent, ds.plan);
      setDoState({ ...ds, planId, statuses: ds.plan.steps.map(() => ({ kind: 'pending', note: '' })) });
      const report = await runArc(planId, (statuses) => setDoState((cur) => (cur ? { ...cur, planId, statuses: [...statuses] } : cur)));
      const finalNote = report.state === 'done'
        ? 'Done. Anything outbound is waiting for your approval in Queue.'
        : report.state === 'waiting'
          ? `Paused, honestly: ${report.waitingReason ?? 'a step needs you first'} — it resumes on its own after that.`
          : 'A step failed — the notes above say exactly which and why.';
      setDoState((cur) => (cur ? { ...cur, planId, statuses: [...report.statuses], finished: report.state === 'running' ? 'waiting' : report.state, finalNote } : cur));
      speak(finalNote);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rememberAlias = (sentence: string, taskId: string) => {
    aliasesRef.current = aliasRemember(sentence, taskId, aliasesRef.current);
    try { localStorage.setItem(ALIAS_KEY, JSON.stringify(aliasesRef.current)); } catch { /* fine */ }
    // Cross-device: best-effort upsert; a failure just means this device-only until next time.
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      void supabase.from('concierge_aliases').upsert({
        owner_id: data.user.id, sentence_norm: aliasKey(sentence), sentence: sentence.trim().slice(0, 200), task_id: taskId,
      }).then(() => {});
    });
  };

  const submit = async () => {
    const raw = input.trim();
    if (!raw || busy) return;
    setInput('');
    setPendingCreate(null);
    // A plan is on screen and the operator is correcting it → revise THAT plan, don't start over.
    if (doState && !doState.statuses && isRevision(raw)) {
      const prev = doState;
      setBusy(true);
      setNote('Revising the plan…');
      try {
        const { compileIntent } = await import('../lib/garvis/orchestratorRun');
        const { plan, problems, warnings } = await compileIntent(prev.intent, { previous: prev.plan, note: raw });
        if (!plan) { setNote(problems[0] ?? "I couldn't apply that change — say the whole thing again."); return; }
        setNote(null);
        setDoState({ intent: prev.intent, plan, warnings });
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
      return;
    }
    setDoState(null);
    // A typed-out wall of thinking is a brief too — same intact-capture door as a paste.
    if (isBrief(raw)) { captureBrief(raw); return; }
    // "garvis" is courtesy; "do/run/execute" is an execution order → straight to the compiler.
    const { sentence: text, execute } = parseCommandPrefix(raw);
    if (!text) return;
    setLastSentence(text);
    if (execute) { await doIt(text); return; }
    // THE STATS TIER — number questions answered from real rows, free, before anything routes.
    const stat = statsFor(text);
    if (stat) {
      setBusy(true);
      setNote('Counting…');
      const a = await answerStat(stat);
      setBusy(false);
      setSuggestions([]);
      setNote(a.text);
      // Raw-route match only — a world task's missing-world fallback must never steal the chip.
      if (a.link) { const t = ALL_CONCIERGE_TASKS.find((x) => x.route === a.link); if (t) setSuggestions([t]); }
      speak(a.text);
      inputRef.current?.focus();
      return;
    }
    // Tier 0 — the operator's own learned phrasings resolve instantly.
    const learned = aliasLookup(text, aliasesRef.current);
    const learnedTask = learned ? ALL_CONCIERGE_TASKS.find((t) => t.id === learned) : null;
    const worlds = await loadWorlds().catch(() => [] as ConciergeWorld[]);
    inputRef.current?.focus();
    if (learnedTask) {
      const { route, missingWorld } = routeFor(learnedTask, worlds);
      act(learnedTask, route, missingWorld, text);
      return;
    }
    const r = resolve(text, worlds, ALL_CONCIERGE_TASKS);
    if (r.kind === 'go' && r.task && r.route) { act(r.task, r.route, r.missingWorld, text); return; }
    if (r.kind === 'compound' && r.suggestions?.length) {
      setCompound(true);
      setSuggestions(r.suggestions);
      setNote("That's a multi-part ask — I can run it as ONE reviewable plan:");
      return;
    }
    if (r.kind === 'suggest' && r.suggestions?.length) {
      setCompound(false);
      setSuggestions(r.suggestions);
      setNote('Closest matches — tap one:');
      return;
    }
    setGuide(null);
    setSuggestions([]);
    await askBrain(text, worlds);
  };

  // Mic input (Web Speech API): fills the box, never auto-submits; absent browsers just don't
  // get the button — no fake affordance.
  const SpeechRec = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike });
  const SpeechCtor = SpeechRec.SpeechRecognition ?? SpeechRec.webkitSpeechRecognition;
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!SpeechCtor) return;
    const rec = new SpeechCtor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const t = Array.from(ev.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
      if (t) setInput(t);
    };
    rec.onend = () => { setListening(false); inputRef.current?.focus(); };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const task = guide ? ALL_CONCIERGE_TASKS.find((t) => t.id === guide.taskId) ?? null : null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open the concierge — say what you want to do"
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-forge-ember/50 bg-forge-panel text-forge-ember shadow-lg transition-transform hover:scale-105">
        <MessageCircle size={19} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-forge-border bg-forge-panel p-3 shadow-2xl">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-forge-ember" />
        <p className="text-xs font-semibold text-forge-ink">Say what you want to do</p>
        {'speechSynthesis' in window && (
          <button onClick={toggleVoice} aria-label={voiceOn ? 'Turn voice replies off' : 'Turn voice replies on'}
            className={cn('ml-auto rounded p-1', voiceOn ? 'text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>
            {voiceOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        )}
        <button onClick={() => { setOpen(false); }} aria-label="Close the concierge"
          className={cn('rounded p-1 text-forge-dim hover:text-forge-ink', !('speechSynthesis' in window) && 'ml-auto')}><X size={14} /></button>
      </div>

      {pendingCount !== null && pendingCount > 0 && !doState && (
        <button onClick={() => { const t = ALL_CONCIERGE_TASKS.find((x) => x.id === 'approvals'); if (t) act(t, t.route); }}
          className="mt-1.5 w-full rounded-lg border border-forge-border bg-forge-bg/60 px-2.5 py-1 text-left text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
          {pendingCount} approval{pendingCount === 1 ? '' : 's'} waiting on you — tap to review
        </button>
      )}

      <div className="mt-2 flex gap-1.5">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (isBrief(t)) { e.preventDefault(); captureBrief(t); }
          }}
          placeholder={'"moms postcard" · "do draft an episode about rates" · "what\'s next"'}
          className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
        {SpeechCtor && (
          <button onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak instead of typing'}
            className={cn('rounded-lg border px-2', listening ? 'border-forge-ember bg-forge-ember/20 text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
            <Mic size={14} />
          </button>
        )}
        <button onClick={() => void submit()} aria-label="Go" disabled={busy}
          className="rounded-lg border border-forge-ember/50 px-2.5 text-forge-ember hover:bg-forge-ember/10 disabled:opacity-50"><ArrowRight size={14} /></button>
      </div>

      {note && <p className="mt-2 whitespace-pre-line text-[11px] text-forge-dim">{note}</p>}

      {briefText && (
        <div className="mt-2 rounded-xl border border-forge-ember/40 bg-forge-bg/60 p-2.5">
          <p className="text-[11px] font-semibold text-forge-ink">That's a whole brief — {briefText.trim().split(/\s+/).length.toLocaleString()} words, captured intact.</p>
          <p className="mt-0.5 text-[11px] text-forge-dim">Nothing is created yet. Where should it go?</p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <button onClick={briefToGenesis}
              className="rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-forge-ember hover:bg-forge-ember/20">
              Design the business from it — genesis reads every word, you press "Draft the web"
            </button>
            <button onClick={briefToOrchestrate}
              className="rounded-lg border border-forge-border px-2.5 py-1.5 text-left text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
              Compile it as a plan in Orchestrate instead
            </button>
            <button onClick={() => setBriefText(null)}
              className="rounded-lg px-2.5 py-1 text-left text-[10px] text-forge-dim hover:text-forge-ink">
              Never mind — discard
            </button>
          </div>
        </div>
      )}

      {compound && (
        <div className="mt-1.5 flex gap-1.5">
          <button onClick={() => void doIt(lastSentence)} disabled={busy}
            className="flex-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-forge-ember hover:bg-forge-ember/20 disabled:opacity-50">
            Do it now — compile &amp; run here
          </button>
          <button onClick={() => goOrchestrate(lastSentence)}
            className="rounded-lg border border-forge-border px-2.5 py-1.5 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
            Open Orchestrate
          </button>
        </div>
      )}

      {doState && (
        <div className="mt-2 rounded-xl border border-forge-border bg-forge-bg/60 p-2.5">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-forge-ink">{doState.plan.title}</p>
            <button onClick={() => setDoState(null)} aria-label="Dismiss this plan"
              className="rounded p-0.5 text-forge-dim hover:text-forge-ink"><X size={12} /></button>
          </div>
          <p className="mt-0.5 text-[11px] text-forge-dim">{doState.plan.summary}</p>
          <ol className="mt-1.5 space-y-1">
            {doState.plan.steps.map((s, i) => {
              const spec = actionById(s.action);
              const st = doState.statuses?.[i];
              return (
                <li key={i} className="flex items-start gap-1.5 text-[11px]">
                  <span className="mt-0.5 shrink-0">
                    {st?.kind === 'running' ? <Loader2 size={11} className="animate-spin text-forge-ember" />
                      : st && (st.kind === 'done' || st.kind === 'needs_review' || st.kind === 'handoff') ? <Check size={11} className="text-forge-ok" />
                        : st?.kind === 'failed' ? <X size={11} className="text-forge-err" />
                          : st?.kind === 'waiting' ? <TriangleAlert size={11} className="text-forge-warn" />
                            : <span className="block h-[11px] w-[11px] rounded-full border border-forge-border" />}
                  </span>
                  <span className="min-w-0 flex-1 text-forge-dim">
                    <span className="text-forge-ink">{spec?.title ?? s.action}</span>
                    {spec && spec.risk !== 'safe' && (
                      <span className={cn('ml-1 rounded px-1 text-[9px]', spec.risk === 'outbound' ? 'bg-forge-warn/15 text-forge-warn' : 'bg-forge-ember/15 text-forge-ember')}>
                        {spec.risk === 'outbound' ? 'can send — Queue-gated' : 'uses credits'}
                      </span>
                    )}
                    {st?.note && <span className="block text-forge-dim">{st.note}{st.link && <button onClick={() => navigate(st.link!)} className="ml-1 text-forge-ember hover:underline">open →</button>}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {doState.plan.holes.length > 0 && (
            <p className="mt-1.5 text-[11px] text-forge-warn">Can't do yet: {doState.plan.holes.join(' · ')}</p>
          )}
          {doState.plan.questions.length > 0 && (
            <div className="mt-1">
              {doState.plan.questions.map((q, i) => <p key={i} className="text-[11px] text-forge-dim">It will ask: {q}</p>)}
            </div>
          )}
          {!doState.statuses && (doState.plan.steps.length > 4 || doState.plan.questions.length > 1) && (
            <p className="mt-1 text-[10px] text-forge-dim">Big plan — "Review big" shows every step's why on the full card.</p>
          )}
          {doState.finalNote
            ? <p className={cn('mt-1.5 text-[11px] font-medium', doState.finished === 'done' ? 'text-forge-ok' : doState.finished === 'failed' ? 'text-forge-err' : 'text-forge-warn')}>{doState.finalNote}</p>
            : !doState.statuses && (
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => void runIt(doState)} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1.5 text-[11px] font-medium text-forge-ember hover:bg-forge-ember/20 disabled:opacity-50">
                  <Play size={11} /> Run it
                </button>
                <button onClick={() => { goOrchestrate(doState.intent); }}
                  className="rounded-lg border border-forge-border px-2.5 py-1.5 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
                  Review big
                </button>
              </div>
            )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {compound && <span className="w-full text-[10px] text-forge-dim">…or take one piece:</span>}
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => { const { route, missingWorld } = routeFor(s, worldsRef.current ?? []); act(s, route, missingWorld, lastSentence); }}
              className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
              {s.label}
            </button>
          ))}
          {!compound && (
            <button onClick={() => void loadWorlds().catch(() => [] as ConciergeWorld[]).then((w) => askBrain(lastSentence, w))}
              className="rounded-lg border border-dashed border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
              None of these — ask the brain
            </button>
          )}
        </div>
      )}

      {pendingCreate && (
        <div className="mt-2 rounded-xl border border-forge-border bg-forge-bg/60 p-2.5">
          <p className="text-[11px] text-forge-ink">{pendingCreate.label}</p>
          <p className="mt-0.5 text-[11px] text-forge-dim">
            {pendingCreate.templateId
              ? 'Nothing is created yet — the template card builds it in one tap when you press it there.'
              : 'Nothing is created yet — this fills in the start for you; you press "Draft the web" when it reads right.'}
          </p>
          <button onClick={() => confirmCreate(pendingCreate)}
            className="mt-1.5 rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">
            Set it up →
          </button>
        </div>
      )}

      {task && (
        <div className="mt-2 rounded-xl border border-forge-border bg-forge-bg/60 p-2.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold text-forge-ink">{task.label}</p>
            <button onClick={() => setGuide(null)} aria-label="Dismiss these steps"
              className="ml-auto rounded p-0.5 text-forge-dim hover:text-forge-ink"><X size={12} /></button>
          </div>
          <ol className="mt-1 space-y-1">
            {task.steps.map((s, i) => {
              const done = guide!.done.includes(i);
              return (
                <li key={i}>
                  <button onClick={() => setGuide({ taskId: task.id, done: done ? guide!.done.filter((d) => d !== i) : [...guide!.done, i] })}
                    className="flex w-full items-start gap-1.5 text-left text-[11px]">
                    <span className={cn('mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', done ? 'border-forge-ok/60 text-forge-ok' : 'border-forge-border text-transparent')}>
                      <Check size={9} />
                    </span>
                    <span className={cn(done ? 'text-forge-dim line-through' : 'text-forge-dim')}>{i + 1}. {s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
