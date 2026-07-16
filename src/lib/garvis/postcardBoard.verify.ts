// Run: npx tsx src/lib/garvis/postcardBoard.verify.ts
// The postcard board adapter is where the CREATIVE freedom meets the HONESTY rules, so it gets a hard
// suite: every kind is well-formed, the AI-image gate is respected (a listing card can NEVER carry an AI
// image — it must show the real home), unknown facts stay visible [EDIT] holes, and a rendition always
// produces a visibly-different child (advances the look; a words-instruction rewrites the headline; a
// look-instruction flags an image regen but never replaces a real photo).
import {
  POSTCARD_KINDS_RE, POSTCARD_KINDS_GENERIC, postcardKindsFor, kindById, defaultKind,
  buildPostcardContent, applyRendition, withGeneratedImage, withPhoto, postcardImagePrompt, tileAllowsAI, applyCopyFields, enforceListingHonesty,
  type PostcardMaterials, type PostcardKind,
} from './postcardBoard';
import { canGenerateImage } from './imagegen';
import type { BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('postcardBoard.verify');

const ctx: BusinessContext = {
  business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null, offerings: ['listings', 'buyer rep'],
  audience: 'lakefront sellers', locale: 'Lake Geneva', links: { site: 'https://lakeside.example' }, tone: null,
};
const withPhotos: PostcardMaterials = { ctx, brand: { palette: ['#2e6f95'], fonts: [], compliance_line: null }, images: [{ url: 'https://img/hero.jpg', caption: 'lakefront home', label: 'hero' }] };
const noPhotos: PostcardMaterials = { ctx, brand: { palette: ['#2e6f95'], fonts: [], compliance_line: null }, images: [] };
const blank: PostcardMaterials = { ctx: null, brand: null, images: [] };

const ALL: PostcardKind[] = [...POSTCARD_KINDS_RE, ...POSTCARD_KINDS_GENERIC];

// --- kinds are well-formed + the honesty gate is encoded consistently ----------------------
check('there are RE + generic kinds with unique ids', new Set(ALL.map((k) => k.id)).size === ALL.length && POSTCARD_KINDS_RE.length >= 5 && POSTCARD_KINDS_GENERIC.length >= 3);
check('every kind has label/emoji/hint/concept/campaignType', ALL.every((k) => !!k.label && !!k.emoji && !!k.hint && !!k.concept && !!k.campaignType));
check('needsRealPhoto EXACTLY mirrors the AI-image honesty gate', ALL.every((k) => k.needsRealPhoto === !canGenerateImage(k.campaignType)));
check('the three listing kinds require a real photo', ['just_listed', 'just_sold', 'open_house'].every((id) => kindById(id)!.needsRealPhoto));
check('postcardKindsFor / kindById / defaultKind resolve', postcardKindsFor(true) === POSTCARD_KINDS_RE && !!kindById('free_valuation') && !defaultKind(true).needsRealPhoto && !defaultKind(false).needsRealPhoto);

// --- building a tile: image sourcing is honest ---------------------------------------------
{
  const listed = buildPostcardContent({ materials: withPhotos, kind: kindById('just_listed')! });
  check('listing kind + a real photo → imageMode photo, photo on the front', listed.imageMode === 'photo' && listed.spec.front.imageUrl === 'https://img/hero.jpg');

  const listedNoPhoto = buildPostcardContent({ materials: noPhotos, kind: kindById('just_listed')! });
  check('listing kind with NO photo → honest brand card, never a fake image', listedNoPhoto.imageMode === 'brand' && listedNoPhoto.spec.front.imageUrl === null);

  const lifestyle = buildPostcardContent({ materials: noPhotos, kind: kindById('thinking_of_selling')! });
  check('lifestyle kind opens as a designed brand card (until an image is made)', lifestyle.imageMode === 'brand' && lifestyle.spec.front.headline === 'Thinking of selling?');

  const withAI = buildPostcardContent({ materials: noPhotos, kind: kindById('free_valuation')!, image: { url: 'https://img/ai.png', mode: 'ai', note: 'AI illustration' } });
  check('an AI image applied → imageMode ai + honesty note + image on the front', withAI.imageMode === 'ai' && withAI.aiNote === 'AI illustration' && withAI.spec.front.imageUrl === 'https://img/ai.png');
}

// --- honesty: unknown facts are visible [EDIT] holes, never invented -----------------------
{
  const promo = buildPostcardContent({ materials: blank, kind: kindById('promo')! });
  const blob = `${promo.spec.front.headline} ${promo.spec.back.offer} ${promo.spec.back.body}`;
  check('blank materials → the specifics are visible [EDIT] holes', /\[EDIT/.test(blob));
}

// --- the AI-image prompt respects the gate -------------------------------------------------
{
  const lifestyle = buildPostcardContent({ materials: noPhotos, kind: kindById('thinking_of_selling')! });
  const p1 = postcardImagePrompt(lifestyle, noPhotos, 'golden hour, warm');
  check('lifestyle tile → an honest image prompt is built', p1.ok === true && /Lake Geneva/.test((p1 as { prompt: string }).prompt));

  const listing = buildPostcardContent({ materials: withPhotos, kind: kindById('just_sold')! });
  const p2 = postcardImagePrompt(listing, withPhotos, 'anything');
  check('listing tile → AI image is REFUSED with a reason', p2.ok === false);
  check('tileAllowsAI mirrors the gate', tileAllowsAI(lifestyle) === true && tileAllowsAI(listing) === false);
}

// --- renditions: always a visibly-different child, honestly ---------------------------------
{
  const base = buildPostcardContent({ materials: noPhotos, kind: kindById('thinking_of_selling')!, variant: 0 });

  const words = applyRendition(base, 'call it "Homes are moving fast"');
  check('a words instruction rewrites the headline, keeps the image', words.content.spec.front.headline === 'Homes are moving fast' && words.wantsImage === false);
  check('a rendition always advances the look variant', words.content.variant === 1);

  const look = applyRendition(base, 'warmer, golden-hour sunset');
  check('a look instruction on a lifestyle tile flags an image regen with the style', look.wantsImage === true && look.imageStyle === 'warmer, golden-hour sunset');

  const listing = buildPostcardContent({ materials: withPhotos, kind: kindById('just_sold')!, variant: 0 });
  const lookOnListing = applyRendition(listing, 'brighter, dusk sky');
  check('a look instruction on a listing tile NEVER replaces the real photo', lookOnListing.wantsImage === false && lookOnListing.content.imageMode === 'photo');

  const empty = applyRendition(base, '   ');
  check('an empty instruction still re-looks but asks for no image', empty.wantsImage === false && empty.content.variant === 1);
}

// --- applying results ----------------------------------------------------------------------
{
  const base = buildPostcardContent({ materials: noPhotos, kind: kindById('reach')! });
  const g = withGeneratedImage(base, 'https://img/x.png', 'AI note');
  check('withGeneratedImage → ai mode + note + url', g.imageMode === 'ai' && g.aiNote === 'AI note' && g.spec.front.imageUrl === 'https://img/x.png');
  const p = withPhoto(base, 'https://img/up.jpg', 'my photo');
  check('withPhoto → photo mode + url + alt', p.imageMode === 'photo' && p.spec.front.imageUrl === 'https://img/up.jpg' && p.spec.front.imageAlt === 'my photo');
}

// --- the copy seam's pure applier: words only, photo/AI rules untouchable --------------------
{
  const m: PostcardMaterials = { ctx: { business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null, offerings: [], audience: null, locale: 'Lake Geneva', links: {}, tone: null }, brand: null, images: [] };
  const base = buildPostcardContent({ materials: m, kind: postcardKindsFor(true).find((k) => !k.needsRealPhoto)!, idea: '' });
  const out = applyCopyFields(base, { headline: 'Sunset season on the lake', sub: 'thinking of selling?', body: 'Line one.\nLine two [EDIT: offer].', cta: 'Text LAKE to get your number' });
  check('applyCopyFields writes headline/sub/body/cta', out.spec.front.headline.startsWith('Sunset season') && out.spec.front.kicker === 'thinking of selling?' && out.spec.back.cta.startsWith('Text LAKE') && out.spec.back.body.includes('[EDIT: offer]'));
  check('a too-long headline is clipped to postcard scale', applyCopyFields(base, { headline: 'x'.repeat(90) }).spec.front.headline.length <= 48);
  check('image mode + photo rules are untouchable from the copy applier', out.imageMode === base.imageMode && out.spec.front.imageUrl === base.spec.front.imageUrl);
  const kept = applyCopyFields(base, {});
  check('no fields → the words stay put', kept.spec.front.headline === base.spec.front.headline && kept.spec.back.body === base.spec.back.body);
}

// --- the listing-honesty backstop: a listing CLAIM forces listing RULES ----------------------
{
  const m: PostcardMaterials = { ctx: { business_name: 'Lakeside Realty', principal: 'Jane Doe', craft: null, offerings: [], audience: null, locale: 'Lake Geneva', links: {}, tone: null }, brand: null, images: [] };
  const lifestyle = buildPostcardContent({ materials: m, kind: postcardKindsFor(true).find((k) => !k.needsRealPhoto)!, idea: '' });
  const withAI = withGeneratedImage(lifestyle, 'https://x/ai.png', 'AI illustration');
  const renamed = { ...withAI, spec: { ...withAI.spec, front: { ...withAI.spec.front, headline: 'JUST SOLD on the lake!' } } };
  const h = enforceListingHonesty(renamed);
  check('renaming to a listing claim reclassifies the campaign type', h.reclassified === 'just_sold' && h.content.campaignType === 'just_sold');
  check('...and strips the AI image back to the brand design', h.strippedAI && h.content.imageMode === 'brand' && h.content.spec.front.imageUrl === null && h.content.aiNote === null);
  check('a reclassified card refuses future AI imagery', canGenerateImage(h.content.campaignType) === false);
  const clean = enforceListingHonesty(lifestyle);
  check('a non-listing headline is untouched', clean.reclassified === null && clean.content === lifestyle);
  check('applyCopyFields runs the backstop too (the AI seam cannot smuggle a claim)', applyCopyFields(withAI, { headline: 'Open house this weekend' }).campaignType === 'open_house');
  check('a rendition headline instruction runs the backstop', applyRendition(withAI, 'call it "Just Listed"').content.campaignType === 'just_listed');
}

console.log(`\npostcardBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} postcardBoard check(s) failed`);
