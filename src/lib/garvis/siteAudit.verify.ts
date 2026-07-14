// src/lib/garvis/siteAudit.verify.ts — run: npx tsx src/lib/garvis/siteAudit.verify.ts
// Proves the audit is honest: every signal traces to real fetched data, an unreachable page is
// 'unknown' (never a fabricated verdict), a strong site scores high, and the derived score reflects
// the real signal count rather than an invented number.

import { auditSite, auditIssues } from './siteAudit';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const NOW = 2026;

// ---- a genuinely weak site: http, no viewport, no contact, stale copyright, thin ----
const weak = auditSite({
  url: 'http://joesroofing.com', reachable: true, title: 'Joes Roofing', description: null,
  text: 'Joe’s Roofing. Call us. © 2011 Joe.', hasViewport: false, hasForm: false, emailFound: false,
}, NOW);
ok('weak: verdict weak', weak.verdict === 'weak');
ok('weak: flags no https', weak.signals.some((s) => s.id === 'no_https' && s.severity === 'high'));
ok('weak: flags not mobile', weak.signals.some((s) => s.id === 'not_mobile'));
ok('weak: flags no contact', weak.signals.some((s) => s.id === 'no_contact'));
ok('weak: flags stale copyright with the real year', weak.signals.some((s) => s.id === 'stale' && s.label.includes('2011')));
ok('weak: score is low but never below 10', weak.score != null && weak.score >= 10 && weak.score < 50);
ok('weak: worst signal is first (high severity)', weak.signals[0].severity === 'high');
ok('weak: issues list feeds the builder', auditIssues(weak).length === weak.signals.length && auditIssues(weak).includes('No HTTPS'));

// ---- a solid site: https, viewport, form, title+description, fresh, plenty of text ----
const solid = auditSite({
  url: 'https://acme.com', reachable: true, title: 'Acme — Local Experts', description: 'We help you.',
  text: 'Acme has served the area since 2005. '.repeat(40) + '© 2026 Acme.', hasViewport: true, hasForm: true, emailFound: true,
}, NOW);
ok('solid: verdict solid', solid.verdict === 'solid');
ok('solid: no signals', solid.signals.length === 0);
ok('solid: high score', solid.score === 100);
ok('solid: strengths listed', solid.strengths.includes('Secure (HTTPS)') && solid.strengths.includes('Mobile-ready'));
ok('solid: headline says lower priority', /lower priority/i.test(solid.headline));

// ---- unreachable: honest unknown, never a fabricated verdict/score ----
const dead = auditSite({ url: 'https://nope.example', reachable: false }, NOW);
ok('unreachable: verdict unknown', dead.verdict === 'unknown');
ok('unreachable: score is null (not invented)', dead.score === null);
ok('unreachable: no fabricated signals', dead.signals.length === 0);
ok('unreachable: headline asks for a manual look', /manual look/i.test(dead.headline));

// ---- a fresh copyright is NOT flagged stale ----
const fresh = auditSite({
  url: 'https://fresh.com', reachable: true, title: 'Fresh', description: 'x', text: 'Lots of content here. '.repeat(40) + '© 2025 Fresh.', hasViewport: true, hasForm: true, emailFound: true,
}, NOW);
ok('fresh: no stale flag for a recent year', !fresh.signals.some((s) => s.id === 'stale'));

// ---- determinism: same input → same audit ----
const a = auditSite({ url: 'http://x.com', reachable: true, text: 'short', hasViewport: false, hasForm: false }, NOW);
const b = auditSite({ url: 'http://x.com', reachable: true, text: 'short', hasViewport: false, hasForm: false }, NOW);
ok('deterministic: identical output', JSON.stringify(a) === JSON.stringify(b));

// ---- a mid site (one high issue) reads as weak; a purely cosmetic gap reads as dated ----
const dated = auditSite({
  url: 'https://ok.com', reachable: true, title: 'OK Co', description: null,
  text: 'Plenty of real content about the business. '.repeat(30) + '© 2026', hasViewport: true, hasForm: true, emailFound: true,
}, NOW);
ok('dated: only a no-description low/med gap → dated, not weak', dated.verdict === 'dated' && !dated.signals.some((s) => s.severity === 'high'));

console.log(`\nsiteAudit.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
