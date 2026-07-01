// src/components/garvis/TriagePanel.tsx
// Renders a Garvis triage report: the overall read + focus, then apps grouped by verdict
// (keep / reconsider / archive). Archive is one click behind a confirm — the founder still decides.

import { useState } from 'react';
import { X, Target, Check, HelpCircle, Archive } from 'lucide-react';
import { Badge, Button, Card } from '../ui';
import { groupVerdicts } from '../../lib/garvis/triage';
import type { TriageReport, Verdict } from '../../lib/garvis/triage';
import type { PortfolioApp, StrategicImportance } from '../../types';

interface Props {
  report: TriageReport;
  apps: PortfolioApp[];
  onArchive: (appId: string) => Promise<void> | void;
  onSetImportance: (appId: string, importance: StrategicImportance) => Promise<void> | void;
  onClose: () => void;
}

const VERDICT_META: Record<Verdict, { label: string; tone: 'ok' | 'warn' | 'dim'; icon: typeof Check }> = {
  keep: { label: 'Keep', tone: 'ok', icon: Check },
  reconsider: { label: 'Reconsider', tone: 'warn', icon: HelpCircle },
  archive: { label: 'Archive', tone: 'dim', icon: Archive },
};

export function TriagePanel({ report, apps, onArchive, onSetImportance, onClose }: Props) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const appById = (id: string) => apps.find((a) => a.id === id);
  const nameById = (id: string) => appById(id)?.name ?? 'unknown app';
  const grouped = groupVerdicts(report.verdicts);
  const focusName = report.focusAppId ? nameById(report.focusAppId) : null;

  const archive = async (appId: string) => {
    if (!window.confirm(`Archive “${nameById(appId)}”? It drops out of the active portfolio (reversible).`)) return;
    setArchivingId(appId);
    try {
      await onArchive(appId);
    } finally {
      setArchivingId(null);
    }
  };

  const order: Verdict[] = ['archive', 'reconsider', 'keep']; // lead with the decisions that matter most

  return (
    <Card className="mb-6 border-forge-ember/40 p-4">
      <div className="flex items-center gap-2">
        <Target size={16} className="shrink-0 text-forge-ember" />
        <h2 className="font-display text-sm font-semibold">Garvis triage</h2>
        <Badge tone="dim">{report.verdicts.length} apps</Badge>
        <button onClick={onClose} className="ml-auto text-forge-dim hover:text-forge-ink" title="Dismiss"><X size={14} /></button>
      </div>

      {report.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-forge-ink">{report.summary}</p>}

      {focusName && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded border border-forge-ember/40 bg-forge-ember/5 px-2 py-1 text-xs text-forge-ember">
          <Target size={12} /> Focus: <span className="font-semibold">{focusName}</span>
        </p>
      )}

      <div className="mt-3 space-y-4">
        {order.map((v) => {
          const items = grouped[v];
          if (items.length === 0) return null;
          const meta = VERDICT_META[v];
          const Icon = meta.icon;
          return (
            <div key={v}>
              <div className="mb-1.5 flex items-center gap-2">
                <Icon size={13} className="text-forge-dim" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-forge-dim">{meta.label} · {items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.appId} className="flex items-start gap-3 rounded border border-forge-border p-2.5">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-forge-ink">{nameById(item.appId)}</span>
                        {appById(item.appId)?.strategic_importance && (
                          <span className="rounded border border-forge-ember/40 px-1 py-0.5 text-[9px] uppercase tracking-wide text-forge-ember">{appById(item.appId)!.strategic_importance}</span>
                        )}
                        {item.guarded && (
                          <span className="text-[10px] text-forge-ember" title="Operational signals said otherwise; your strategic importance overrode them.">strategic override</span>
                        )}
                        {typeof item.confidence === 'number' && (
                          <span className="text-[10px] text-forge-dim/70">confidence {item.confidence.toFixed(2)}</span>
                        )}
                      </div>
                      {item.reason && <p className="mt-0.5 text-xs text-forge-dim">{item.reason}</p>}
                      {/* For unclassified apps, let Garvis's suggested importance be set in one click. */}
                      {!appById(item.appId)?.strategic_importance && item.suggestedImportance && (
                        <button
                          onClick={() => onSetImportance(item.appId, item.suggestedImportance!)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-forge-ember hover:underline"
                          title="Adopt Garvis's suggested strategic importance"
                        >
                          <Target size={10} /> Garvis suggests: {item.suggestedImportance} — set it
                        </button>
                      )}
                    </div>
                    {v === 'archive' && (
                      <Button
                        variant="ghost"
                        onClick={() => archive(item.appId)}
                        loading={archivingId === item.appId}
                        title="Archive this app (reversible)"
                      >
                        <Archive size={13} /> Archive
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-forge-dim/70">
        Garvis proposes — you decide. Archiving is reversible (set the stage back any time).
      </p>
    </Card>
  );
}
