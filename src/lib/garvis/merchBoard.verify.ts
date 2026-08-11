// Run: npx tsx src/lib/garvis/merchBoard.verify.ts
// Pins the merch concept-card contract: deterministic builds from brand materials, instruction
// parsing that honors the suggestion chips' own sentences, and cost reads through costSheet.
import { buildMerchContent, applyMerchRendition, merchCost, merchCaption, monogramOf, withRefImage, GARMENTS, DEFAULT_COSTS } from './merchBoard';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const COMO = { businessName: 'Como Country Club', palette: ['#1F3D2B', '#F3EBDD'] };

// Building.
{
  const t = buildMerchContent({ materials: COMO, garment: 'tee', idea: '' });
  check('no idea → the monogram carries the mark (CCC)', t.designText === 'CCC');
  check('brand palette decides body and ink', t.baseColor === '#1F3D2B' && t.inkColor === '#F3EBDD');
  check('a hat starts with a small front mark', buildMerchContent({ materials: COMO, garment: 'hat', idea: '' }).scale === 'small');
  check('a polo starts at the left chest (front pocket zone)', buildMerchContent({ materials: COMO, garment: 'polo', idea: '' }).placement === 'front_pocket');
  check('the idea rides verbatim into the note', buildMerchContent({ materials: COMO, garment: 'tee', idea: 'Como script across the chest' }).note === 'Como script across the chest');
  check('a short idea IS the mark ("Como" prints)', buildMerchContent({ materials: COMO, garment: 'tee', idea: 'Como' }).designText === 'Como');
  check('a long DESCRIPTION keeps the monogram as the mark (descriptions are not marks)',
    buildMerchContent({ materials: COMO, garment: 'tee', idea: 'a t-shirt concept with a bold front print' }).designText === 'CCC');
  check('no brand yet → honest defaults, never a crash', buildMerchContent({ materials: { businessName: null, palette: [] }, garment: 'tote', idea: '' }).designText === 'LOGO');
  check('deterministic', JSON.stringify(buildMerchContent({ materials: COMO, garment: 'tee', idea: 'x' })) === JSON.stringify(buildMerchContent({ materials: COMO, garment: 'tee', idea: 'x' })));
}

// Renditions — the SUGGESTION CHIPS' own sentences are the acceptance tests.
{
  const t = buildMerchContent({ materials: COMO, garment: 'tee', idea: 'capsule drop' });
  const pocket = applyMerchRendition(t, 'put a small logo on the front pocket area');
  check('"small logo on the front pocket" → pocket placement, small scale', pocket.placement === 'front_pocket' && pocket.scale === 'small');
  const back = applyMerchRendition(t, 'move the main design to a large back print');
  check('"large back print" → back placement, large scale', back.placement === 'back' && back.scale === 'large');
  const twoCol = applyMerchRendition(t, 'limit the design to two colors for cheaper printing');
  check('"two colors" → the color discipline sticks', twoCol.maxColors === 2);
  const hat = applyMerchRendition(t, 'try it as a hat');
  check('garment words switch the garment AND its cost defaults', hat.garment === 'hat' && hat.cost.blankUnitUsd === DEFAULT_COSTS.hat.blankUnitUsd);
  const colors = applyMerchRendition(t, 'cream on green');
  check('"cream on green" → ink cream, body green', colors.inkColor === '#F3EBDD' && colors.baseColor === '#1F3D2B');
  const odd = applyMerchRendition(t, 'make it feel more like old money');
  check('an unrecognized instruction keeps the card and lands in the note (nothing said is lost)',
    odd.garment === t.garment && odd.note === 'make it feel more like old money');
  check('renditions never mutate the parent', t.placement === 'front' && t.maxColors === null);
}

// Cost + caption + photo.
{
  const t = buildMerchContent({ materials: COMO, garment: 'tee', idea: '' });
  const sheet = merchCost(t);
  check('the cost read runs through the verified costSheet core', sheet.landedUnitUsd > 0 && sheet.reads.length === 1);
  check('default tee at $32 clears money (sanity)', sheet.points[0]!.marginUsd > 0);
  check('caption names garment + placement', merchCaption(t) === 'Tee · front');
  check('the 2-color discipline shows in the caption', merchCaption({ ...t, maxColors: 2 }).includes('2-color'));
  check('a dropped reference photo rides the card', withRefImage(t, 'http://x/crest.png').refImageUrl === 'http://x/crest.png');
  check('every garment has a kind and cost defaults', GARMENTS.every((g) => DEFAULT_COSTS[g.id].units > 0));
  check('monogram folds long names ("Como Country Club" → CCC)', monogramOf('Como Country Club') === 'CCC');
}

console.log(`\nmerchBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} merchBoard check(s) failed`);
