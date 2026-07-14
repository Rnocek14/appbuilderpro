// Run: npx tsx src/lib/garvis/repoGenesis.verify.ts
import {
  parsePkgJson, parseHtmlMeta, parseRouteHead, readmeLead, detectStack, distillRepo, hasEnoughSignal,
  repoIntent, classifyApp, moneyReadiness,
  type RepoFile, type RepoSignal,
} from './repoGenesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('repoGenesis.verify');

// A faithful stand-in for the real mind-weave-recover repo: a LOVABLE-DEFAULT README (pure
// boilerplate, no product signal) alongside a real index.html title/description + package.json.
const LOVABLE_README = `# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/0366a005

## How can I edit this code?

**Use Lovable** — Simply visit the Lovable Project and start prompting.

## What technologies are used for this project?

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS`;

const INDEX_HTML = `<!doctype html><html><head>
<title>NeuroRecover - AI-Powered Stroke Rehabilitation</title>
<meta name="description" content="Personalized stroke rehabilitation through AI-guided therapy. Rebuild motor skills, speech, and confidence from home with adaptive exercises that track your progress." />
<meta property="og:title" content="NeuroRecover" />
</head><body><div id="root"></div></body></html>`;

const PKG = JSON.stringify({
  name: 'vite_react_shadcn_ts', version: '0.0.0',
  dependencies: { react: '^18', '@supabase/supabase-js': '^2', '@radix-ui/react-dialog': '^1' },
  devDependencies: { vite: '^5', tailwindcss: '^3' },
});

const FILES: RepoFile[] = [
  { path: 'README.md', text: LOVABLE_README },
  { path: 'index.html', text: INDEX_HTML },
  { path: 'package.json', text: PKG },
  { path: 'docs/clinical-progression-v1-spec.md', text: '' },
  { path: 'docs/receptive-assisted-mastery-spec.md', text: '' },
  { path: 'docs/shadow-gate-spec.md', text: '' },
  { path: 'src/pages/Dashboard.tsx', text: '' },
  { path: 'src/pages/Exercises.tsx', text: '' },
  { path: 'src/pages/NotFound.tsx', text: '' },
];

