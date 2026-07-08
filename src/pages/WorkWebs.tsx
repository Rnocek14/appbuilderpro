// src/pages/WorkWebs.tsx
// The Work Webs index — every mission is a living work web (a territory that decomposes into
// chartered production areas). This is the gallery: open an existing web, or spin one up from a
// template. Mom Real Estate is the flagship; App Launch proves the same machine runs anything.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Waypoints, Loader2, ArrowRight, Building2, Rocket, Plus, Orbit } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Card, Badge, EmptyState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { WEB_TEMPLATES } from '../lib/garvis/workweb';
import { listWebs, instantiateWeb, type WebSummary } from '../lib/garvis/workwebRun';

const TEMPLATE_ICON: Record<string, typeof Building2> = { 'mom-real-estate': Building2, 'app-launch': Rocket };

export default function WorkWebs() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [webs, setWebs] = useState<WebSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setWebs(await listWebs()); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not load webs.'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

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
        </div>

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
