// src/components/garvis/GenerationReadiness.tsx
// THE HONEST ANSWER TO "why is nothing being generated?"
//
// Generating real, personalized marketing (grounded in the world's brand, photos, and research)
// needs an AI key. Without one, the studios still produce something — but it's the deterministic
// EXPERT-PLAYBOOK floor: generic frameworks, not writing in this business's voice. Nothing in the
// UI used to say that, so an empty-feeling studio looked broken instead of un-configured.
//
// This banner tells the truth, and ONLY the truth it can actually verify:
//   • DIRECT (browser-side) mode — the key lives in localStorage, so `ready` is knowable. If there's
//     no key, say plainly that generation is running on templates only and link to Settings.
//   • EDGE (production) mode — the key is a Supabase secret the browser can't see. We CANNOT know if
//     it's set, so we assert nothing (No-Theater: never claim a failure we can't confirm).
// It re-reads on config changes, so pasting a key in Settings clears it on the next render.

import { useEffect, useState } from 'react';
import { KeyRound, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveAI, subscribeAIConfig, providerInfo } from '../../lib/aiConfig';

/**
 * `compact` (default false) renders a slim one-line chip for headers; the full card is used in
 * empty studios where the explanation matters. Returns null when generation IS ready, or when we
 * genuinely can't tell (edge mode) — silence beats a false alarm.
 */
export function GenerationReadiness({ compact = false }: { compact?: boolean }) {
  const [ai, setAi] = useState(() => resolveAI());
  useEffect(() => subscribeAIConfig(() => setAi(resolveAI())), []);

  // Edge mode: the key is a server secret — we can't verify readiness, so we say nothing.
  if (!ai.direct) return null;
  // Ready (key present, or a keyless local server): nothing to warn about.
  if (ai.ready) {
    if (compact) return null;
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-forge-ok/40 bg-forge-ok/5 px-2.5 py-1 text-[11px] text-forge-ok">
        <Sparkles size={12} /> AI connected ({providerInfo(ai.provider).label}) — studios generate real, grounded work.
      </div>
    );
  }

  if (compact) {
    return (
      <Link
        to="/settings"
        title="Generation is running on built-in templates. Connect an AI key to generate real, personalized marketing."
        className="inline-flex items-center gap-1.5 rounded-lg border border-forge-warn/50 bg-forge-warn/10 px-2.5 py-1 text-[11px] font-medium text-forge-warn transition-colors hover:bg-forge-warn/20"
      >
        <KeyRound size={12} /> Templates only — connect an AI key
      </Link>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3 text-xs text-forge-dim">
      <p className="flex items-center gap-1.5 font-medium text-forge-warn">
        <KeyRound size={13} /> Generation is running on built-in templates only
      </p>
      <p className="mt-1">
        The studios will still produce a starting playbook, but to generate <span className="text-forge-ink">real, personalized
        marketing</span> — written in your business’s voice, grounded in its brand kit, photos, and research —
        connect an AI key. It’s a paste-once setting, stored only in this browser.
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04]"
      >
        <KeyRound size={13} /> Connect an AI key in Settings
      </Link>
    </div>
  );
}
