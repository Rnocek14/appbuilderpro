// src/lib/garvis/sfxStore.ts
// The operator's CC0 sound kit, shared by every video lane (UGC Studio, Fact Channel Studio,
// Video Studio) — attested once, used on every cut after. localStorage because the kit is an
// operator preference, not world data; private-mode failures degrade to a session-only kit.

import type { SfxKit } from './ugcEdit';

const KEY = 'garvis-ugc-sfx';

export function loadSfxKit(): SfxKit {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as SfxKit; } catch { return {}; }
}

export function storeSfxKit(kit: SfxKit): void {
  try { localStorage.setItem(KEY, JSON.stringify(kit)); } catch { /* private mode — kit lives for the session */ }
}

export function sfxKitCount(kit: SfxKit): number {
  return [kit.whooshUrl, kit.popUrl, kit.riserUrl].filter((u) => u?.trim()).length;
}
