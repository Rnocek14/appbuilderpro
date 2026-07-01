import { useEffect, useState, useSyncExternalStore } from 'react';
import { Cpu, KeyRound, ExternalLink, Check } from 'lucide-react';
import { Button } from './ui';
import {
  PROVIDERS, providerInfo, resolveAI, subscribeAIConfig,
  getProvider, getModel, getKey, setProvider, setModel, setKey, DIRECT,
  type Provider,
} from '../lib/aiConfig';
import { spendForProvider, spendTotals, subscribeUsage, formatUSD } from '../lib/usage';
import { cn } from '../lib/utils';

/** Subscribe a component to AI-config changes so the whole UI reflects the active model. */
function useAIConfig() {
  return useSyncExternalStore(subscribeAIConfig, () => resolveAI().provider + '|' + resolveAI().model + '|' + (resolveAI().ready ? '1' : '0'));
}

/**
 * Compact "coding model" picker — choose which provider + model writes the code, and paste
 * the matching API key. Used in the chat toolbar. The selection is global (stored in
 * localStorage) and applies to the next message. In edge/production mode keys are server
 * secrets, so this only drives the local DIRECT path.
 */
export function ModelPicker({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  useAIConfig(); // re-render on change
  const provider = getProvider();
  const info = providerInfo(provider);
  const model = getModel(provider);
  const ai = resolveAI();

  // The key is edited as a draft and committed with Save, so a half-typed key is never stored
  // and the user gets explicit confirmation it persisted. Reset the draft when provider changes.
  const [keyDraft, setKeyDraft] = useState(getKey(provider));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setKeyDraft(getKey(provider)); setSaved(false); }, [provider]);
  const dirty = keyDraft.trim() !== getKey(provider);
  const saveKey = () => { setKey(provider, keyDraft.trim()); setSaved(true); };

  // Running spend (estimates) — re-renders when the usage ledger changes.
  const spend = useSyncExternalStore(subscribeUsage, () => `${spendForProvider(provider)}|${spendTotals().total}`);
  const [providerSpend, totalSpend] = spend.split('|').map(Number);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        title="Choose the AI model that writes your code"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
          ai.ready
            ? 'border-forge-border text-forge-dim hover:text-forge-ink hover:border-forge-ember/50'
            : 'border-forge-err/50 bg-forge-err/10 text-forge-err',
        )}
      >
        <Cpu size={12} />
        <span className="max-w-[160px] truncate font-mono">{model}</span>
        {!ai.ready && <span className="ml-0.5">· key needed</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onToggle(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-forge-border bg-forge-panel p-3 shadow-2xl">
            <p className="mb-2 text-xs font-medium text-forge-ink">Coding model</p>

            <label className="mb-1 block text-[10px] uppercase tracking-wide text-forge-dim">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <label className="mb-1 mt-3 block text-[10px] uppercase tracking-wide text-forge-dim">Model</label>
            <input
              value={model}
              list={`models-${provider}`}
              onChange={(e) => setModel(provider, e.target.value)}
              placeholder={info.defaultModel}
              className="w-full rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 font-mono text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none"
            />
            <datalist id={`models-${provider}`}>
              {info.models.map((m) => <option key={m} value={m} />)}
            </datalist>

            {info.needsKey && (
              <>
                <label className="mb-1 mt-3 flex items-center gap-1 text-[10px] uppercase tracking-wide text-forge-dim">
                  <KeyRound size={10} /> API key
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => { setKeyDraft(e.target.value); setSaved(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveKey(); }}
                    placeholder={info.keyPlaceholder}
                    autoComplete="off"
                    className="w-full rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 font-mono text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none"
                  />
                  <Button size="sm" onClick={saveKey} disabled={!dirty} className="shrink-0 px-2 py-1.5">
                    {saved && !dirty ? <Check size={12} /> : 'Save'}
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <a
                    href={info.keysUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-forge-dim hover:text-forge-ember"
                  >
                    Get a {info.label.split(' ')[0]} key <ExternalLink size={9} />
                  </a>
                  {saved && !dirty && <span className="text-[10px] text-forge-ok">Saved ✓</span>}
                </div>
              </>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-forge-border pt-2 text-[10px] text-forge-dim">
              <span title="Estimated spend, this browser">Spent on {info.label.split(' ')[0]}: <span className="font-mono text-forge-ink">~{formatUSD(providerSpend)}</span></span>
              <span title="Estimated spend across all providers, this browser">All: <span className="font-mono">~{formatUSD(totalSpend)}</span></span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-forge-dim">
              {ai.ready ? 'Applies to your next message.' : 'Add a key to use this provider.'}
              {!DIRECT && ' (Edge mode: live calls use the server-side key; this picker is for local/direct mode.)'}
              {' '}Costs are estimates.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
