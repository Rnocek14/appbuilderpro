// src/pages/Approvals.tsx
// THE approval queue — the single place consequences happen (app_0022). "Garvis prepared this.
// Approve?" Every outward-facing action (send email, publish, deploy, spend) waits here until you
// approve it; approving runs the executor and logs it to the execution ledger. This sprint wires
// send_email end-to-end; other kinds show their preview and record the decision.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, Check, X, Mail, Rocket, Globe, CreditCard, Database, Users, ScrollText } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Card, Badge, EmptyState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/utils';
import {
  listApprovals, approveAndExecute, rejectApproval, listExecutionRuns,
  type Approval, type ApprovalKind, type ExecutionRun,
} from '../lib/garvis/execution';

const KIND_META: Record<ApprovalKind, { icon: typeof Mail; label: string }> = {
  send_email: { icon: Mail, label: 'Send email' },
  publish_post: { icon: Users, label: 'Publish post' },
  deploy_site: { icon: Globe, label: 'Deploy site' },
  deploy_backend: { icon: Rocket, label: 'Deploy backend' },
  spend: { icon: CreditCard, label: 'Spend' },
  apply_migration: { icon: Database, label: 'Apply migration' },
  crm_action: { icon: Users, label: 'CRM action' },
};

export default function Approvals() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Approval[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([listApprovals('pending'), listExecutionRuns(25)]);
      setPending(p); setRuns(r);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load approvals.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const approve = async (a: Approval) => {
    setActingId(a.id);
    try {
      const res = await approveAndExecute(a);
      if (res.ok) {
        const r = res.result as { executed?: boolean; url?: string | null; needsWorkspace?: boolean; projectId?: string } | undefined;
        const executed = r?.executed !== false;
        if (a.kind === 'deploy_site' && r?.url) { toast('success', `Deployed — live at ${r.url}`); window.open(r.url, '_blank'); }
        else if (r?.needsWorkspace && r.projectId) { toast('info', 'Approved — open the project and Publish to complete (the build runs in your browser).'); navigate(`/project/${r.projectId}`); }
        else if (executed) toast('success', a.kind === 'send_email' ? 'Approved and sent.' : 'Approved and executed.');
        else toast('success', 'Approved — recorded for you to run where the capability lives.');
      } else toast('error', res.error ?? 'Execution failed — see the ledger.');
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not execute.');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (a: Approval) => {
    setActingId(a.id);
    setPending((prev) => prev.filter((x) => x.id !== a.id));
    try { await rejectApproval(a.id); toast('success', 'Rejected.'); } catch { /* optimistic */ }
    finally { setActingId(null); await refresh(); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <ShieldCheck size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Approvals</h1>
            <p className="text-sm text-forge-dim">Garvis prepared these. Nothing leaves the building until you approve it.</p>
          </div>
        </div>

        {loading ? (
          <Spinner label="Loading the queue…" />
        ) : pending.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} />} title="Queue is clear" body="When Garvis drafts an email, a deploy, or another outward action, it lands here for your sign-off." />
        ) : (
          <div className="space-y-3">
            {pending.map((a) => {
              // Defensive: an unknown kind (older row / future kind) renders generically instead
              // of throwing and blanking the whole queue.
              const meta = KIND_META[a.kind] ?? { icon: ShieldCheck, label: String(a.kind).replace(/_/g, ' ') };
              const Icon = meta.icon;
              return (
                <Card key={a.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 text-forge-ember" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-forge-ink">{a.title}</span>
                        <Badge tone="dim">{meta.label}</Badge>
                        <Badge tone="warn">{a.requested_by}</Badge>
                      </div>
                      {a.preview && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-panel/60 p-3 text-xs text-forge-dim">{a.preview}</pre>
                      )}
                      <span className="mt-1 block text-[11px] text-forge-dim">{timeAgo(a.created_at)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => void approve(a)} disabled={actingId === a.id}
                        className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-2 text-xs font-medium text-forge-ember transition-colors hover:bg-forge-ember/20 disabled:opacity-50"
                      >
                        {actingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                      </button>
                      <button
                        onClick={() => void reject(a)} disabled={actingId === a.id}
                        className="flex items-center gap-1 rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim transition-colors hover:border-forge-err/60 hover:text-forge-err disabled:opacity-50"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Execution ledger */}
        <div className="mt-10">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-forge-dim">
            <ScrollText size={14} /> Execution log
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-forge-dim">No external actions yet. Every send, deploy, and charge will be logged here.</p>
          ) : (
            <div className="space-y-1.5">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-forge-border px-3 py-2 text-xs">
                  <Badge tone={r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'err' : 'dim'}>{r.status}</Badge>
                  <span className="font-mono text-forge-dim">{r.connector}</span>
                  <span className="text-forge-ink">{r.action}</span>
                  {r.error && <span className="truncate text-forge-err">{r.error}</span>}
                  <span className="ml-auto text-forge-dim">{timeAgo(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
