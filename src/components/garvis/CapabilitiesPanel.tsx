// src/components/garvis/CapabilitiesPanel.tsx
// The capability registry for the Garvis page — what each app/tool can do. This is a descriptive
// catalog (distinct from the executable tool set); it tells Garvis which resource fits a task. Some
// entries aren't directly callable yet — they can still be recommended.

import { useMemo, useState } from 'react';
import { Wrench, Check, X, Plus, Github } from 'lucide-react';
import { useGarvisObjective } from '../../hooks/useGarvisObjective';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, Input } from '../ui';
import type { CapabilityMaturity, CapabilitySafety } from '../../types';

const selectCls = 'rounded border border-forge-border bg-forge-raised px-2 py-1.5 text-sm text-forge-ink';
const MATURITY_TONE: Record<CapabilityMaturity, 'dim' | 'warn' | 'ok' | 'ember'> = {
  stub: 'dim', draft: 'warn', working: 'ember', production: 'ok',
};

export function CapabilitiesPanel() {
  const { approvedCapabilities, proposedCapabilities, addCapability, approveCapability, retireCapability, seedCapabilities, seeding } = useGarvisObjective();
  const { apps } = usePortfolio();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [appId, setAppId] = useState('');
  const [safety, setSafety] = useState<CapabilitySafety>('read_only');
  const [maturity, setMaturity] = useState<CapabilityMaturity>('stub');
  const [busy, setBusy] = useState(false);

  const appName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of apps) m[a.id] = a.name;
    return m;
  }, [apps]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof approvedCapabilities> = {};
    for (const c of approvedCapabilities) {
      const key = c.app_id ? (appName[c.app_id] ?? 'App') : 'Garvis-native';
      (g[key] ??= []).push(c);
    }
    return g;
  }, [approvedCapabilities, appName]);

  const onSeed = async () => {
    try {
      const n = await seedCapabilities();
      toast(n ? 'success' : 'info', n ? `Seeded ${n} capabilities.` : 'Nothing new to seed.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Seed failed.'); }
  };

  const onAdd = async () => {
    if (!name.trim() || !desc.trim()) return;
    setBusy(true);
    try {
      await addCapability({ name: name.trim(), description: desc.trim(), app_id: appId || null, safety_level: safety, maturity });
      setName(''); setDesc(''); setAppId(''); setSafety('read_only'); setMaturity('stub');
      toast('success', 'Capability registered.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not register.'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wrench size={16} className="text-forge-ember" />
        <h2 className="font-display text-sm font-semibold">Capability registry</h2>
        <span className="text-[11px] text-forge-dim/70">What your apps/tools can do.</span>
        {approvedCapabilities.length === 0 && (
          <Button variant="ghost" className="ml-auto" onClick={onSeed} loading={seeding}><Github size={14} /> Seed known capabilities</Button>
        )}
      </div>

      {proposedCapabilities.length > 0 && (
        <div className="mb-3 space-y-2">
          {proposedCapabilities.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded border border-forge-ember/30 bg-forge-ember/5 p-2.5">
              <Badge tone="ember">proposed</Badge>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-forge-ink">{c.name}</span>
                <span className="ml-2 text-[11px] text-forge-dim">{c.description}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" onClick={() => approveCapability(c.id)} title="Approve — add to registry"><Check size={14} /></Button>
                <Button variant="ghost" onClick={() => retireCapability(c.id)} title="Reject"><X size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Object.keys(grouped).length === 0 && proposedCapabilities.length === 0 && (
          <p className="text-xs text-forge-dim">No capabilities yet — seed the known ones, or register what an app can do.</p>
        )}
        {Object.entries(grouped).map(([app, caps]) => (
          <div key={app}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-forge-dim/70">{app}</p>
            <div className="space-y-1.5">
              {caps.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded border border-forge-border p-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-forge-ink">{c.name}</span>
                    <span className="ml-2 text-[11px] text-forge-dim">{c.description}</span>
                  </div>
                  <Badge tone={MATURITY_TONE[c.maturity]}>{c.maturity}</Badge>
                  <Badge tone={c.safety_level === 'external_action' ? 'warn' : 'dim'}>{c.safety_level}</Badge>
                  {c.approval_required && <Badge tone="dim">approval</Badge>}
                  <button onClick={() => retireCapability(c.id)} className="text-forge-dim hover:text-forge-ink" title="Retire"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* register capability */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-forge-border pt-3">
        <Input className="w-44" placeholder="capability name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="min-w-[10rem] flex-1" placeholder="what it does" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <select className={selectCls} value={appId} onChange={(e) => setAppId(e.target.value)} title="Provided by">
          <option value="">Garvis-native</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={selectCls} value={safety} onChange={(e) => setSafety(e.target.value as CapabilitySafety)} title="Safety level">
          <option value="read_only">read-only</option><option value="writes_data">writes data</option><option value="external_action">external action</option>
        </select>
        <select className={selectCls} value={maturity} onChange={(e) => setMaturity(e.target.value as CapabilityMaturity)} title="Maturity">
          <option value="stub">stub</option><option value="draft">draft</option><option value="working">working</option><option value="production">production</option>
        </select>
        <Button onClick={onAdd} loading={busy}><Plus size={14} /> Register</Button>
      </div>
    </Card>
  );
}
