import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Users, Activity, FileWarning, ScrollText, Cpu } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Card, StatCard, Spinner, EmptyState } from '../../components/ui';
import type { Profile, Generation, UsageEvent } from '../../types';
import { formatUsd, formatTokens, timeAgo, cn } from '../../lib/utils';

type Tab = 'users' | 'usage' | 'failures' | 'logs' | 'models';

interface ErrorLog { id: string; source: string; message: string; created_at: string }
interface AuditLog { id: string; action: string; entity_type: string; created_at: string }

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<UsageEvent[]>([]);
  const [failures, setFailures] = useState<Generation[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [model, setModel] = useState<{ provider: string; model: string }>({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [u, ev, f, er, au, st] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('usage_events').select('*').gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()),
        supabase.from('project_generations').select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(25),
        supabase.from('error_logs').select('id, source, message, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('audit_logs').select('id, action, entity_type, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('platform_settings').select('value').eq('key', 'default_model').single(),
      ]);
      setUsers((u.data as Profile[]) ?? []);
      setUsage((ev.data as UsageEvent[]) ?? []);
      setFailures((f.data as Generation[]) ?? []);
      setErrors((er.data as ErrorLog[]) ?? []);
      setAudits((au.data as AuditLog[]) ?? []);
      if (st.data?.value) setModel(st.data.value as { provider: string; model: string });
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => ({
    cost: usage.reduce((s, e) => s + Number(e.cost_usd), 0),
    tokens: usage.reduce((s, e) => s + e.input_tokens + e.output_tokens, 0),
    events: usage.length,
  }), [usage]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: string; cost: number; events: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(5, 10);
      byDay.set(d, { day: d, cost: 0, events: 0 });
    }
    for (const e of usage) {
      const d = e.created_at.slice(5, 10);
      const row = byDay.get(d);
      if (row) { row.cost += Number(e.cost_usd); row.events += 1; }
    }
    return [...byDay.values()];
  }, [usage]);

  const setPlan = async (userId: string, plan: 'free' | 'pro') => {
    const limit = plan === 'pro' ? 500 : 10;
    const { error } = await supabase.from('profiles')
      .update({ plan, monthly_generation_limit: limit }).eq('id', userId);
    if (error) return toast('error', error.message);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, plan, monthly_generation_limit: limit } : x)));
    await supabase.from('audit_logs').insert({
      actor_id: profile!.id, action: 'user.plan_change', entity_type: 'profile', entity_id: userId, metadata: { plan },
    });
    toast('success', `Plan set to ${plan}.`);
  };

  const setRole = async (userId: string, role: 'user' | 'admin') => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) return toast('error', error.message);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, role } : x)));
    await supabase.from('audit_logs').insert({
      actor_id: profile!.id, action: 'user.role_change', entity_type: 'profile', entity_id: userId, metadata: { role },
    });
    toast('success', `Role set to ${role}.`);
  };

  const saveModel = async () => {
    const { error } = await supabase.from('platform_settings')
      .update({ value: model, updated_by: profile!.id, updated_at: new Date().toISOString() })
      .eq('key', 'default_model');
    if (error) toast('error', error.message);
    else toast('success', 'Default model saved. Edge functions read it on the next generation.');
  };

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'usage', label: 'Usage & cost', icon: Activity },
    { id: 'failures', label: 'Failed generations', icon: FileWarning },
    { id: 'logs', label: 'Logs', icon: ScrollText },
    { id: 'models', label: 'Model settings', icon: Cpu },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-xl font-semibold">Admin</h1>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-forge-border" role="tablist" aria-label="Admin sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm',
                tab === id ? 'text-forge-ink ember-seam' : 'text-forge-dim hover:text-forge-ink',
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Loading admin data…" /></div>
        ) : (
          <div className="mt-5">
            {tab === 'users' && (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forge-border text-left text-xs uppercase tracking-wide text-forge-dim">
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-forge-border/50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{u.full_name || '—'}</p>
                          <p className="text-xs text-forge-dim">{u.email}</p>
                        </td>
                        <td className="px-4 py-3"><Badge tone={u.plan === 'pro' ? 'ember' : 'dim'}>{u.plan}</Badge></td>
                        <td className="px-4 py-3"><Badge tone={u.role === 'admin' ? 'warn' : 'dim'}>{u.role}</Badge></td>
                        <td className="px-4 py-3 text-xs text-forge-dim">{timeAgo(u.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setPlan(u.id, u.plan === 'pro' ? 'free' : 'pro')}>
                              {u.plan === 'pro' ? 'Downgrade' : 'Make Pro'}
                            </Button>
                            {u.id !== profile?.id && (
                              <Button size="sm" variant="ghost" onClick={() => setRole(u.id, u.role === 'admin' ? 'user' : 'admin')}>
                                {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {tab === 'usage' && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard label="AI cost (30d)" value={formatUsd(totals.cost)} />
                  <StatCard label="Tokens (30d)" value={formatTokens(totals.tokens)} />
                  <StatCard label="Events (30d)" value={String(totals.events)} />
                </div>
                <Card className="mt-4 p-4">
                  <p className="mb-3 text-xs uppercase tracking-wide text-forge-dim">Daily AI cost</p>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <AreaChart data={chartData}>
                        <XAxis dataKey="day" stroke="#8B90A0" fontSize={10} tickLine={false} />
                        <YAxis stroke="#8B90A0" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ background: '#1A1E29', border: '1px solid #262B3A', borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => [formatUsd(v), 'cost']}
                        />
                        <Area type="monotone" dataKey="cost" stroke="#FF8A3D" fill="rgba(255,138,61,0.15)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </>
            )}

            {tab === 'failures' && (
              failures.length === 0 ? (
                <EmptyState icon={<FileWarning size={26} />} title="No failed generations" body="When a pipeline run fails, it lands here with its error and prompt." />
              ) : (
                <div className="space-y-2">
                  {failures.map((g) => (
                    <Card key={g.id} className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge tone="err">failed</Badge>
                        <span className="text-xs text-forge-dim">{timeAgo(g.created_at)} · {g.kind}</span>
                      </div>
                      <p className="mt-2 line-clamp-1 text-sm">{g.prompt}</p>
                      <pre className="mt-2 max-h-20 overflow-auto panel-scroll whitespace-pre-wrap rounded bg-forge-bg p-2 font-mono text-[11px] text-forge-err">{g.error}</pre>
                    </Card>
                  ))}
                </div>
              )
            )}

            {tab === 'logs' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-forge-dim">Error logs</p>
                  <ul className="max-h-96 space-y-1.5 overflow-y-auto panel-scroll">
                    {errors.length === 0 && <li className="py-4 text-center text-xs text-forge-dim">Quiet so far — no errors recorded.</li>}
                    {errors.map((e) => (
                      <li key={e.id} className="rounded border border-forge-border/60 p-2 text-xs">
                        <span className="font-mono text-forge-err">[{e.source}]</span>{' '}
                        <span className="text-forge-dim">{timeAgo(e.created_at)}</span>
                        <p className="mt-1 line-clamp-2">{e.message}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-forge-dim">Audit trail</p>
                  <ul className="max-h-96 space-y-1.5 overflow-y-auto panel-scroll">
                    {audits.length === 0 && <li className="py-4 text-center text-xs text-forge-dim">Actions like plan changes and project creation appear here.</li>}
                    {audits.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 rounded border border-forge-border/60 p-2 text-xs">
                        <span className="font-mono text-forge-ember">{a.action}</span>
                        <span className="text-forge-dim">{a.entity_type}</span>
                        <span className="ml-auto text-forge-dim">{timeAgo(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {tab === 'models' && (
              <Card className="max-w-md p-5">
                <p className="text-sm font-medium">Default generation model</p>
                <p className="mt-1 text-xs text-forge-dim">
                  Stored in <code className="font-mono">platform_settings</code>. Edge functions fall back to their
                  environment config if unset.
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-forge-dim" htmlFor="provider">Provider</label>
                    <select
                      id="provider"
                      value={model.provider}
                      onChange={(e) => setModel((m) => ({ ...m, provider: e.target.value }))}
                      className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm"
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="local">Local endpoint</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-forge-dim" htmlFor="model">Model id</label>
                    <input
                      id="model"
                      value={model.model}
                      onChange={(e) => setModel((m) => ({ ...m, model: e.target.value }))}
                      className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <Button onClick={saveModel}>Save model settings</Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
