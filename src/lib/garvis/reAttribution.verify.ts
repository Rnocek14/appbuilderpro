// Run: npx tsx src/lib/garvis/reAttribution.verify.ts
import { srcForPost, srcForCampaign, taggedLink, parseSrc, attributionLevel, attributionFields } from './reAttribution';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reAttribution.verify');

const POST = '00000000-0000-4000-8000-0000000000b4';
const CAMPAIGN = '11111111-1111-4111-8111-111111111111';

// ---- minting and reading a tag --------------------------------------------
{
  check('a post tag round-trips', parseSrc(srcForPost(POST)).id === POST && parseSrc(srcForPost(POST)).kind === 'post');
  check('a campaign tag round-trips', parseSrc(srcForCampaign(CAMPAIGN)).id === CAMPAIGN && parseSrc(srcForCampaign(CAMPAIGN)).kind === 'campaign');
  check('a post tag is never mistaken for a campaign tag', parseSrc(srcForPost(POST)).kind !== 'campaign');
  check('the two kinds are distinguishable by the tag alone', srcForPost(POST) !== srcForCampaign(POST));
  check('case does not break it', parseSrc(srcForPost(POST).toUpperCase()).id === POST);
}

// ---- anything that is not ours stays raw, never becomes an id -------------
{
  for (const foreign of ['postcard-qr', 'social', 'gc_abcd1234', 're_p_not-a-uuid', 're_x_' + POST, '']) {
    const p = parseSrc(foreign);
    check(`"${foreign || '(empty)'}" is not read as an id`, p.kind === 'other' && p.id === null);
  }
  check('the raw value survives for first/last source', parseSrc('postcard-qr').raw === 'postcard-qr');
  check('junk never throws', parseSrc(null).kind === 'other' && parseSrc(42).kind === 'other');
}

// ---- tagging a link --------------------------------------------------------
{
  const src = srcForPost(POST);
  check('a plain url gets the tag', taggedLink('https://gina.example/abbey', src).includes(`?src=${src}`));
  check('an existing query string is preserved', taggedLink('https://gina.example/abbey?a=1', src) === `https://gina.example/abbey?a=1&src=${src}`);
  check('a fragment stays at the end', taggedLink('https://gina.example/abbey#dues', src) === `https://gina.example/abbey?src=${src}#dues`);
  check('tagging is idempotent', taggedLink(taggedLink('https://gina.example/abbey', src), src) === taggedLink('https://gina.example/abbey', src));
  check('an empty url is left alone', taggedLink('', src) === '');
  check('an empty tag never mangles the url', taggedLink('https://gina.example/abbey', '') === 'https://gina.example/abbey');
}

// ---- THE RULE: unknown is a real answer -----------------------------------
{
  check('what the prospect SAID is the strongest evidence',
    attributionLevel({ statedInfluence: 'Saw your post about the dues' }) === 'stated');
  check('a stated influence outranks a tag',
    attributionLevel({ src: srcForPost(POST), resolved: true, statedInfluence: 'A friend told me' }) === 'stated');
  check('a tag that RESOLVED is inferred, not stated',
    attributionLevel({ src: srcForPost(POST), resolved: true }) === 'inferred');
  check('a tag that resolved to NOTHING proves nothing',
    attributionLevel({ src: srcForPost(POST), resolved: false }) === 'unknown');
  check('a foreign tag is not attribution',
    attributionLevel({ src: 'postcard-qr', resolved: true }) === 'unknown');
  check('no evidence at all is UNKNOWN — never the latest campaign',
    attributionLevel({}) === 'unknown');
  check('whitespace is not a stated influence', attributionLevel({ statedInfluence: '   ' }) === 'unknown');
}

// ---- what actually gets written -------------------------------------------
{
  const resolved = attributionFields({ src: srcForPost(POST), resolvedPostId: POST, resolvedCampaignId: CAMPAIGN });
  check('a resolved post is written', resolved.post_id === POST);
  check('and its campaign with it', resolved.campaign_id === CAMPAIGN);
  check('the source is recorded both as first and last on a first touch',
    resolved.first_source === srcForPost(POST) && resolved.last_source === srcForPost(POST));

  const unresolved = attributionFields({ src: srcForPost(POST) });
  check('an UNRESOLVED tag writes no post id at all', unresolved.post_id === undefined);
  check('but the raw source is still kept', unresolved.last_source === srcForPost(POST));

  const returning = attributionFields({ src: 'social', existingFirstSource: 'postcard-qr' });
  check('a returning person keeps their FIRST source', returning.first_source === 'postcard-qr');
  check('and gains the new last source', returning.last_source === 'social');

  const nothing = attributionFields({});
  check('no source writes nothing rather than an empty string', Object.keys(nothing).length === 0);

  const said = attributionFields({ statedInfluence: '  Saw the dues post  ' });
  check('what they said is stored trimmed and verbatim', said.stated_influence === 'Saw the dues post');
  check('a blank statement is not stored', attributionFields({ statedInfluence: '  ' }).stated_influence === undefined);
}

console.log(`\nreAttribution.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reAttribution check(s) failed`);
