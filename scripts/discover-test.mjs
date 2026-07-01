// Intense, real testing of the Discover stack — runs in Node (no browser → no CORS), so it isolates
// "do the APIs + keys + parsing actually work and return relevant results?" from "does the browser
// block them?". Usage: node scripts/discover-test.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PPLX = env.VITE_PERPLEXITY_API_KEY;
const SERPER = env.VITE_SERPER_API_KEY;

const TOPICS = ['black holes', 'the Roman Empire', 'how do bee hives work', 'direct mail marketing', 'bioluminescence', 'how LLMs work'];

const trunc = (s, n = 90) => (s || '').replace(/\s+/g, ' ').slice(0, n);

async function perplexity(topic) {
  const t0 = Date.now();
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PPLX}` },
      body: JSON.stringify({ model: 'sonar', return_images: true, max_tokens: 450, messages: [
        { role: 'system', content: 'Explain the topic to a curious mind: a vivid, specific, genuinely interesting 3-5 sentence understanding. No preamble.' },
        { role: 'user', content: topic },
      ] }),
    });
    if (!res.ok) return `  PPLX  ✗ HTTP ${res.status} ${trunc(await res.text(), 120)}`;
    const d = await res.json();
    const overview = d?.choices?.[0]?.message?.content ?? '';
    const images = d?.images ?? [];
    const sources = d?.search_results ?? d?.citations ?? [];
    return `  PPLX  ✓ ${Date.now() - t0}ms | overview ${overview.length}ch | images ${images.length} | sources ${sources.length}\n        “${trunc(overview, 140)}”`;
  } catch (e) { return `  PPLX  ✗ ${e.message}`; }
}

async function serper(path, topic, body) {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://google.serper.dev/${path}`, {
      method: 'POST', headers: { 'X-API-KEY': SERPER, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) return { err: `HTTP ${res.status} ${trunc(await res.text(), 120)}`, ms: Date.now() - t0 };
    return { data: await res.json(), ms: Date.now() - t0 };
  } catch (e) { return { err: e.message, ms: Date.now() - t0 }; }
}

async function wiki(topic) {
  const t0 = Date.now();
  try {
    const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`)).json();
    const title = s?.query?.search?.[0]?.title;
    if (!title) return `  WIKI  ✗ no page match`;
    const p = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=480&titles=${encodeURIComponent(title)}&format=json&origin=*`)).json();
    const page = Object.values(p?.query?.pages ?? {})[0];
    return `  WIKI  ✓ ${Date.now() - t0}ms | page "${title}" | extract ${(page?.extract || '').length}ch | thumb ${page?.thumbnail ? 'yes' : 'no'}`;
  } catch (e) { return `  WIKI  ✗ ${e.message}`; }
}

console.log(`Keys: PPLX ${PPLX ? 'present' : 'MISSING'} · SERPER ${SERPER ? 'present' : 'MISSING'}\n`);
for (const topic of TOPICS) {
  console.log(`\n=== ${topic.toUpperCase()} ===`);
  console.log(await perplexity(topic));
  const imgs = await serper('images', topic, { q: topic });
  console.log(imgs.err ? `  IMG   ✗ ${imgs.err}` : `  IMG   ✓ ${imgs.ms}ms | ${imgs.data?.images?.length ?? 0} images | e.g. ${trunc(imgs.data?.images?.[0]?.title, 60)}`);
  const vids = await serper('videos', `${topic} explained`, { q: `${topic} explained` });
  console.log(vids.err ? `  VID   ✗ ${vids.err}` : `  VID   ✓ ${vids.ms}ms | ${vids.data?.videos?.length ?? 0} videos | e.g. ${trunc(vids.data?.videos?.[0]?.title, 60)}`);
  const srch = await serper('search', topic, { q: topic });
  if (srch.err) console.log(`  PAA   ✗ ${srch.err}`);
  else {
    const paa = (srch.data?.peopleAlsoAsk ?? []).map((p) => p.question).slice(0, 3);
    const rel = (srch.data?.relatedSearches ?? []).map((r) => r.query).slice(0, 3);
    console.log(`  PAA   ✓ ${srch.ms}ms | peopleAlsoAsk ${srch.data?.peopleAlsoAsk?.length ?? 0}, related ${srch.data?.relatedSearches?.length ?? 0}\n        PAA: ${paa.join(' | ') || '—'}\n        REL: ${rel.join(' | ') || '—'}`);
  }
  console.log(await wiki(topic));
}
console.log('\ndone.');
