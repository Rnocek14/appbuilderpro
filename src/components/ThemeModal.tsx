import { useState } from 'react';
import { Check, Palette, Moon, Sparkles } from 'lucide-react';
import { Modal, Button } from './ui';
import { useToast } from '../context/ToastContext';
import { THEME_PRESETS } from '../lib/themePresets';
import { applyThemePreset } from '../lib/aiClient';
import { cn } from '../lib/utils';

/**
 * Theme panel: pick a curated color preset. Applying one first tokenizes the app's colors
 * (deterministically, so it actually recolors the whole app) and then writes the palette —
 * one click = convert + recolor. The separate action adds a light/dark toggle to the header.
 */
export function ThemeModal({ projectId, open, onClose, onApplied, onConvert, onPolish }: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Called after a preset is applied so the workspace can refresh files/preview. */
  onApplied: () => void;
  /** Add a light/dark toggle to the header (kicks off a small chat edit). */
  onConvert: () => void;
  /** Run an AI design-polish pass (spacing/hierarchy/consistency) on the app. */
  onPolish: () => void;
}) {
  const { toast } = useToast();
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const apply = async (presetId: string) => {
    if (applying) return;
    setApplying(presetId);
    try {
      const { name, changed } = await applyThemePreset(projectId, presetId);
      setAppliedId(presetId);
      onApplied();
      toast('success', changed
        ? `${name} applied — converted ${changed} file${changed === 1 ? '' : 's'} to theme tokens.`
        : `${name} theme applied.`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not apply that theme.');
    }
    setApplying(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Theme">
      <div className="space-y-4">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-forge-ink">
            <Palette size={14} /> Color theme
          </p>
          <p className="text-xs text-forge-dim">
            Pick a palette — it converts the app to theme tokens and recolors everything (surfaces,
            borders, text, accent). Each works in light and dark. Give the preview a second to repaint.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => apply(p.id)}
                disabled={!!applying}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-60',
                  appliedId === p.id ? 'border-forge-ember bg-forge-ember/10' : 'border-forge-border hover:border-forge-ember/50',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full border border-black/10">
                  <span className="h-full w-1/2" style={{ backgroundColor: p.swatch[0] }} />
                  <span className="h-full w-1/2" style={{ backgroundColor: p.swatch[1] }} />
                </span>
                <span className="flex-1 truncate text-forge-ink">{p.name}</span>
                {applying === p.id
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-forge-dim border-t-transparent" />
                  : appliedId === p.id && <Check size={13} className="text-forge-ember" />}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-forge-border pt-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-forge-ink">
            <Moon size={14} /> Dark / light toggle
          </p>
          <p className="text-xs text-forge-dim">
            Add a sun/moon toggle to the app's header so users can switch between light and dark.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => { onConvert(); onClose(); }}>
            Add dark / light toggle
          </Button>
        </div>

        <div className="border-t border-forge-border pt-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-forge-ink">
            <Sparkles size={14} /> Make it prettier
          </p>
          <p className="text-xs text-forge-dim">
            A theme sets colors, not layout. This runs a design pass — spacing, hierarchy, headers,
            cards, consistent sizing — to make the app look polished and modern (keeps your features).
          </p>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => { onPolish(); onClose(); }}>
            Polish the design
          </Button>
        </div>
      </div>
    </Modal>
  );
}
