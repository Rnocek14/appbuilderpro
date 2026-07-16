// Run: npx tsx src/lib/garvis/ideaBoard.verify.ts
// The idea board is the universal canvas — its seeds must frame questions honestly ([EDIT] holes,
// never invented specifics), typed ideas must lead, and the copy applier must stay word-safe.
import {
  IDEA_KINDS, IDEA_TAGS, ideaKindById, defaultIdeaKind, buildIdeaContent, applyIdeaCopy,
  applyIdeaRendition, composeIdeaText, type IdeaMaterials,
} from './ideaBoard';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('ideaBoard.verify');

const M: IdeaMaterials = { projectName: 'WealthCharts', mission: 'help traders see the market clearly' };

// --- catalog shape ---------------------------------------------------------------------------
check('six lenses, unique ids, every tag valid', IDEA_KINDS.length === 6
  && new Set(IDEA_KINDS.map((k) => k.id)).size === 6
  && IDEA_KINDS.every((k) => IDEA_TAGS.includes(k.tag)));
check('kind lookup + default', ideaKindById('idea_automation')?.tag === 'automation' && defaultIdeaKind().id === 'idea_feature');

// --- seeds are honest starters ---------------------------------------------------------------
for (const k of IDEA_KINDS) {
  const s = k.seed(M);
  check(`${k.id} seed uses the real project name and holds its unknowns as [EDIT] holes`,
    (s.title + s.pitch).includes('WealthCharts') === (s.title + s.pitch).toLowerCase().includes('wealthcharts')
    && (s.pitch + s.notes).includes('[EDIT:'));
}
const noName = IDEA_KINDS[0].seed({ projectName: '', mission: null });
check('a missing project name becomes a visible hole, never a made-up name', noName.title.includes('[EDIT:'));

// --- typed idea leads -----------------------------------------------------------------------
const typed = buildIdeaContent({ materials: M, kind: defaultIdeaKind(), idea: 'Replay mode for past trading days' });
check('the typed idea becomes the title', typed.title === 'Replay mode for past trading days' && typed.tag === 'feature');
const long = buildIdeaContent({ materials: M, kind: defaultIdeaKind(), idea: 'x'.repeat(90) });
check('titles clip to card scale', long.title.length <= 60);

// --- copy applier ----------------------------------------------------------------------------
const applied = applyIdeaCopy(typed, { pitch: 'Traders relive [EDIT: which sessions] to test discipline.', tag: 'growth' });
check('applyIdeaCopy patches pitch + valid tag, keeps title', applied.pitch.startsWith('Traders relive') && applied.tag === 'growth' && applied.title === typed.title);
check('an invalid tag is refused (keeps current)', applyIdeaCopy(typed, { tag: 'unicorn' }).tag === 'feature');
check('empty fields keep current words', applyIdeaCopy(typed, { title: ' ', pitch: '' }).pitch === typed.pitch);

// --- deterministic rendition is honest about its limits --------------------------------------
check('"title: X" works without AI', applyIdeaRendition(typed, 'title: Ghost mode')?.title === 'Ghost mode');
check('a real riff without AI returns null (the adapter says so, never fakes it)', applyIdeaRendition(typed, 'make it more ambitious') === null);

// --- brief composition -----------------------------------------------------------------------
const brief = composeIdeaText(typed, M.projectName);
check('the brief carries title, tag, project, pitch and notes', brief.includes('Replay mode') && brief.includes('feature · WealthCharts') && brief.includes(typed.notes));

console.log(`\nideaBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} ideaBoard check(s) failed`);
