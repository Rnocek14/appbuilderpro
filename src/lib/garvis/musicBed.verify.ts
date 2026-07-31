// Run: npx tsx src/lib/garvis/musicBed.verify.ts
import { isLicensedTrack, pickMusic, volumeForMusic, MUSIC_MOODS, type MusicTrack } from './musicBed';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('musicBed.verify');

const cc0 = (id: string, mood: MusicTrack['mood']): MusicTrack =>
  ({ id, title: id, mood, url: `https://cdn.example/${id}.mp3`, license: 'CC0' });

{
  check('volume rule: ducked under a voiceover', volumeForMusic(true) === 0.2);
  check('volume rule: fuller without one', volumeForMusic(false) === 0.5);
  check('all four moods exist', MUSIC_MOODS.length === 4);
}
{
  // The license gate is fail-closed: anything not attested CC0 (or not https) never passes.
  check('CC0 + https passes', isLicensedTrack(cc0('a', 'warm')));
  check('a non-CC0 license fails the gate', !isLicensedTrack({ ...cc0('a', 'warm'), license: 'royalty-free' }));
  check('a non-https url fails the gate', !isLicensedTrack({ ...cc0('a', 'warm'), url: 'http://cdn.example/a.mp3' }));
  check('null fails the gate', !isLicensedTrack(null));
}
{
  const tracks = [cc0('b-upbeat', 'upbeat'), cc0('a-warm', 'warm'), cc0('c-warm', 'warm'),
    { ...cc0('z-warm', 'warm'), license: 'unknown' }];
  check('picks within the mood, stable-sorted by id', pickMusic(tracks, 'warm', 0)?.id === 'a-warm');
  check('variant walks the mood pool deterministically', pickMusic(tracks, 'warm', 1)?.id === 'c-warm' && pickMusic(tracks, 'warm', 2)?.id === 'a-warm');
  check('unlicensed tracks are invisible to the pick', [0, 1, 2, 3].every((v) => pickMusic(tracks, 'warm', v)?.id !== 'z-warm'));
  check('a mood with no tracks falls back to any licensed track', pickMusic(tracks, 'cinematic', 0)?.id === 'a-warm');
  check('negative variants stay in range (no crash, deterministic)', pickMusic(tracks, 'warm', -1)?.id === 'c-warm');
  check('no licensed tracks → null, never an invention', pickMusic([{ ...cc0('x', 'warm'), license: '' }], 'warm', 0) === null);
  check('deterministic: same input, same track', JSON.stringify(pickMusic(tracks, 'upbeat', 5)) === JSON.stringify(pickMusic(tracks, 'upbeat', 5)));
}

console.log(`\nmusicBed.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} musicBed check(s) failed`);
