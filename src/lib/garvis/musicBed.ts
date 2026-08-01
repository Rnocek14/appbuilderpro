// src/lib/garvis/musicBed.ts
// THE MUSIC BED — pure core (verified by musicBed.verify.ts). Shotstack has no first-party music
// library, and platform/label enforcement makes license provenance mandatory, so the rule here is
// honest and hard: ONLY tracks the operator can attest are CC0 (public domain) ride a render. The
// operator sources tracks from the CC0 libraries below (download → upload to the vault, or paste any
// hosted CC0 mp3 URL); this core just picks deterministically and sets the one volume rule:
// ducked under a voiceover, fuller without one. No track URL is ever invented here — a render with
// no attested track simply has no music, never a silently-unlicensed bed.

export type MusicMood = 'warm' | 'upbeat' | 'cinematic' | 'minimal';
export const MUSIC_MOODS: MusicMood[] = ['warm', 'upbeat', 'cinematic', 'minimal'];

export interface MusicTrack {
  id: string;
  title: string;
  mood: MusicMood;
  url: string;            // a fetchable mp3 the render provider can pull
  license: string;        // only 'CC0' passes the license gate
  sourceUrl?: string;     // where it came from — provenance for the honest record
}

/** Where CC0 tracks come from — shown in the UI as the honest sourcing note. */
export const CC0_MUSIC_SOURCES = [
  { name: 'FreePD', url: 'https://freepd.com', note: 'Public-domain (CC0) music; download the mp3, upload it to your vault.' },
  { name: 'Mixkit (free tracks)', url: 'https://mixkit.co/free-stock-music/', note: 'Free license tracks — check each track\'s license page before use.' },
];

/** The license gate: only a track attested CC0 may ride a render. Fail-closed. */
export function isLicensedTrack(t: Pick<MusicTrack, 'license' | 'url'> | null | undefined): boolean {
  return !!t && t.license === 'CC0' && typeof t.url === 'string' && /^https:\/\//.test(t.url);
}

/** The one volume rule: music ducks under a voiceover (0.2), fills the room without one (0.5). */
export function volumeForMusic(hasVoiceover: boolean): number {
  return hasVoiceover ? 0.2 : 0.5;
}

/** Deterministic pick: licensed tracks of the mood (falling back to any licensed track), stable-sorted
 *  by id, indexed by variant. Same inputs → same track; no tracks → null, never an invention. */
export function pickMusic(tracks: MusicTrack[], mood: MusicMood, variant = 0): MusicTrack | null {
  const licensed = tracks.filter(isLicensedTrack);
  const pool = (licensed.some((t) => t.mood === mood) ? licensed.filter((t) => t.mood === mood) : licensed)
    .slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!pool.length) return null;
  const i = ((Math.trunc(variant) % pool.length) + pool.length) % pool.length;
  return pool[i];
}