// --- package.json parse -------------------------------------------------------------------
{
  const p = parsePkgJson(PKG);
  check('pkg deps flatten dependencies + devDependencies', p.deps.includes('react') && p.deps.includes('vite') && p.deps.includes('tailwindcss'));
  check('a scaffold pkg name is still read (dedup handled downstream)', p.name === 'vite_react_shadcn_ts');
  check('bad JSON degrades, never throws', parsePkgJson('{not json').deps.length === 0);
}
// --- html meta ----------------------------------------------------------------------------
{
  const m = parseHtmlMeta(INDEX_HTML);
  check('reads the <title>', m.title === 'NeuroRecover - AI-Powered Stroke Rehabilitation');
  check('reads the meta description (the real product line)', !!m.description && m.description.includes('stroke rehabilitation'));
}
// --- readme boilerplate skip (THE gotcha) -------------------------------------------------
{
  check('a pure-Lovable README yields NO lead (boilerplate is not product signal)', readmeLead(LOVABLE_README) === null);
  const real = readmeLead(`# CoolApp\n\nCoolApp helps night-shift nurses log medication rounds in seconds, offline-first.\n\n## Getting started\nnpm run dev`);
  check('a real README lead is extracted, scaffolding lines dropped', !!real && real.includes('night-shift nurses') && !real.includes('npm run dev'));
}
// --- stack detection ----------------------------------------------------------------------
{
  const s = detectStack(['react', '@supabase/supabase-js', 'tailwindcss', 'vite', '@radix-ui/react-dialog']);
  check('stack detects the real frameworks', s.includes('React') && s.includes('Supabase') && s.includes('Tailwind') && s.includes('Vite'));
  check('stack is deduped + human-labeled', s.filter((x) => x === 'shadcn/Radix UI').length === 1);
}
// --- full distill: the Lovable README must NOT poison the signal --------------------------
{
  const sig = distillRepo(FILES, { owner: 'rnocek14', repo: 'mind-weave-recover' });
  check('product NAME comes from the <title>, not the scaffold pkg name or repo slug', sig.name === 'NeuroRecover');
  check('tagline is the real product description', !!sig.tagline && sig.tagline.includes('motor skills'));
  check('README boilerplate is discarded (no Lovable text leaks in)', sig.readmeLead === null);
  check('doc topics surface the domain (clinical/mastery/gate)', sig.docTopics.some((t) => /clinical|mastery|gate/i.test(t)));
  check('surfaces list real pages, not index/NotFound', sig.surfaces.includes('Dashboard') && sig.surfaces.includes('Exercises') && !sig.surfaces.some((x) => /not ?found/i.test(x)));
  check('the signal is rich enough to synthesize from', hasEnoughSignal(sig));

  const intent = repoIntent(sig, { owner: 'rnocek14', repo: 'mind-weave-recover' });
  check('intent leads with the product + its real one-liner', intent.startsWith('NeuroRecover') && intent.includes('stroke rehabilitation'));
  check('intent NEVER contains the Lovable boilerplate', !/lovable/i.test(intent) && !/welcome to your/i.test(intent));
  check('intent names the domain docs as signal', /clinical|mastery|gate/i.test(intent));
  check('intent instructs Genesis to ASK, never fabricate the market', /ASK rather than invent/i.test(intent) && /do not fabricate/i.test(intent));
}
// --- thin repo: honest "not enough" ------------------------------------------------------
{
  const thin = distillRepo([{ path: 'README.md', text: LOVABLE_README }, { path: 'package.json', text: PKG }], { owner: 'x', repo: 'y' });
  check('a repo with only boilerplate + scaffold pkg has no real tagline/lead', !thin.tagline && !thin.readmeLead);
  check('hasEnoughSignal is false when there is nothing real to stand on', hasEnoughSignal(thin) === false);
}

