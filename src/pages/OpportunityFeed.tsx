// src/pages/OpportunityFeed.tsx  (/garvis/opportunity-feed)
// THE OPPORTUNITY FEED — where the hunts' catches land for triage. Every card is a REAL item an
// extraction pass pulled from a page the hunt actually fetched (budget/deadline/location shown
// only when the page stated them — null means "the page didn't say", never a guess). Triage is
// the operator's move: save it, dismiss it, mark it applied. The Application Composer (next
// engine) will attach "draft the application" right here.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, ExternalLink, Bookmark, X, Check, RotateCcw, Loader2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/utils';

interface Opportunity {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  kind: string;
  location: string | null;
  budget_text: string | null;
  deadline_text: string | null;
  status: 'new' | 'saved' | 'dismissed' | 'applied';
  found_at: string;
}

const TABS = ['new', 'saved', 'applied', 'dismissed'] as const;

// Friendly badge labels for the kind enum (raw values like 'inbound_automation_request' read as
// machine text); unknown kinds fall back to a de-slugged form.
const KIND_LABELS: Record<string, string> = {
  'inbound_automation_request': 'Automation request', 'public-art': 'Public art',
  mural: 'Mural', grant: 'Grant', commission: 'Commission', job: 'Job', other: 'Other',
};
const kindLabel = (k: string): string => KIND_LABELS[k] ?? k.replace(/[-_]/g, ' ');

export default function OpportunityFeed() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('new');

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('opportunities')
      .select('*').order('found_at', { ascending: false }).limit(200);
    if (error) { setRows([]); return; }
    setRows((data as Opportunity[]) ?? []);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const setStatus = async (id: string, status: Opportunity['status']) => {
    const { error } = await supabase.from('opportunities').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast('error', `Could not update: ${error.message}`); return; }
    await refresh();
  };

  const visible = (rows ?? []).filter((r) => r.status === tab);
  const counts = TABS.map((t) => (rows ?? []).filter((r) => r.status === t).length);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Crosshair size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Opportunity feed</h1>
            <p className="text-sm text-forge-dim">What the hunts found — jobs, RFPs, grants, commissions. Every card came from a page the hunt actually read; blank fields mean the page didn't say.</p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-1">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                tab === t ? 'bg-forge-ember/10 text-forge-ember' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink')}
            >
              {t}{counts[i] > 0 && <span className="ml-1 text-[10px] text-forge-dim">({counts[i]})</span>}
            </button>
          ))}
        </div>

        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading the feed…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forge-border p-6 text-center">
            <p className="text-sm font-medium text-forge-ink">{tab === 'new' ? 'No new opportunities yet' : `Nothing ${tab}`}</p>
            {tab === 'new' && (
              <p className="mx-auto mt-1 max-w-md text-xs text-forge-dim">
                Start a hunt from <Link to="/garvis/orchestrate" className="text-forge-ember hover:underline">Orchestrate</Link> — e.g. "find all mural and custom art jobs" — and its daily sweeps will fill this feed. Hunts need SERPER_API_KEY and the armed heartbeat (<Link to="/garvis/health" className="text-forge-ember hover:underline">Health</Link>).
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((o) => (
              <li key={o.id} className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={o.source_url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-forge-ink hover:text-forge-ember">
                        {o.title} <ExternalLink size={11} className="inline text-forge-dim" />
                      </a>
                      <Badge tone="ember">{kindLabel(o.kind)}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-forge-dim">{o.summary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-forge-dim">
                      {o.location && <span>📍 {o.location}</span>}
                      {o.budget_text && <span>💰 {o.budget_text}</span>}
                      {o.deadline_text && <span>⏳ {o.deadline_text}</span>}
                      <span className="text-forge-dim/60">found {timeAgo(o.found_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {o.status !== 'saved' && o.status !== 'applied' && (
                      <button title="Save" onClick={() => setStatus(o.id, 'saved')} className="rounded-md p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-ember"><Bookmark size={14} /></button>
                    )}
                    {o.status !== 'applied' && (
                      <button title="Mark applied" onClick={() => setStatus(o.id, 'applied')} className="rounded-md p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-ok"><Check size={14} /></button>
                    )}
                    {o.status !== 'dismissed' ? (
                      <button title="Dismiss" onClick={() => setStatus(o.id, 'dismissed')} className="rounded-md p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-err"><X size={14} /></button>
                    ) : (
                      <button title="Restore to new" onClick={() => setStatus(o.id, 'new')} className="rounded-md p-1.5 text-forge-dim hover:bg-forge-raised hover:text-forge-ink"><RotateCcw size={14} /></button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
