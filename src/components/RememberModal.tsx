import { useEffect, useState, useSyncExternalStore } from 'react';
import { Trash2, Brain, Globe, FolderGit2 } from 'lucide-react';
import { Modal, Button } from './ui';
import { useToast } from '../context/ToastContext';
import {
  getProjectPrefs, addProjectPref, removeProjectPref,
  getGlobalPrefs, addGlobalPref, removeGlobalPref, subscribePrefs,
} from '../lib/preferences';
import { distillPreference } from '../lib/aiClient';
import { cn } from '../lib/utils';

/**
 * The "Remember" panel — feedback-triggered, visible learning. The user teaches FableForge a
 * durable rule (distilled into a clean one-liner) and chooses whether it applies to this project
 * or to all their projects. Existing rules are listed and removable, so nothing is opaque.
 */
export function RememberModal({ projectId, seed, open, onClose }: {
  projectId: string; seed?: string; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [projectPrefs, setProjectPrefs] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [saving, setSaving] = useState(false);

  // Global prefs live in localStorage — subscribe so the list reflects adds/removes live.
  useSyncExternalStore(subscribePrefs, () => getGlobalPrefs().join('|'));
  const globalPrefs = getGlobalPrefs();

  const loadProject = () => { void getProjectPrefs(projectId).then(setProjectPrefs); };
  useEffect(() => { if (open) { loadProject(); setDraft(seed ?? ''); } }, [open, projectId, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const raw = draft.trim();
    if (!raw || saving) return;
    setSaving(true);
    try {
      const rule = await distillPreference(raw);
      if (scope === 'global') addGlobalPref(rule);
      else { await addProjectPref(projectId, rule); loadProject(); }
      setDraft('');
      toast('success', "Got it — I'll remember that and apply it going forward.");
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save that preference.');
    }
    setSaving(false);
  };

  const PrefList = ({ items, onRemove, empty }: { items: string[]; onRemove: (p: string) => void; empty: string }) => (
    items.length === 0
      ? <p className="text-xs text-forge-dim">{empty}</p>
      : <ul className="space-y-1.5">
          {items.map((p) => (
            <li key={p} className="flex items-start gap-2 rounded-lg border border-forge-border bg-forge-panel px-2.5 py-1.5">
              <span className="flex-1 text-xs text-forge-ink">{p}</span>
              <button onClick={() => onRemove(p)} aria-label="Forget this" className="mt-0.5 shrink-0 text-forge-dim hover:text-forge-err">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
  );

  return (
    <Modal open={open} onClose={onClose} title="Remembered preferences">
      <div className="space-y-4">
        <p className="text-xs text-forge-dim">
          Teach FableForge a lasting rule — it's applied to every change from now on. Use it when you
          correct something ("make all dark surfaces pure black") so you don't have to repeat yourself.
        </p>

        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
            rows={2}
            placeholder="e.g. Use pure-black backgrounds everywhere in dark mode, including cards and inputs"
            className="w-full resize-none rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="flex rounded-lg border border-forge-border p-0.5">
              <button
                onClick={() => setScope('project')}
                className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                  scope === 'project' ? 'bg-forge-ember/20 text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}
              >
                <FolderGit2 size={12} /> This project
              </button>
              <button
                onClick={() => setScope('global')}
                className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                  scope === 'global' ? 'bg-forge-ember/20 text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}
              >
                <Globe size={12} /> All projects
              </button>
            </div>
            <Button size="sm" onClick={save} loading={saving} disabled={!draft.trim()} className="ml-auto">
              Remember
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-4 overflow-y-auto panel-scroll">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim">
              <FolderGit2 size={12} /> This project
            </p>
            <PrefList items={projectPrefs} onRemove={(p) => { void removeProjectPref(projectId, p).then(loadProject); }} empty="No project preferences yet." />
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim">
              <Globe size={12} /> All projects
            </p>
            <PrefList items={globalPrefs} onRemove={removeGlobalPref} empty="No global preferences yet." />
          </div>
        </div>

        <p className="flex items-center gap-1.5 border-t border-forge-border pt-3 text-[11px] text-forge-dim">
          <Brain size={12} /> These are injected into every edit so the assistant honors them automatically.
        </p>
      </div>
    </Modal>
  );
}