// --- route-based head (TanStack Start / Remix): the apps with NO index.html -----------------
{
  // Shaped like swift-prep-pros / theory-thread — head lives in a route file, not index.html.
  const routeSrc = `export const Route = createRootRoute({
    head: () => ({
      meta: [
        { title: 'TheoryForge - The Scientific Connection Engine' },
        { name: 'description', content: 'AI research-discovery platform that surfaces novel connections across scientific papers.' },
      ],
    }),
  })`;
  const h = parseRouteHead(routeSrc);
  check('route head extracts the title from a head() object', h.title === 'TheoryForge - The Scientific Connection Engine');
  check('route head extracts the meta description', !!h.description && h.description.includes('scientific papers'));
  check('a non-route file yields nothing (no false positives)', parseRouteHead('const x = 1;').title === null);
}
// --- app classifier: each app type gets a FITTING, adaptable money model (real portfolio) -----
{
  const sig = (over: Partial<RepoSignal>): RepoSignal => ({ name: null, title: null, tagline: null, readmeLead: null, stack: [], docTopics: [], surfaces: [], money: { hasBilling: false, hasPricing: false, stage: 'no-offer', nextMove: '' }, ...over });

  const health = classifyApp(sig({ name: 'NeuroRecover', tagline: 'AI-guided stroke rehabilitation to rebuild motor skills from home' }));
  check('health app → subscription + clinician/caregiver channels', /health/i.test(health.category) && health.revenueModel === 'subscription' && health.channels.join(' ').toLowerCase().includes('clinician'));

  const privacy = classifyApp(sig({ name: 'Footprint Finder', tagline: 'find every data broker holding your email and delete it', stack: ['Stripe'] }));
  check('privacy app → freemium subscription + intent-SEO channel', /privacy/i.test(privacy.category) && /freemium/i.test(privacy.revenueModel!) && privacy.channels.join(' ').toLowerCase().includes('seo'));

  const news = classifyApp(sig({ name: 'Lake Geneva Brief', tagline: 'a five-minute local newsletter covering city hall, schools, and events' }));
  check('newsletter → sponsorships, NOT a checkout model', /newsletter|media/i.test(news.category) && /sponsor/i.test(news.revenueModel!));

  const career = classifyApp(sig({ name: 'PathfindAI', tagline: 'personalized AI career roadmaps to reach your professional goals' }));
  check('career app → freemium + short-form video channel', /career/i.test(career.category) && /freemium/i.test(career.revenueModel!) && career.channels.join(' ').toLowerCase().includes('video'));

  const research = classifyApp(sig({ name: 'TheoryForge', tagline: 'reads across scientific papers to surface novel research connections' }));
  check('research tool → B2B/academic seats, not consumer', /research|b2b/i.test(research.category) && /academic|b2b/i.test(research.revenueModel!));

  const crm = classifyApp(sig({ name: 'CMP Intelligence', tagline: 'lead discovery, scoring, and outbound campaigns for contractors', surfaces: ['Leads', 'Campaigns', 'Quotes', 'Tickets'] }));
  check('B2B outbound tool → B2B SaaS + outbound/ABM channels', /b2b/i.test(crm.category) && crm.channels.join(' ').toLowerCase().includes('outbound'));

  const thin = classifyApp(sig({ name: 'mystery-repo' }));
  check('a thin/unknown repo is NOT force-classified (defers to Genesis)', thin.category === 'unclear from the repo' && thin.revenueModel === null);

  // the classification reaches the intent so the plan adapts per app
  const intent = repoIntent(sig({ name: 'NeuroRecover', tagline: 'AI-guided stroke rehabilitation from home' }), { owner: 'rnocek14', repo: 'mind-weave-recover' });
  check('the app classification is folded into the Genesis intent as a hypothesis', /looks like a .*health/i.test(intent) && /STARTING HYPOTHESIS/i.test(intent));
}
// --- money readiness: the honest gate between marketing and revenue (right now none earn) -----
{
  const wired = moneyReadiness(['react', 'stripe', '@supabase/supabase-js'], 'Pro Annual $79/yr. Subscribe to unlock.');
  check('a Stripe dependency means it CAN charge today', wired.stage === 'can-charge' && wired.hasBilling && /traffic/i.test(wired.nextMove));

  const offerOnly = moneyReadiness(['react', 'vite'], 'Upgrade to Pro for $9/mo to get more.');
  check('priced offer but no billing SDK → wire the till first', offerOnly.stage === 'offer-not-wired' && !offerOnly.hasBilling && /wire stripe|checkout/i.test(offerOnly.nextMove));

  const nothing = moneyReadiness(['react', 'vite', 'tailwindcss'], 'A free tool for tracking your habits.');
  check('no offer + no billing → decide the paid tier before marketing', nothing.stage === 'no-offer' && /paid tier|cannot charge|earns nothing/i.test(nothing.nextMove));

  // distill wires it end to end, and the intent carries the readiness so the plan is money-honest
  const files: RepoFile[] = [
    { path: 'package.json', text: JSON.stringify({ name: 'footprint', dependencies: { react: '^18', stripe: '^14' } }) },
    { path: 'index.html', text: '<title>Footprint Finder</title><meta name="description" content="find and delete your data broker listings">' },
  ];
  const distilled = distillRepo(files, { owner: 'rnocek14', repo: 'launch-buddy-bot' });
  check('distill computes money readiness from the real deps', distilled.money.stage === 'can-charge');
  const fpIntent = repoIntent(distilled, { owner: 'rnocek14', repo: 'launch-buddy-bot' });
  check('intent tells Genesis the app can charge → focus on traffic', /MONETIZATION READINESS/i.test(fpIntent) && /can take money today|CAN take money/i.test(fpIntent));
}

console.log(`\nrepoGenesis.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} repoGenesis check(s) failed`);
