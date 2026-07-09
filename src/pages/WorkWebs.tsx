// src/pages/WorkWebs.tsx
// The Work Webs index — every mission is a living work web (a territory that decomposes into
// chartered production areas). This is the gallery: open an existing web, or spin one up from a
// template. Mom Real Estate is the flagship; App Launch proves the same machine runs anything.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Waypoints, Loader2, ArrowRight, Building2, Rocket, Plus, Orbit, Telescope, Sparkles, X, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Card, Badge, EmptyState, Spinner, Button } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/utils';
import { WEB_TEMPLATES, ARCHETYPES, flattenTemplate } from '../lib/garvis/workweb';
import { listWebs, instantiateWeb, type WebSummary } from '../lib/garvis/workwebRun';
import { generateDraft, listDrafts, approveDraft, discardDraft, removeDraftNode, type DraftRow } from '../lib/garvis/genesisRun';

const TEMPLATE_ICON: Record<string, typeof Building2> = { 'mom-real-estate': Building2, 'app-launch': Rocket };

export default function WorkWebs() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [webs, setWebs] = useState<WebSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [genesisWarnings, setGenesisWarnings] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [w, d] = await Promise.all([listWebs(), listDrafts().catch(() => [] as DraftRow[])]);
      setWebs(w); setDrafts(d);
    }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not load webs.'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const draftIt = async () => {
    setDrafting(true);
    setGenesisWarnings([]);
    try {
      const r = await generateDraft(intent);
      if (!r.id) { toast('error', r.problems[0] ?? 'Genesis could not design that web.'); setGenesisWarnings(r.warnings); return; }
      setIntent('');
      setGenesisWarnings(r.warnings);
      toast('success', `Drafted "${r.draft?.title}" — review it below. Nothing exists until you approve.`);
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Genesis failed.');
    } finally {
      setDrafting(false);
    }
  };

  const create = async (templateId: string) => {
    setCreating(templateId);
    try {
      const web = await instantiateWeb(templateId);
      toast('success', `Created "${web.title}".`);
      navigate(`/garvis/webs/${web.worldId}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not create the web.');
      setCreating(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Waypoints size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Work Webs</h1>
            <p className="text-sm text-forge-dim">A mission isn't a checklist — it's a living territory. Every area is a workspace with its own tools.</p>
          </div>
          <button
            onClick={() => navigate('/garvis/universe')}
            title="Universe altitude — every world in one sky, the x-ray of Garvis's living memory"
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
          ><Telescope size={13} /> Universe</button>
        </div>

        {/* Genesis — describe a mission; Garvis synthesizes the DNA, then designs the web.
            Drafts are proposals: nothing becomes a world until approved. */}
        <Card className="mb-8 p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-forge-ember" />
            <h2 className="text-sm font-semibold text-forge-ink">Start from intent</h2>
            <span className="text-xs text-forge-dim">— describe the business or mission; Garvis designs the work web and shows you why</span>
          </div>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={2}
            placeholder={'e.g. "Build a full business system for my artist brother — he makes sculptures, murals, and custom pieces, and needs a portfolio site, buyers, and outreach."'}
            className="mt-3 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={() => void draftIt()} loading={drafting} disabled={intent.trim().length < 12}>
              {drafting ? 'Synthesizing…' : 'Draft the web'}
            </Button>
            <span className="text-[11px] text-forge-dim">Two passes: business DNA first, then the web — every area arrives with its reason.</span>
          </div>
          {genesisWarnings.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {genesisWarnings.map((w) => <li key={w} className="text-[11px] text-forge-warn/90">⚠ {w}</li>)}
            </ul>
          )}
        </Card>

        {/* Drafts awaiting review */}
        {drafts.map((d) => (
          <DraftReview
            key={d.id}
            draft={d}
            onApprove={async () => {
              try {
                const web = await approveDraft(d.id);
                toast('success', `Created "${web.title}".`);
                navigate(`/garvis/webs/${web.worldId}`);
              } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not create the world.'); }
            }}
            onDiscard={async () => { await discardDraft(d.id); toast('info', 'Draft discarded.'); await refresh(); }}
            onRemoveNode={async (slug) => { await removeDraftNode(d.id, slug); await refresh(); }}
          />
        ))}

        {/* Existing webs */}
        {loading ? (
          <Spinner label="Loading your webs…" />
        ) : webs.length === 0 ? (
          <EmptyState icon={<Waypoints size={20} />} title="No webs yet" body="Spin one up from a template below — Garvis lays out the whole territory and its tools." />
        ) : (
          <div className="mb-10 grid gap-3 sm:grid-cols-2">
            {webs.map((w) => (
              <Card key={w.worldId} interactive>
                <div className="flex w-full items-center gap-3 p-4">
                  <button onClick={() => navigate(`/garvis/webs/${w.worldId}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Waypoints size={18} className="shrink-0 text-forge-ember" />
                    <span className="flex-1 truncate font-medium text-forge-ink">{w.title}</span>
                  </button>
                  <button
                    onClick={() => navigate(`/garvis/system/${w.worldId}`)}
                    title="System altitude — the orbital view of this world"
                    className="shrink-0 text-forge-dim transition-colors hover:text-forge-ember"
                  ><Orbit size={16} /></button>
                  <ArrowRight size={16} className="shrink-0 text-forge-dim" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Templates */}
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-forge-dim">Start a new web</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {WEB_TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICON[t.id] ?? Plus;
            return (
              <Card key={t.id} className="flex flex-col p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Icon size={18} className="text-forge-ember" />
                  <span className="font-medium text-forge-ink">{t.title}</span>
                  {t.playIds.length > 0 && <Badge tone="ember">{t.playIds.length} play{t.playIds.length === 1 ? '' : 's'}</Badge>}
                </div>
                <p className="flex-1 text-sm text-forge-dim">{t.description}</p>
                <button
                  onClick={() => void create(t.id)} disabled={creating !== null}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-2 text-sm font-medium text-forge-ember transition-colors hover:bg-forge-ember/20 disabled:opacity-50"
                >
                  {creating === t.id ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Create web
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

/** A generated draft, laid out for judgment: the DNA it derived, every area WITH ITS WHY, what
 *  was deliberately left out, what genesis refused to invent (questions), and what it wants
 *  uploaded. Approve creates the world through the same validated path as the builtins. */
function DraftReview({ draft, onApprove, onDiscard, onRemoveNode }: {
  draft: DraftRow;
  onApprove: () => Promise<void>;
  onDiscard: () => Promise<void>;
  onRemoveNode: (slug: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<'approve' | 'discard' | null>(null);
  const flat = flattenTemplate(draft.template);
  const dna = draft.dna;
  const act = (kind: 'approve' | 'discard', fn: () => Promise<void>) => async () => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  };
  return (
    <Card className="mb-8 border-forge-ember/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-forge-ember" />
        <h3 className="font-semibold text-forge-ink">{draft.title}</h3>
        <Badge tone="ember">draft — nothing created yet</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={act('discard', onDiscard)} loading={busy === 'discard'}>Discard</Button>
          <Button onClick={act('approve', onApprove)} loading={busy === 'approve'}><Check size={14} /> Approve & create</Button>
        </div>
      </div>
      {draft.objective && <p className="mt-1 text-sm text-forge-dim">{draft.objective}</p>}

      {dna && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[dna.businessType, dna.revenueModel, dna.salesCycle, dna.brandPersonality].filter(Boolean).map((v) => (
            <span key={v as string} className="rounded-lg border border-forge-border px-2 py-0.5 text-[11px] text-forge-dim">{v}</span>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Areas, each with its why */}
        <div className="space-y-1.5">
          {flat.map((n) => {
            const meta = ARCHETYPES[n.charter.archetype];
            const why = draft.rationale.clusters[n.slug];
            return (
              <div key={n.slug} className="group rounded-lg border border-forge-border px-3 py-2" style={{ marginLeft: n.depth * 16 }}>
                <div className="flex items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.tone === 'ember' && 'bg-forge-ember', meta.tone === 'ok' && 'bg-forge-ok', meta.tone === 'warn' && 'bg-forge-warn', meta.tone === 'dim' && 'bg-forge-dim/50')} />
                  <span className="text-sm font-medium text-forge-ink">{n.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-forge-dim">{meta.label}</span>
                  <button
                    onClick={() => void onRemoveNode(n.slug)}
                    title="Remove this area from the draft"
                    className="ml-auto text-forge-dim/40 opacity-0 transition-opacity hover:text-forge-warn group-hover:opacity-100"
                  ><X size={13} /></button>
                </div>
                {why && <p className="mt-0.5 text-xs text-forge-dim">{why}</p>}
              </div>
            );
          })}
        </div>

        {/* The judgment panel: omissions, questions, intake, first moves */}
        <div className="space-y-3 text-xs">
          {draft.rationale.omissions.length > 0 && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-forge-dim">Deliberately left out</p>
              {draft.rationale.omissions.map((o) => (
                <p key={o.what} className="text-forge-dim"><span className="text-forge-ink/80">{o.what}</span> — {o.why}</p>
              ))}
            </div>
          )}
          {draft.questions.length > 0 && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-forge-dim">Garvis didn't invent these — answer when you can</p>
              <ul className="list-inside list-disc space-y-0.5 text-forge-ink/80">
                {draft.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
          {draft.intake_requests.length > 0 && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-forge-dim">Worth uploading</p>
              <ul className="list-inside list-disc space-y-0.5 text-forge-dim">
                {draft.intake_requests.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
          {draft.first_moves.length > 0 && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-forge-dim">First moves after approval</p>
              <ul className="list-inside list-disc space-y-0.5 text-forge-dim">
                {draft.first_moves.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
