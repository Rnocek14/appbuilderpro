// Run: npx tsx src/lib/garvis/socialBoard.verify.ts
// The social board adapter meets the honesty rules the same way the postcard one does: kinds are
// well-formed, the AI-image gate holds (a listing post can never carry an AI image), unknowns stay
// [EDIT] holes, a rendition is always visibly different (new platform or restyled image but never a
// replaced real photo), and per-platform image sizing is correct.
import {
  SOCIAL_KINDS_RE, SOCIAL_KINDS_GENERIC, socialKindsFor, socialKindById, defaultSocialKind,
  buildSocialContent, applySocialRendition, withGeneratedImage, withPhoto, socialImagePrompt,
  tileAllowsAI, sizeForPlatform, composeSocialText, PLATFORM_ORDER, applySocialCopy,
  type SocialMaterials, type SocialKind,
} from './socialBoard';
import { canGenerateImage } from './imagegen';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('socialBoard.verify');

const withPhotos: SocialMaterials = { businessName: 'Lakeside Realty', area: 'Lake Geneva', realEstate: true, accent: '#2e6f95', avatarUrl: null, images: [{ url: 'https://img/hero.jpg', caption: 'home', label: 'hero' }] };
const noPhotos: SocialMaterials = { ...withPhotos, images: [] };
const blank: SocialMaterials = { businessName: '', area: null, realEstate: true, accent: '#2e6f95', avatarUrl: null, images: [] };
const ALL: SocialKind[] = [...SOCIAL_KINDS_RE, ...SOCIAL_KINDS_GENERIC];

check('kinds are well-formed with unique ids', new Set(ALL.map((k) => k.id)).size === ALL.length && SOCIAL_KINDS_RE.length >= 5 && SOCIAL_KINDS_GENERIC.length >= 3);
check('needsRealPhoto mirrors the AI-image honesty gate', ALL.every((k) => k.needsRealPhoto === !canGenerateImage(k.campaignType)));
check('the listing kinds require a real photo', ['just_listed', 'just_sold', 'open_house'].every((id) => socialKindById(id)!.needsRealPhoto));
check('socialKindsFor / kindById / defaultKind resolve, and the default allows AI', socialKindsFor(true) === SOCIAL_KINDS_RE && !!socialKindById('market_tip') && !defaultSocialKind(true).needsRealPhoto);

