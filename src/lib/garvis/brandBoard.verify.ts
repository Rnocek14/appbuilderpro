// Run: npx tsx src/lib/garvis/brandBoard.verify.ts
// The branding adapter builds honest logo-concept prompts from the real palette: a mark is requested
// (unlike photo prompts), text is forbidden (the owner adds the wordmark), and a rendition always wants
// a fresh image with the tweak folded in.
import {
  LOGO_STYLES, logoStyleById, defaultLogoStyle, buildLogoPrompt, buildBrandContent, applyBrandRendition,
  withGeneratedLogo, LOGO_CONCEPT_NOTE, type BrandMaterials,
} from './brandBoard';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('brandBoard.verify');

const m: BrandMaterials = { businessName: 'Lakeside Realty', palette: ['#2e6f95', '#0f3d5c'], logoUrl: null, realEstate: true };
const bare: BrandMaterials = { businessName: '', palette: [], logoUrl: null, realEstate: false };

check('styles are well-formed with unique ids', new Set(LOGO_STYLES.map((s) => s.id)).size === LOGO_STYLES.length && LOGO_STYLES.length >= 5);
check('styleById / defaultStyle resolve', !!logoStyleById('emblem') && !!defaultLogoStyle(true));

{
  const p = buildLogoPrompt(m, logoStyleById('geometric')!);
  check('prompt names the business + uses the real palette', /Lakeside Realty/.test(p) && /#2e6f95/.test(p) && /#0f3d5c/.test(p));
  check('prompt requests a MARK but forbids text (owner adds the wordmark)', /logo mark/i.test(p) && /no text/i.test(p) && /no letters/i.test(p) && /not a photograph/i.test(p));
  const pExtra = buildLogoPrompt(m, logoStyleById('minimal')!, 'warmer, single color');
  check('an extra style nudge is folded into the prompt', /warmer, single color/.test(pExtra));
  const pBare = buildLogoPrompt(bare, LOGO_STYLES[0]);
  check('bare materials → generic-but-honest palette phrasing, no crash', /a local business/.test(pBare) && /palette/i.test(pBare));
}

{
  const c = buildBrandContent({ materials: m, style: logoStyleById('organic')! });
  check('build: styleId + prompt set, no image yet, no premature concept note', c.styleId === 'organic' && !!c.prompt && c.imageUrl === null && c.note === null);

  const r = applyBrandRendition(c, 'more minimal, single color', m);
  check('rendition always wants a fresh image with the tweak folded in', r.wantsImage === true && r.imageStyle === 'more minimal, single color' && /more minimal, single color/.test(r.content.prompt));

  const withImg = withGeneratedLogo(c, 'https://img/logo.png');
  check('withGeneratedLogo → image + honest concept note', withImg.imageUrl === 'https://img/logo.png' && withImg.note === LOGO_CONCEPT_NOTE);
}

console.log(`\nbrandBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} brandBoard check(s) failed`);
