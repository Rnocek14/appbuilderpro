// src/components/garvis/SoundKitFields.tsx
// The CC0 sound-kit editor, shared by every video studio. Honest sourcing note + three URL fields;
// only what the operator supplies ever rides a render (the musicBed rule applied to SFX).

import type { SfxKit } from '../../lib/garvis/ugcEdit';
import { storeSfxKit } from '../../lib/garvis/sfxStore';

const FIELDS = [
  ['whooshUrl', 'whoosh (on the cuts)'],
  ['popUrl', 'pop (hook landing)'],
  ['riserUrl', 'riser (energetic hook)'],
] as const;

export function SoundKitFields({ sfx, onChange }: { sfx: SfxKit; onChange: (next: SfxKit) => void }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-forge-border p-2.5">
      <p className="text-[11px] text-forge-dim">CC0 sounds only (Mixkit, Pixabay) — paste hosted mp3 URLs. Only what you add rides the cuts; whooshes lead each cut, the pop lands the hook, the riser runs under an energetic open. Saved for every studio.</p>
      {FIELDS.map(([k, label]) => (
        <input key={k} value={sfx[k] ?? ''} placeholder={label}
          onChange={(e) => { const next = { ...sfx, [k]: e.target.value }; storeSfxKit(next); onChange(next); }}
          className="w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
      ))}
    </div>
  );
}
