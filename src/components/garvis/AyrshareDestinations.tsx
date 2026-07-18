// src/components/garvis/AyrshareDestinations.tsx
// Per-business social destinations: map each business to its own Ayrshare Profile-Key so its
// posts land on ITS accounts, not whatever the one connection defaults to. Renders under the
// connected Ayrshare card. The rule (enforced server-side in social-publish): zero mappings =
// everything posts through the one connected account; once ANY mapping exists, a business
// without one BLOCKS at publish rather than posting to the wrong brand.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listWorlds, type WorldOption } from '../../lib/garvis/brain';
import {
  listWorldSocialProfiles, setWorldSocialProfile, clearWorldSocialProfile,
} from '../../lib/garvis/socialRun';
import { useToast } from '../../context/ToastContext';
import { Button, Input } from '../ui';

export function AyrshareDestinations() {
  const { toast } = useToast();
  const [worlds, setWorlds] = useState<WorldOption[] | null>(null);
  const [mapped, setMapped] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [ws, profiles] = await Promise.all([listWorlds(), listWorldSocialProfiles()]);
        setWorlds(ws);
        setMapped(Object.fromEntries(profiles.map((p) => [p.world_id, p.profile_key])));
      } catch { setWorlds([]); }
    })();
  }, [open]);

  const save = async (worldId: string) => {
    setBusyId(worldId);
    try {
      await setWorldSocialProfile(worldId, drafts[worldId] ?? '');
      setMapped((m) => ({ ...m, [worldId]: (drafts[worldId] ?? '').trim() }));
      setDrafts((d) => ({ ...d, [worldId]: '' }));
      toast('success', 'Destination mapped — this business now posts to its own accounts.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not save the mapping.'); }
    finally { setBusyId(null); }
  };

  const clear = async (worldId: string) => {
    setBusyId(worldId);
    try {
      await clearWorldSocialProfile(worldId);
      setMapped((m) => { const n = { ...m }; delete n[worldId]; return n; });
      toast('info', 'Mapping removed.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove the mapping.'); }
    finally { setBusyId(null); }
  };

  const mappedCount = Object.keys(mapped).length;

  return (
    <div className="mt-2 border-t border-forge-border pt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-[11px] text-forge-dim hover:text-forge-ink">
        {open ? '▾' : '▸'} Per-business destinations{mappedCount > 0 ? ` (${mappedCount} mapped)` : ''}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-forge-dim">
            Running more than one brand? On Ayrshare's multi-client plan each brand gets a Profile-Key —
            map it here and that business's posts go to its own linked accounts. Once any business is
            mapped, an unmapped business's posts are blocked at publish instead of landing on the wrong
            brand. Leave everything unmapped to keep posting through the one connected account.
          </p>
          {worlds === null ? (
            <Loader2 size={13} className="animate-spin text-forge-dim" />
          ) : worlds.length === 0 ? (
            <p className="text-[11px] text-forge-dim">No businesses yet — create one first.</p>
          ) : worlds.map((w) => (
            <div key={w.id} className="flex items-center gap-2">
              <span className="w-36 shrink-0 truncate text-[11px] text-forge-ink" title={w.title}>{w.title}</span>
              {mapped[w.id] ? (
                <>
                  <span className="flex-1 truncate font-mono text-[11px] text-forge-dim">{mapped[w.id].slice(0, 8)}…</span>
                  <Button size="sm" variant="outline" loading={busyId === w.id} onClick={() => void clear(w.id)}>Remove</Button>
                </>
              ) : (
                <>
                  <Input type="password" placeholder="Profile-Key for this business"
                    value={drafts[w.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [w.id]: e.target.value }))} />
                  <Button size="sm" variant="outline" loading={busyId === w.id}
                    disabled={!(drafts[w.id] ?? '').trim()} onClick={() => void save(w.id)}>Map</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
