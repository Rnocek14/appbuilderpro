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
import { ArrowRight, Check, GripVertical, Loader2, MessageCircle, Mic, Play, Sparkles, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import {
  aliasKey, aliasLookup, aliasRemember, exploreDive, isBrief, isGoBack, isRevision, parseCommandPrefix, resolve, routeFor, smallTalk, statsFor, withProjectTasks,
  type ConciergeAlias, type ConciergeTask, type ConciergeWorld,
} from '../lib/garvis/concierge';
import { applySuggestion, offerFileToSurface, offerToSurface, onSurfaceChange, surfaceAcceptsFiles, surfaceSuggestions } from '../lib/garvis/surfaceBridge';
import { rankMoves } from '../lib/garvis/suggestionDeck';
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
/** Where the operator parked the dock (viewport top-left px). Absent = docked bottom-right. */
const POS_KEY = 'ff:concierge-pos';
const loadPos = (): { x: number; y: number } | null => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null') as { x: number; y: number } | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch { return null; }
};
const clampPos = (x: number, y: number, w: number, h: number) => ({
  x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
  y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)),
});
/** Chip-tap counts (label → taps) — the deck learns which moves this operator actually uses. */
const TAPS_KEY = 'ff:chip-taps';
const loadTaps = (): Record<string, number> => {
  try {
    const t = JSON.parse(localStorage.getItem(TAPS_KEY) || '{}') as Record<string, number>;
    return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
  } catch { return {}; }
};
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
  // A note written just before a navigation (the missing-world explanation) must survive the
  // remount — AppShell is per-page, so plain state would vanish before the operator reads it.
  // Read here, clear in an effect: StrictMode runs initializers twice, and a clearing read
  // would eat the note on the throwaway first pass.
  const [note, setNote] = useState<string | null>(() => {
    try { return sessionStorage.getItem('ff:concierge-note'); } catch { return null; }
  });
  useEffect(() => { try { sessionStorage.removeItem('ff:concierge-note'); } catch { /* fine */ } }, []);
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
  // The full task list including the operator's own builder projects ("work on jims site").
  // Starts as the static registry; loadWorlds composes the real one alongside the worlds fetch.
  const tasksRef = useRef<ConciergeTask[]>(ALL_CONCIERGE_TASKS);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  // UNLOCKED POSITION — the operator can drag the dock (bubble or panel) anywhere; the parked
  // spot persists across pages and sessions. Docked (null) keeps the classic bottom-right.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(loadPos);
  const rootRef = useRef<HTMLDivElement | HTMLButtonElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; dx: number; dy: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const startDrag = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // A 5px threshold separates a click (open/toggle) from a drag (move) on the same element.
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return;
      d.moved = true;
      setPos(clampPos(ev.clientX - d.dx, ev.clientY - d.dy, r.width, r.height));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = dragRef.current;
      dragRef.current = null;
      if (d?.moved) {
        justDragged.current = true;
        window.setTimeout(() => { justDragged.current = false; }, 200);
        setPos((p) => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* fine */ } } return p; });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const redock = () => { setPos(null); try { localStorage.removeItem(POS_KEY); } catch { /* fine */ } };
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y, 340, 160) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const posStyle = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } as const : undefined;

  // Surface chips re-read when a board/builder mounts or unmounts under the dock.
  const [, setSurfaceNonce] = useState(0);
  useEffect(() => onSurfaceChange(() => setSurfaceNonce((n) => n + 1)), []);
  const tapsRef = useRef<Record<string, number>>(loadTaps());
  const recordTap = (label: string) => {
    const t = { ...tapsRef.current, [label]: (tapsRef.current[label] ?? 0) + 1 };
    // Cap the ledger — drop the least-used entries, never the fresh tap.
    const keys = Object.keys(t);
    if (keys.length > 100) for (const k of keys.sort((a, b) => t[a] - t[b]).slice(0, keys.length - 100)) { if (k !== label) delete t[k]; }
    tapsRef.current = t;
    try { localStorage.setItem(TAPS_KEY, JSON.stringify(t)); } catch { /* fine */ }
  };

  // PHOTOS INTO THE CHAT — drag a picture onto the dock (or paste one) and it lands on the open
  // work: the postcard board saves it as a real material and puts it ON the pointed-at card; the
  // builder sends it into the chat. No surface open = an honest pointer, never a lost drop.
  const [dropping, setDropping] = useState(false);
  const handleFiles = async (files: FileList | File[] | null) => {
    const list = files ? [...files] : [];
    const img = list.find((f) => f.type.startsWith('image/'));
    if (!img) {
      if (list.length) setNote("That file isn't an image — pictures are what land on the work.");
      return;
    }
    if (!surfaceAcceptsFiles()) {
      setNote('Photos land on the open work — open the postcard board or the builder first, then drop it again.');
      return;
    }
    setBusy(true);
    setNote('Placing the photo…');
    const n = await offerFileToSurface(img);
    setBusy(false);
    setNote(n ?? 'Could not place the photo — the board may still be loading. Try once more in a second.');
    if (n) speak(n);
    if (list.length > 1) setNote((cur) => `${cur ?? ''}${cur ? ' ' : ''}(One photo at a time — the first one was used.)`);
  };

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
    const [{ data }, projs] = await Promise.all([
      supabase.from('knowledge_clusters').select('slug, world_id, knowledge_worlds!inner(id, title)').limit(200),
      // Builder projects become sayable doors too — a failed fetch just means no project tasks.
      supabase.from('projects').select('id, name').order('updated_at', { ascending: false }).limit(40)
        .then(({ data: p }) => (p ?? []) as { id: string; name: string }[], () => [] as { id: string; name: string }[]),
    ]);
    const byWorld = new Map<string, ConciergeWorld>();
    for (const c of (data ?? []) as unknown as { slug: string; world_id: string; knowledge_worlds: { id: string; title: string } }[]) {
      if (!c.world_id) continue;
      const w = byWorld.get(c.world_id) ?? { id: c.world_id, title: c.knowledge_worlds?.title ?? '', slugs: [] };
      w.slugs.push(c.slug);
      byWorld.set(c.world_id, w);
    }
    tasksRef.current = withProjectTasks(ALL_CONCIERGE_TASKS, projs);
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
    const missing = missingWorld ? `That business doesn't exist yet — pick or create it here, then say it again.` : null;
    setNote(missing);
    if (missing) { try { sessionStorage.setItem('ff:concierge-note', missing); } catch { /* fine */ } }
    // The Explore bridge: "explore lakefront resort branding" FALLS INTO a galaxy of the topic
    // (the page's live ?dive= mechanism), instead of landing on an empty prompt.
    const dive = task.id === 'explore' && sentence ? exploreDive(sentence) : null;
    navigate(dive ? `${route}?dive=${encodeURIComponent(dive)}` : route);
  };

  const confirmCreate = (task: ConciergeTask) => {
    if (task.genesisIntent) { try { sessionStorage.setItem(GENESIS_PREFILL_KEY, task.genesisIntent); window.dispatchEvent(new Event('ff:genesis-intent')); } catch { /* fine */ } }
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
          tasks: tasksRef.current.map(({ id, label }) => ({ id, label })),
        },
      });
      if (error || !data) { setNote(FALLBACK); return; }
      const d = data as { available?: boolean; setup?: string[]; taskId?: string | null; answer?: string | null };
      if (d.available === false) { setNote(d.setup?.[0] ?? FALLBACK); return; }
      const picked = d.taskId ? tasksRef.current.find((t) => t.id === d.taskId) ?? null : null;
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
    // The event covers the already-on-the-page case — navigate() to the same route never remounts.
    try { sessionStorage.setItem(GENESIS_PREFILL_KEY, briefText); window.dispatchEvent(new Event('ff:genesis-intent')); } catch { /* fine */ }
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

  const submit = () => {
    const raw = input.trim();
    if (!raw || busy) return;
    setInput('');
    return submitText(raw);
  };
  // The tier walk, separated from the input box so the mic's hands-free path can submit a
  // finished utterance directly (the box may already be cleared by then).
  const submitText = async (raw: string) => {
    if (!raw || busy) return;
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
    // THE SURFACE TIER — the open working surface (a creative board room, the builder) claims
    // the ask first: "make one with a lake background" acts HERE instead of navigating away.
    // Claims are conservative pure parsers, so asks for other doors fall straight through.
    const surfaceNote = offerToSurface(text);
    if (surfaceNote) {
      setSuggestions([]);
      setCompound(false);
      setNote(surfaceNote);
      speak(surfaceNote);
      inputRef.current?.focus();
      return;
    }
    // "Go back" is a browser verb, not a destination.
    if (isGoBack(text)) {
      setSuggestions([]);
      setCompound(false);
      setNote('Back you go.');
      navigate(-1);
      return;
    }
    // SMALL TALK & HALTS — chatter and stop-words get a free honest answer, never a navigation
    // guess ("never mind" must not open a project named Mind Weave) and never a metered AI call.
    const chat = smallTalk(text);
    if (chat) {
      setCompound(false);
      // A halt points at the real levers — the Queue chip is one tap.
      const queueTask = chat.kind === 'halt' ? tasksRef.current.find((t) => t.id === 'approvals') : null;
      setSuggestions(queueTask ? [queueTask] : []);
      setNote(chat.text);
      speak(chat.text);
      inputRef.current?.focus();
      return;
    }
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
    const learnedTask = learned ? tasksRef.current.find((t) => t.id === learned) : null;
    const worlds = await loadWorlds().catch(() => [] as ConciergeWorld[]);
    inputRef.current?.focus();
    if (learnedTask) {
      const { route, missingWorld } = routeFor(learnedTask, worlds);
      act(learnedTask, route, missingWorld, text);
      return;
    }
    const r = resolve(text, worlds, tasksRef.current);
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
  const micText = useRef('');
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!SpeechCtor) return;
    const rec = new SpeechCtor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    micText.current = '';
    rec.onresult = (ev) => {
      const t = Array.from(ev.results).map((r) => r[0]?.transcript ?? '').join(' ').trim();
      if (t) { setInput(t); micText.current = t; }
    };
    rec.onend = () => {
      setListening(false);
      // HANDS-FREE: with voice replies on, finishing speaking IS the submit — say it, done.
      // Voice off keeps the review-before-send behavior (the box holds the transcript).
      const t = micText.current.trim();
      micText.current = '';
      if (voiceOn && t) { setInput(''); void submitText(t); return; }
      inputRef.current?.focus();
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const task = guide ? tasksRef.current.find((t) => t.id === guide.taskId) ?? null : null;

  if (!open) {
    return (
      <button ref={(el) => { rootRef.current = el; }} onPointerDown={startDrag}
        onClick={() => { if (justDragged.current) return; setOpen(true); }}
        onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setOpen(true); } }}
        aria-label="Open the concierge — say what you want to do (drag to move it)"
        style={posStyle}
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-forge-ember/50 bg-forge-panel text-forge-ember shadow-lg transition-transform hover:scale-105">
        <MessageCircle size={19} />
      </button>
    );
  }

  const moves = rankMoves(surfaceSuggestions(), tapsRef.current);

  return (
    <div ref={(el) => { rootRef.current = el; }} style={posStyle}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => { e.preventDefault(); setDropping(false); void handleFiles(e.dataTransfer.files); }}
      className={cn('fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-forge-border bg-forge-panel p-3 shadow-2xl',
        dropping && 'border-forge-ember/70 ring-2 ring-forge-ember/40')}>
      <div className="flex items-center gap-2">
        <button onPointerDown={startDrag} onDoubleClick={redock}
          aria-label="Move the concierge — drag it anywhere; double-click to send it back to the corner"
          title="Drag to move · double-click to re-dock"
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-forge-dim hover:text-forge-ink active:cursor-grabbing">
          <GripVertical size={13} />
        </button>
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
            // A pasted IMAGE (screenshot, copied photo) lands on the work like a drop does.
            if ([...e.clipboardData.files].some((f) => f.type.startsWith('image/'))) {
              e.preventDefault();
              void handleFiles(e.clipboardData.files);
              return;
            }
            const t = e.clipboardData.getData('text');
            if (isBrief(t)) { e.preventDefault(); captureBrief(t); }
          }}
          placeholder={'"moms postcard" · "do draft an episode about rates" · "what\'s next"'}
          className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
        {SpeechCtor && (
          <button onClick={toggleMic} aria-label={listening ? 'Stop listening' : voiceOn ? 'Speak — hands-free: it runs when you stop talking' : 'Speak instead of typing'}
            className={cn('rounded-lg border px-2', listening ? 'border-forge-ember bg-forge-ember/20 text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
            <Mic size={14} />
          </button>
        )}
        <button onClick={() => void submit()} aria-label="Go" disabled={busy}
          className="rounded-lg border border-forge-ember/50 px-2.5 text-forge-ember hover:bg-forge-ember/10 disabled:opacity-50"><ArrowRight size={14} /></button>
      </div>

      {note && <p className="mt-2 whitespace-pre-line text-[11px] text-forge-dim">{note}</p>}

      {/* NEXT MOVES — tap-to-do chips for the open surface (board/builder). One tap runs the
          move through the same bridge a spoken ask uses; nothing is pasted for retyping. */}
      {moves.length > 0 && !doState && !briefText && !pendingCreate && suggestions.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {moves.map((s) => (
            <button key={s.label}
              onClick={() => { recordTap(s.label); const n = applySuggestion(s); if (n) { setNote(n); speak(n); } }}
              className="rounded-full border border-forge-border bg-forge-bg/60 px-2 py-0.5 text-[10px] text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
              {s.label}
            </button>
          ))}
        </div>
      )}

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
          <ol className="mt-1.5 list-none space-y-1 pl-0">
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
          <ol className="mt-1 list-none space-y-1 pl-0">
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
