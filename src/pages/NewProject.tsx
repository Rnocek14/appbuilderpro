import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles, LayoutDashboard, Users, Store, MessageSquare,
  GraduationCap, Home, Briefcase, ShieldCheck, ClipboardList, Compass, type LucideIcon,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { bindProjectToWorld, readWorldHandoff, clearWorldHandoff, readDurableBuildBrief, clearDurableBuildBrief, type WorldBuildHandoff } from '../lib/garvis/buildBridge';
import { useProjects } from '../hooks/useProjectData';
import { startGeneration, draftGenerationPlan, generateDesignDirections, type DesignDirection } from '../lib/aiClient';
import { DirectionPicker } from '../components/DirectionPicker';
import { useToast } from '../context/ToastContext';
import { Button, Card } from '../components/ui';
import { ModelPicker } from '../components/ModelPicker';
import { PlanCard } from '../components/PlanCard';
import { saveBrain } from '../lib/projectBrain';
import { TEMPLATES } from '../data/templates';
import { cn } from '../lib/utils';
import type { EditPlan } from '../types';

/** Serialize an approved plan into context the generator can follow. */
function planToText(plan: EditPlan): string {
  const lines = [plan.summary, ''];
  if (plan.steps.length) lines.push('Pages/features:', ...plan.steps.map((s) => `- ${s}`), '');
  if (plan.fileHints.length) lines.push('Files:', ...plan.fileHints.map((f) => `- ${f}`), '');
  if (plan.options.length) lines.push('Decisions:', ...plan.options.map((o) => `- ${o}`), '');
  return lines.join('\n').trim();
}

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Store, MessageSquare, GraduationCap, Home, Briefcase, ShieldCheck,
};

