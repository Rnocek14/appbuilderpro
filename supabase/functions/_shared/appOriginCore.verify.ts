// supabase/functions/_shared/appOriginCore.verify.ts — the address a stranger has to be able to open
// (npm run verify:apporigin).

import { publicOriginProblem, isPublicOrigin, normalizeOrigin } from './appOriginCore.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── the addresses that are fine ────────────────────────────────────────────
const GOOD = [
  'https://garvis.example.com',
  'https://app.garvis.example.com/',
  'http://garvis.example.com',          // plain http is reachable; discouraged, not broken
  'https://garvis-console-abc123.netlify.app',
  'https://appbuilderpro.vercel.app',
  'https://example.co.uk',
];
for (const g of GOOD) check(`accepts ${g}`, isPublicOrigin(g));

// ── THE ONE THIS MODULE EXISTS FOR ─────────────────────────────────────────
// A laptop address in APP_ORIGIN is worse than no address: unset refuses to queue any pitch at all,
// while localhost reports ready and mails a dead link to a real business.
const LOCAL = [
  'http://localhost:5173', 'http://localhost', 'https://localhost:3000',
  'http://127.0.0.1:5173', 'http://127.0.0.1', 'http://0.0.0.0:8080',
  'http://[::1]:5173', 'http://app.localhost:5173',
];
for (const l of LOCAL) check(`refuses ${l}`, !isPublicOrigin(l));
check('every local address is refused', LOCAL.every((l) => !isPublicOrigin(l)));

const PRIVATE = [
  'http://192.168.1.14:5173', 'http://10.0.0.7', 'http://172.16.4.2:8080',
  'http://172.31.255.1', 'http://169.254.10.1', 'http://macbook.local:5173',
  'http://host.docker.internal:5173', 'http://svc.internal',
];
for (const p of PRIVATE) check(`refuses ${p}`, !isPublicOrigin(p));

// 172.16–172.31 is private; 172.15 and 172.32 are not. An over-broad /^172\./ would refuse real
// public addresses and leave someone unable to enter a perfectly good one.
check('172.15.x is public, not private', isPublicOrigin('https://172.15.0.1'));
check('172.32.x is public, not private', isPublicOrigin('https://172.32.0.1'));

// ── the other ways to get it wrong ─────────────────────────────────────────
check('empty is a problem', !isPublicOrigin(''));
check('whitespace only is a problem', !isPublicOrigin('   '));
check('null and undefined are problems', !isPublicOrigin(null) && !isPublicOrigin(undefined));
check('a bare domain with no scheme is refused', !isPublicOrigin('garvis.example.com'));
check('a hostname with no dot is refused', !isPublicOrigin('http://mybox'));
check('a non-web scheme is refused', !isPublicOrigin('ftp://garvis.example.com'));
check('prose is refused', !isPublicOrigin('my website'));

// ── what it SAYS ───────────────────────────────────────────────────────────
// "Invalid" tells a person nothing about what to type. Every refusal has to be a sentence, name the
// consequence, and — for the dangerous case — say that leaving it blank is the safe state.
const all = ['', 'garvis.example.com', 'http://localhost:5173', 'http://192.168.1.14', 'http://mybox', 'ftp://x.com'];
check('every refusal is a sentence, not a status word',
  all.every((v) => (publicOriginProblem(v) ?? '').split(/\s+/).length >= 6));
check('no refusal uses the word invalid', all.every((v) => !/invalid/i.test(publicOriginProblem(v) ?? '')));

const localMsg = publicOriginProblem('http://localhost:5173') ?? '';
check('the local message explains who would click the dead link', /business|email/i.test(localMsg));
check('the local message says blank is the safe state', /blank/i.test(localMsg) && /safe/i.test(localMsg));
const privMsg = publicOriginProblem('http://192.168.1.14') ?? '';
check('the private message explains the network boundary', /network/i.test(privMsg));
check('a good address has no complaint', publicOriginProblem('https://garvis.example.com') === null);

// ── normalizing ────────────────────────────────────────────────────────────
// A stored origin ending in "/" plus a link starting with "/" produces "…//preview-site/x", which
// some hosts 404. Trim once, here, rather than at each of the call sites that build a link.
check('one trailing slash is trimmed', normalizeOrigin('https://a.example.com/') === 'https://a.example.com');
check('several trailing slashes are trimmed', normalizeOrigin('https://a.example.com///') === 'https://a.example.com');
check('surrounding whitespace is trimmed', normalizeOrigin('  https://a.example.com/  ') === 'https://a.example.com');
check('an address with no trailing slash is untouched', normalizeOrigin('https://a.example.com') === 'https://a.example.com');
check('a path is preserved', normalizeOrigin('https://a.example.com/app/') === 'https://a.example.com/app');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} app-origin check(s) failed`);