// --- building: image sourcing honesty + real facts fill in ---------------------------------
{
  const listed = buildSocialContent({ materials: withPhotos, kind: socialKindById('just_listed')!, platform: 'instagram' });
  check('listing + real photo → photo mode, photo on the post', listed.imageMode === 'photo' && listed.imageUrl === 'https://img/hero.jpg');
  check('caption fills the real area', /Lake Geneva/.test(listed.caption));

  const listedNoPhoto = buildSocialContent({ materials: noPhotos, kind: socialKindById('just_sold')!, platform: 'facebook' });
  check('listing with NO photo → brand card, never a fake image', listedNoPhoto.imageMode === 'brand' && listedNoPhoto.imageUrl === null);

  const tip = buildSocialContent({ materials: noPhotos, kind: socialKindById('market_tip')!, platform: 'instagram' });
  check('lifestyle kind opens as a brand card until an image is made', tip.imageMode === 'brand');

  const ai = buildSocialContent({ materials: noPhotos, kind: socialKindById('market_tip')!, platform: 'facebook', image: { url: 'https://img/ai.png', mode: 'ai', note: 'AI illustration' } });
  check('an AI image applied → ai mode + note + image', ai.imageMode === 'ai' && ai.aiNote === 'AI illustration' && ai.imageUrl === 'https://img/ai.png');

  const blankPost = buildSocialContent({ materials: blank, kind: socialKindById('promo')!, platform: 'x' });
  check('blank materials → specifics are visible [EDIT] holes', /\[EDIT/.test(`${blankPost.caption} ${blankPost.hashtags.join(' ')}`));
}

// --- the AI-image prompt respects the gate -------------------------------------------------
{
  const tip = buildSocialContent({ materials: noPhotos, kind: socialKindById('market_tip')!, platform: 'instagram' });
  const p1 = socialImagePrompt(tip, noPhotos, 'bright, editorial');
  check('lifestyle tile → an honest image prompt is built', p1.ok === true && /Lake Geneva/.test((p1 as { prompt: string }).prompt));
  const listing = buildSocialContent({ materials: withPhotos, kind: socialKindById('just_listed')!, platform: 'facebook' });
  check('listing tile → AI image REFUSED with a reason', socialImagePrompt(listing, withPhotos, 'x').ok === false);
  check('tileAllowsAI mirrors the gate', tileAllowsAI(tip) === true && tileAllowsAI(listing) === false);
}

// --- renditions: always visibly different, never replacing a real photo --------------------
{
  const base = buildSocialContent({ materials: noPhotos, kind: socialKindById('market_tip')!, platform: 'instagram' });
  const named = applySocialRendition(base, 'make a version for LinkedIn');
  check('naming a platform switches to it', named.content.platform === 'linkedin' && named.wantsImage === false);

  const styled = applySocialRendition(base, 'warmer, golden hour');
  check('a style instruction on a lifestyle tile flags an image regen', styled.wantsImage === true && styled.imageStyle === 'warmer, golden hour');

  const emptyR = applySocialRendition(base, '   ');
  check('an empty instruction cycles to the next platform (visibly different)', emptyR.content.platform === 'facebook' && emptyR.wantsImage === false);

  const listing = buildSocialContent({ materials: withPhotos, kind: socialKindById('just_listed')!, platform: 'instagram' });
  const listStyle = applySocialRendition(listing, 'brighter sky');
  check('a style instruction on a listing tile NEVER regenerates over the real photo', listStyle.wantsImage === false);
}

// --- apply results + platform sizing + compose ---------------------------------------------
{
  const base = buildSocialContent({ materials: noPhotos, kind: socialKindById('tip')!, platform: 'x' });
  check('withGeneratedImage → ai + note + url', withGeneratedImage(base, 'https://x.png', 'n').imageMode === 'ai');
  check('withPhoto → photo + url', withPhoto(base, 'https://y.jpg').imageUrl === 'https://y.jpg');
  check('Instagram → square, others → landscape', sizeForPlatform('instagram') === '1024x1024' && sizeForPlatform('facebook') === '1536x1024' && sizeForPlatform('x') === '1536x1024');
  check('composeSocialText: X inlines tags, others block them', composeSocialText('x', 'hi', ['#a']) === 'hi #a' && composeSocialText('instagram', 'hi', ['#a']) === 'hi\n\n#a');
  check('PLATFORM_ORDER covers the four surfaces', PLATFORM_ORDER.join() === 'instagram,facebook,linkedin,x');
}

// --- the copy seam's pure applier: words only, image gate untouchable ------------------------
{
  const m: SocialMaterials = { businessName: 'Lakeside Realty', area: 'Lake Geneva', realEstate: true, accent: '#2e6f95', avatarUrl: null, images: [] };
  const base = buildSocialContent({ materials: m, kind: socialKindsFor(true)[0], platform: 'instagram' });
  const out = applySocialCopy(base, { caption: 'Kayak season on the lake 🛶 [EDIT: date]', hashtags: ['#LakeLife', ' kayak ', '', 'a', 'b', 'c', 'd', 'e'] });
  check('applySocialCopy sets the caption (holes preserved)', out.caption.startsWith('Kayak season') && out.caption.includes('[EDIT: date]'));
  check('hashtags are normalized: # stripped, blanks dropped, capped at 6', out.hashtags.length === 6 && out.hashtags[0] === 'LakeLife' && out.hashtags[1] === 'kayak');
  check('image fields are untouchable from the copy applier', out.imageMode === base.imageMode && out.imageUrl === base.imageUrl);
  const kept = applySocialCopy(base, { caption: '   ', hashtags: [] });
  check('empty fields keep the current words', kept.caption === base.caption && kept.hashtags === base.hashtags);
}

console.log(`\nsocialBoard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} socialBoard check(s) failed`);