export default function NewProject() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createProject } = useProjects();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [seeded, setSeeded] = useState(false);
  // The full compiled build brief (reasoning thread + branches + research) from the Explorer. Too big
  // for a URL, so it rides in localStorage; written to the project Brain on build so it persists into
  // every future edit, and folded into the first generation so the app is built FROM the exploration.
  const briefRef = useRef('');
  const worldHandoffRef = useRef<WorldBuildHandoff | null>(null);

  // On mount: a "Build this" handoff arrives as ?from=constellation|world. It rides two channels
  // since app_0052: localStorage (same-tab fast path) and the owner's working_state row (THE
  // BATON — survives tabs, devices, and cleared caches). Consume once, clear BOTH, so a brief
  // seeds exactly one build; ?idea= remains the lightest legacy seed.
  useEffect(() => {
    const from = searchParams.get('from');
    const seedIdea = () => {
      const idea = searchParams.get('idea')?.slice(0, 2000) ?? '';
      if (idea) { setPrompt(idea); setSeeded(true); }
    };
    if (from === 'constellation' || from === 'world') {
      try {
        const raw = localStorage.getItem('ff:build-brief');
        if (raw) {
          const b = JSON.parse(raw) as { prompt?: string; brief?: string };
          localStorage.removeItem('ff:build-brief');
          clearDurableBuildBrief(); // the row staged the same brief — consumed here
          if (b.prompt) setPrompt(b.prompt);
          briefRef.current = b.brief ?? '';
          // A WORLD build additionally binds after creation: assets copied in, the manifest
          // written, provenance stamped, and the app tracked back into the world's cluster.
          if (from === 'world') worldHandoffRef.current = readWorldHandoff();
          setSeeded(true);
          return;
        }
      } catch { /* fall through to the durable row */ }
      // Durable fallback: this tab never saw the localStorage write — the row carries the baton.
      void (async () => {
        const { brief, world } = await readDurableBuildBrief().catch(() => ({ brief: null, world: null }));
        if (brief?.prompt) {
          setPrompt(brief.prompt);
          briefRef.current = brief.brief ?? '';
          if (from === 'world' && world) worldHandoffRef.current = world;
          setSeeded(true);
          clearDurableBuildBrief();
        } else {
          seedIdea();
        }
      })();
      return;
    }
    seedIdea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Prepend the compiled exploration brief (if any) to a generation's context. */
  const genCtx = (base?: string): string | undefined =>
    [briefRef.current, base].filter(Boolean).join('\n\n---\n\n') || undefined;
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Plan-first: when on, we propose a plan to approve before generating any files.
  const [planFirst, setPlanFirst] = useState(false);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickTemplate = (slug: string) => {
    const t = TEMPLATES.find((x) => x.slug === slug)!;
    setSelected(slug === selected ? null : slug);
    setPrompt(slug === selected ? '' : t.prompt);
  };

  // Design-direction picker state: 3 committed identities proposed before the build starts.
  // The picker UI appears IMMEDIATELY (skeleton cards) while directions generate in the
  // background — the user can always skip straight to building, and any failure auto-builds.
  const [directions, setDirections] = useState<DesignDirection[]>([]);
  const [directionProjectId, setDirectionProjectId] = useState<string | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsExpected, setDirectionsExpected] = useState(3);
  const skippedRef = useRef(false);

  /** Serialize the chosen direction into context the blueprint must follow exactly — INCLUDING the
   *  deterministic token bundle (radius/mode/paper tint), so the pick actually happens in the app. */
  const directionContext = (d: DesignDirection): string => [
    `DESIGN DIRECTION — the user chose "${d.name}" (${d.archetype}, ${d.risk}). Follow it EXACTLY:`,
    d.brief,
    `Set the blueprint's design fields verbatim: archetype="${d.archetype}", accentHue=${Math.round(d.accentHue)}` +
      (Number.isFinite(Number(d.accentSat)) ? `, accentSat=${Math.round(Number(d.accentSat))}` : '') +
      (Number.isFinite(Number(d.accentLight)) ? `, accentLight=${Math.round(Number(d.accentLight))}` : '') +
      `, headingFont="${d.headingFont}", bodyFont="${d.bodyFont}"` +
      (d.mode ? `, mode="${d.mode}"` : '') +
      (Number.isFinite(Number(d.surfaceSat)) ? `, surfaceSat=${Math.round(Number(d.surfaceSat))}` : '') +
      (Number.isFinite(Number(d.radius)) ? `, radius=${Number(d.radius)} (rem)` : '') +
      (d.borders ? `, borders="${d.borders}"` : '') +
      (d.shadows ? `, shadows="${d.shadows}"` : '') + '.',
    `Make design.vibe restate this direction. Every page commits to this bundle — its palette strategy, radius, surface logic, layout archetype, and motion character.`,
  ].join('\n');

  // "Show me 3 more" — reroll with the already-shown archetypes excluded, appended to the grid.
  const moreDirections = async () => {
    if (directionsLoading || !directionProjectId) return;
    setDirectionsExpected(directions.length + 3);
    setDirectionsLoading(true);
    try {
      await generateDesignDirections(prompt.trim(), (d) => {
        if (!skippedRef.current) setDirections((prev) => [...prev, d]);
      }, { exclude: directions.map((d) => d.archetype) });
    } catch { /* whatever landed stays; the picker still works */ }
    finally { if (!skippedRef.current) setDirectionsLoading(false); }
  };

  const forge = async () => {
    const text = prompt.trim();
    if (text.length < 12) return toast('error', 'Describe the app in a bit more detail — at least a sentence.');
    setBusy(true);
    try {
      const project = await createProject(text.slice(0, 60), selected ?? undefined);
      if (!project) throw new Error('Could not create the project. Check your Supabase connection.');

      // Persist the exploration brief into the project Brain — it now informs every future edit,
      // so you never have to re-explain the rabbit hole you built this from.
      if (briefRef.current) { try { await saveBrain(project.id, briefRef.current); } catch { /* best-effort */ } }

      // World build: bind the project back to its world (assets, manifest, provenance, artifact) —
      // but ONLY if the user is still building the seeded thing. If they rewrote the prompt into a
      // different app, binding the artist's photos to it would be a lie; clear and skip instead.
      if (worldHandoffRef.current) {
        if (text.trim() === worldHandoffRef.current.prompt.trim()) {
          try { await bindProjectToWorld(project.id, worldHandoffRef.current); } catch { /* best-effort */ }
        }
        clearWorldHandoff();
        worldHandoffRef.current = null;
      }

      if (planFirst) {
        // Propose a plan first — generate nothing yet.
        const { plan } = await draftGenerationPlan(text);
        setPlan(plan);
        setPlanProjectId(project.id);
        setBusy(false);
        return;
      }

      // DESIGN DIRECTIONS: show the picker at once (skeletons) and generate the 3 identities in
      // the background. Skip is always available; failure or an empty result auto-builds.
      skippedRef.current = false;
      setDirectionProjectId(project.id);
      setDirectionsLoading(true);
      setBusy(false);
      void (async () => {
        try {
          // Directions arrive one by one (parallel fan-out) — show each the moment it lands.
          const dirs = await generateDesignDirections(text, (d) => {
            if (!skippedRef.current) setDirections((prev) => [...prev, d]);
          });
          if (skippedRef.current) return; // user already skipped to the build
          if (dirs.length >= 2) {
            setDirectionsLoading(false);
            return;
          }
        } catch { /* fall through to the auto-build below */ }
        if (skippedRef.current) return;
        setDirections([]);
        setDirectionsLoading(false);
        // Couldn't produce directions (edge mode / provider error) — build without blocking.
        setBusy(true);
        try {
          await startGeneration(project.id, text, genCtx());
          navigate(`/project/${project.id}`);
        } catch (err) {
          toast('error', err instanceof Error ? err.message : 'Generation could not start.');
          setBusy(false);
        }
      })();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Generation could not start.');
      setBusy(false);
    }
  };

  // Build with the chosen direction (or without one via Skip) once the picker is up.
  const buildWithDirection = async (d: DesignDirection | null) => {
    if (!directionProjectId) return;
    skippedRef.current = d == null; // a Skip cancels any in-flight direction generation
    setBusy(true);
    try {
      await startGeneration(directionProjectId, prompt.trim(), genCtx(d ? directionContext(d) : undefined));
      navigate(`/project/${directionProjectId}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Generation could not start.');
      setBusy(false);
    }
  };

  // Approve the proposed plan and build the app, following the approved plan.
  const approveAndBuild = async () => {
    if (!planProjectId || !plan) return;
    setBusy(true);
    try {
      await startGeneration(planProjectId, prompt.trim(), genCtx(planToText(plan)));
      navigate(`/project/${planProjectId}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Generation could not start.');
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-xl font-semibold">What should we forge?</h1>
        {seeded ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-forge-ember"><Compass size={14} /> {briefRef.current ? 'Carried over from your exploration — your research, thread & variations came with it.' : 'Carried over from your exploration — shape it into an app.'}</p>
        ) : (
          <p className="mt-1 text-sm text-forge-dim">Describe the app in plain language, or heat up a template and adjust it.</p>
        )}

        <Card className="mt-5 p-4">
          <textarea
            value={prompt}
            onChange={(e) => { setPrompt(e.target.value); setSelected(null); }}
            rows={4}
            placeholder="e.g. A habit tracker with streaks, a weekly heatmap, and reminders. Clean dark UI."
            aria-label="Describe your app"
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-forge-dim/60"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ModelPicker open={pickerOpen} onToggle={setPickerOpen} />
              <span className="text-[11px] text-forge-dim">{prompt.length}/2000</span>
              <button
                type="button"
                onClick={() => setPlanFirst((v) => !v)}
                aria-pressed={planFirst}
                title="Propose a plan to review before generating any files"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  planFirst ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
                )}
              >
                <ClipboardList size={12} /> Plan first
                <span className={cn('ml-1 rounded px-1 text-[9px] font-medium', planFirst ? 'bg-forge-ember/30 text-forge-ink' : 'bg-forge-border/40 text-forge-dim')}>
                  {planFirst ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
            <Button onClick={forge} loading={busy} disabled={!prompt.trim() || directions.length > 0 || directionsLoading}>
              <Sparkles size={15} /> {planFirst ? 'Plan it' : 'Forge app'}
            </Button>
          </div>
        </Card>

        {(directions.length > 0 || directionsLoading) && (
          <div className="mt-5">
            <DirectionPicker
              directions={directions}
              loading={directionsLoading}
              expected={directionsExpected}
              busy={busy}
              onPick={(d) => void buildWithDirection(d)}
              onSkip={() => void buildWithDirection(null)}
              onMore={() => void moreDirections()}
            />
          </div>
        )}

        {plan && (
          <div className="mt-4">
            <PlanCard plan={plan} onApprove={approveAndBuild} approveLabel="Approve & build app" />
            <button
              type="button"
              onClick={() => { setPlan(null); setPlanProjectId(null); }}
              className="mt-2 text-[11px] text-forge-dim hover:text-forge-ink"
            >
              ← Discard plan and edit the prompt
            </button>
          </div>
        )}

        <h2 className="mt-8 text-xs font-medium uppercase tracking-wide text-forge-dim">Start from a template</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => {
            const Icon = ICONS[t.icon] ?? Sparkles;
            return (
              <button
                key={t.slug}
                onClick={() => pickTemplate(t.slug)}
                aria-pressed={selected === t.slug}
                className={cn(
                  'rounded-xl border p-4 text-left transition-colors',
                  selected === t.slug
                    ? 'border-forge-ember/60 bg-forge-ember/10 shadow-ember'
                    : 'border-forge-border bg-forge-panel hover:border-forge-ember/40',
                )}
              >
                <Icon size={16} className="text-forge-ember" />
                <p className="mt-2 font-display text-sm font-semibold">{t.name}</p>
                <p className="mt-0.5 text-[11px] text-forge-dim">{t.tagline}</p>
              </button>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
