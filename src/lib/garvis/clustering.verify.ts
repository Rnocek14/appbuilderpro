// src/lib/garvis/clustering.verify.ts
// Dependency-free unit checks for the PURE half of the clustering spike — the deterministic rails
// that must hold no matter what the model returns. Run: npm run verify:clustering
// Mirrors the other garvis *.verify.ts files.

import {
  slugify,
  titleSimilarity,
  normalizeGraph,
  dedupeClusters,
  canonicalizeAgainstPrev,
  applyIdRemap,
  mergeGraphs,
  stabilityReport,
  graphStats,
  relatedClusters,
  universeConnections,
  shouldSpawnCluster,
  shouldSplit,
  splitCluster,
  deriveMaturity,
  pressure,
  addChild,
  parseScene,
  extractSceneField,
  extractScenePartial,
  repairTruncatedJson,
  sceneArtifact,
  sceneOf,
  type Cluster,
  type ClusterGraph,
} from './clustering';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

// test-cluster factory (salience + maturity + artifacts are required on Cluster)
function k(id: string, parentId: string | null, title = id, salience = 0.5): Cluster {
  return { id, parentId, title, summary: '', kind: 'topic', salience, maturity: 'growing', turnRefs: [], artifacts: [] };
}

console.log('clustering.verify');

// --- slugify ---
check('slugify lowercases and kebabs', slugify('Information Paradox!') === 'information-paradox');
check('slugify of empty falls back to "node"', slugify('   ') === 'node');

// --- titleSimilarity (entity resolution signal) ---
check('identical titles → 1', titleSimilarity('Black holes', 'black holes') === 1);
check('substring containment → high', titleSimilarity('information paradox', 'the information paradox') >= 0.6);
check('shared content tokens → matched', titleSimilarity('Hawking radiation basics', 'Basics of Hawking radiation') >= 0.6);
check('unrelated titles → low', titleSimilarity('Black holes', 'Real estate postcards') < 0.3);

// --- normalizeGraph: fails soft + clamps salience ---
check('garbage → empty graph', JSON.stringify(normalizeGraph({} as never)) === '{"clusters":[],"edges":[]}');
{
  const g = normalizeGraph({ clusters: [{ title: 'A', salience: 5 }, { title: 'B' }, { title: '' }] });
  check('drops titleless cluster', g.clusters.length === 2);
  check('clamps salience to 1', g.clusters[0].salience === 1);
  check('defaults missing salience to 0.5', g.clusters[1].salience === 0.5);
  check('assigns slug id from title', g.clusters[0].id === 'a');
}
{
  const g = normalizeGraph({ clusters: [{ title: 'Black Holes' }, { title: 'Black Holes' }] });
  check('dedupes id collision', g.clusters[1].id === 'black-holes-2');
}

// --- normalizeGraph: parent + edge validation ---
{
  const g = normalizeGraph({
    clusters: [{ id: 'a', title: 'A', parentId: 'ghost' }, { id: 'b', title: 'B', parentId: 'a' }],
    edges: [
      { sourceId: 'a', targetId: 'b', type: 'leads_to' },
      { sourceId: 'a', targetId: 'a', type: 'relates' }, // self-loop dropped
      { sourceId: 'a', targetId: 'ghost', type: 'relates' }, // dangling dropped
      { sourceId: 'a', targetId: 'b', type: 'leads_to' }, // dup dropped
    ],
  });
  check('dangling parent → null', g.clusters.find((c) => c.id === 'a')!.parentId === null);
  check('valid parent kept', g.clusters.find((c) => c.id === 'b')!.parentId === 'a');
  check('keeps one valid edge only', g.edges.length === 1);
}

// --- dedupeClusters: merges near-identical titles within a graph ---
{
  const g: ClusterGraph = {
    clusters: [k('black-holes', null, 'Black holes', 0.8), k('black-hole', null, 'Black hole', 0.4), k('mars', null, 'Mars', 0.5)],
    edges: [{ sourceId: 'black-hole', targetId: 'mars', type: 'relates' }],
  };
  const d = dedupeClusters(g);
  check('dedupe collapses near-identical titles', d.clusters.length === 2);
  check('dedupe keeps the higher-salience id', d.clusters.some((c) => c.id === 'black-holes'));
  check('dedupe remaps edge to surviving id', d.edges.some((e) => e.sourceId === 'black-holes' && e.targetId === 'mars'));
}

// --- canonicalizeAgainstPrev: reworded new cluster snaps onto prior id ---
{
  const prev: ClusterGraph = { clusters: [k('information-paradox', null, 'Information paradox', 0.9)], edges: [] };
  const next: ClusterGraph = {
    clusters: [k('information-paradox', null, 'Information paradox', 0.9), k('the-information-paradox', null, 'The information paradox', 0.7)],
    edges: [],
  };
  const canon = canonicalizeAgainstPrev(prev, next);
  check('canonicalize snaps reworded dupe back to prior id', !canon.clusters.some((c) => c.id === 'the-information-paradox'));
  check('canonicalize does not invent extra nodes', canon.clusters.length === 1);
}

// --- mergeGraphs: re-adds dropped prior nodes AND freezes existing parents ---
{
  const prev: ClusterGraph = { clusters: [k('a', null, 'A'), k('b', 'a', 'B')], edges: [] };
  const next: ClusterGraph = {
    clusters: [k('a', null, 'A'), k('b', null, 'B'), k('c', 'a', 'C')], // model tried to re-home b to root; added c
    edges: [],
  };
  const merged = mergeGraphs(prev, next);
  check('merge re-adds nothing dropped here (all present)', merged.clusters.length === 3);
  check('merge keeps the new node (c)', merged.clusters.some((c) => c.id === 'c'));
  check('merge FREEZES existing parent (b stays under a)', merged.clusters.find((c) => c.id === 'b')!.parentId === 'a');
}
{
  const prev: ClusterGraph = { clusters: [k('a', null), k('b', 'a')], edges: [] };
  const next: ClusterGraph = { clusters: [k('a', null), k('c', 'a')], edges: [] }; // model dropped b
  const merged = mergeGraphs(prev, next);
  check('merge re-adds the dropped node (b)', merged.clusters.some((c) => c.id === 'b'));
}

// --- stabilityReport ---
{
  const prev: ClusterGraph = { clusters: [k('a', null), k('b', 'a')], edges: [] };
  const next: ClusterGraph = { clusters: [k('a', null), k('b', null), k('d', null)], edges: [] };
  const rep = stabilityReport(prev, next, 2);
  check('report counts persisted', rep.persisted === 2);
  check('report flags reparented (b)', rep.reparented.length === 1 && rep.reparented[0] === 'b');
  check('report lists added (d)', rep.added.length === 1 && rep.added[0] === 'd');
  check('report carries renamedAnchored', rep.renamedAnchored === 2);
  check('report persistedPct = 1 when none dropped', rep.persistedPct === 1);
}

// --- artifacts parsing ---
{
  const g = normalizeGraph({
    clusters: [{
      title: 'Black holes',
      artifacts: [
        { kind: 'diagram', title: 'Event horizon vs singularity', detail: 'nested circles' },
        { kind: 'nonsense', title: 'A note' }, // bad kind → 'doc'
        { title: '' }, // no title → dropped
      ],
    }],
  });
  check('parses artifacts', g.clusters[0].artifacts.length === 2);
  check('artifact kind clamped to doc', g.clusters[0].artifacts[1].kind === 'doc');
  check('artifact id slugged from title', g.clusters[0].artifacts[0].id === 'event-horizon-vs-singularity');
}

// --- applyIdRemap folds collisions ---
{
  const g: ClusterGraph = { clusters: [k('a', null, 'A'), k('b', null, 'B')], edges: [{ sourceId: 'b', targetId: 'a', type: 'relates' }] };
  const remapped = applyIdRemap(g, new Map([['b', 'a']]));
  check('remap folds b→a (one node)', remapped.clusters.length === 1 && remapped.clusters[0].id === 'a');
  check('remap drops now-self edge', remapped.edges.length === 0);
}

// --- relatedClusters (similar ideas) ---
{
  const g: ClusterGraph = {
    clusters: [k('focus', 'root', 'Information networks'), k('sib', 'root', 'Local news networks'), k('linked', null, 'AI memory'), k('far', null, 'Postcards'), k('root', null, 'Root')],
    edges: [{ sourceId: 'focus', targetId: 'linked', type: 'relates' }],
  };
  const rel = relatedClusters(g, 'focus');
  check('related includes linked node', rel.some((r) => r.id === 'linked' && r.reason === 'linked'));
  check('related includes sibling', rel.some((r) => r.id === 'sib' && r.reason === 'sibling'));
  check('related excludes the parent', !rel.some((r) => r.id === 'root'));
  check('related ranks linked first', rel[0].id === 'linked');
}

// --- clean branching: spawn / split / maturity ---
check('spawn: coherent pair spawns', shouldSpawnCluster({ size: 2, cohesion: 0.7 }) === true);
check('spawn: lone idea does not', shouldSpawnCluster({ size: 1, cohesion: 0.9 }) === false);
check('spawn: incoherent group does not', shouldSpawnCluster({ size: 3, cohesion: 0.4 }) === false);

check('split: small cluster never splits', shouldSplit({ ideas: 5, subgroups: [{ size: 3, cohesion: 0.9 }, { size: 2, cohesion: 0.9 }], heldFor: 5 }) === false);
check('split: big but coherent (one subgroup) stays one node', shouldSplit({ ideas: 10, subgroups: [{ size: 9, cohesion: 0.9 }], heldFor: 5 }) === false);
check('split: big + 2 cohesive subgroups + held → splits', shouldSplit({ ideas: 10, subgroups: [{ size: 5, cohesion: 0.7 }, { size: 4, cohesion: 0.6 }], heldFor: 2 }) === true);
check('split: substructure present but not held yet → waits (no flicker)', shouldSplit({ ideas: 10, subgroups: [{ size: 5, cohesion: 0.7 }, { size: 4, cohesion: 0.6 }], heldFor: 1 }) === false);

{
  const g: ClusterGraph = { clusters: [{ ...k('app-builder', null, 'App builder'), turnRefs: [1, 2, 3, 4] }], edges: [] };
  const split = splitCluster(g, 'app-builder', [
    { title: 'Builder experience', turnRefs: [1, 2] },
    { title: 'Autonomous coding', turnRefs: [3, 4] },
  ]);
  check('split adds 2 children under the parent', split.clusters.filter((c) => c.parentId === 'app-builder').length === 2);
  check('split keeps the parent (only ADDS levels)', split.clusters.some((c) => c.id === 'app-builder' && c.parentId === null));
  check('split refuses with <2 groups', splitCluster(g, 'app-builder', [{ title: 'x', turnRefs: [1] }]).clusters.length === 1);
}

check('maturity: 1 idea → spark', deriveMaturity({ ideas: 1, children: 0, artifacts: 0 }) === 'spark');
check('maturity: 4 ideas → growing', deriveMaturity({ ideas: 4, children: 0, artifacts: 0 }) === 'growing');
check('maturity: 8 ideas → mature', deriveMaturity({ ideas: 8, children: 0, artifacts: 0 }) === 'mature');
check('maturity: branches + outputs → building', deriveMaturity({ ideas: 9, children: 3, artifacts: 2 }) === 'building');
check('maturity: finished wins', deriveMaturity({ ideas: 9, children: 3, artifacts: 2, finished: true }) === 'finished');
check('maturity: idle → dormant', deriveMaturity({ ideas: 4, children: 0, artifacts: 0, idle: true }) === 'dormant');

// --- pressure + addChild (rabbit-hole primitives) ---
{
  const small = { ...k('a', null), turnRefs: [1, 2] };
  const full = { ...k('b', null), turnRefs: [1, 2, 3, 4, 5, 6, 7] };
  check('pressure rises with ideas', pressure(small) < pressure(full));
  check('pressure caps at 1', pressure({ ...k('c', null), turnRefs: Array.from({ length: 20 }, (_, i) => i) }) === 1);
  check('pressure released after branching', pressure(full, 2) === 0);
}
{
  const g: ClusterGraph = { clusters: [k('black-holes', null, 'Black holes')], edges: [] };
  const { graph: g2, id } = addChild(g, 'black-holes', { title: 'Information paradox', kind: 'question' });
  check('addChild creates one child under parent', g2.clusters.some((c) => c.id === id && c.parentId === 'black-holes' && c.kind === 'question'));
  check('addChild new cluster starts as spark', g2.clusters.find((c) => c.id === id)!.maturity === 'spark');
  check('addChild no-ops on unknown parent', addChild(g, 'nope', { title: 'x' }).id === '');
}

// --- universeConnections (the connection engine: distant branches, not family) ---
{
  const g: ClusterGraph = {
    clusters: [
      k('root', null, 'Root'), k('focus', 'root', 'Information networks'), k('child', 'focus', 'Routing protocols'),
      k('sib', 'root', 'Energy systems'), k('other', null, 'Biology'), k('far', 'other', 'Information theory'), k('unrel', 'other', 'Postcards'),
    ],
    edges: [],
  };
  const conns = universeConnections(g, 'focus');
  check('connection finds a distant similar node', conns.some((c) => c.id === 'far'));
  check('connection excludes own descendant', !conns.some((c) => c.id === 'child'));
  check('connection excludes sibling', !conns.some((c) => c.id === 'sib'));
  check('connection flags cross-world', conns.find((c) => c.id === 'far')?.crossWorld === true);
  check('connection excludes dissimilar far node', !conns.some((c) => c.id === 'unrel'));
}

// --- graphStats ---
{
  const g: ClusterGraph = {
    clusters: [k('a', null, 'A', 1), k('b', 'a', 'B', 0), k('lonely', null, 'Lonely', 0.5)],
    edges: [{ sourceId: 'a', targetId: 'b', type: 'relates' }],
  };
  const s = graphStats(g);
  check('stats nodes', s.nodes === 3);
  check('stats roots', s.roots === 2);
  check('stats maxDepth', s.maxDepth === 1);
  check('stats orphans (isolated root, no child, no edge)', s.orphans === 1);
  check('stats avgSalience', Math.abs(s.avgSalience - 0.5) < 1e-9);
}

// --- THE SCENE (the curiosity loop) ---
{
  const good = parseScene({
    prime: 'The queen looks like a ruler.', gap: 'So who actually runs the hive?',
    options: ['The queen', 'Simple worker rules', 'Random chance'], answerIndex: 1,
    beats: ['Nobody runs it — it self-organizes.', 'And that changes what "intelligence" means.'],
    regap: 'Is a hive more like a brain or a city?',
    currents: [{ label: 'Do bees vote?', kind: 'question', tease: 'the answer looks like democracy' }, { label: 'Swarm robotics', kind: 'tangent' }],
  });
  check('parseScene returns a scene', !!good);
  check('scene keeps the named gap', good?.gap === 'So who actually runs the hive?');
  check('scene keeps 2 beats', good?.beats.length === 2);
  check('scene answerIndex preserved', good?.answerIndex === 1);
  check('scene current carries its tease', good?.currents[0].tease === 'the answer looks like democracy');
  check('scene tangent kind preserved', good?.currents[1].kind === 'tangent');
  check('scene answerIndex clamped to options range', parseScene({ gap: 'q', beats: ['b'], options: ['a', 'b'], answerIndex: 9 })?.answerIndex === 1);
  check('scene without gap → null', parseScene({ beats: ['b'] }) === null);
  check('scene without beats → null', parseScene({ gap: 'q' }) === null);
  check('parseScene of garbage → null', parseScene('nope' as never) === null);
  check('scene defaults recipe to reveal', good?.recipe === 'reveal');
}
// --- scene recipes (the art-direction layer) ---
{
  const flip = parseScene({ recipe: 'flip', gap: 'g', beats: ['b'], myth: 'The queen rules.', truth: 'The workers do.' });
  check('flip recipe kept when myth+truth present', flip?.recipe === 'flip' && flip?.truth === 'The workers do.');
  const flipBad = parseScene({ recipe: 'flip', gap: 'g', beats: ['b'] });
  check('flip with no myth/truth falls back to reveal', flipBad?.recipe === 'reveal');
  const big = parseScene({ recipe: 'bigNumber', gap: 'g', beats: ['b'], bigValue: '200,000', bigUnit: 'bee-flights per jar' });
  check('bigNumber recipe kept when bigValue present', big?.recipe === 'bigNumber' && big?.bigValue === '200,000');
  const bigBad = parseScene({ recipe: 'bigNumber', gap: 'g', beats: ['b'] });
  check('bigNumber with no bigValue falls back to reveal', bigBad?.recipe === 'reveal');
  check('mystery recipe passes through', parseScene({ recipe: 'mystery', gap: 'g', beats: ['b'] })?.recipe === 'mystery');
  check('unknown recipe → reveal', parseScene({ recipe: 'explosion', gap: 'g', beats: ['b'] })?.recipe === 'reveal');
}
// scene round-trips through its artifact (persists via universe sync)
{
  const scene = parseScene({ gap: 'why?', beats: ['because.'], options: ['a', 'b', 'c'], answerIndex: 2, regap: 'then what?', currents: [], prime: 'p' })!;
  const art = sceneArtifact({ ...scene, guessed: 2 });
  const c: Cluster = { id: 'x', parentId: null, title: 'X', summary: '', kind: 'topic', salience: 0.5, maturity: 'spark', turnRefs: [], artifacts: [art] };
  const rt = sceneOf(c);
  check('sceneOf reads the scene artifact back', rt?.gap === 'why?' && rt?.answerIndex === 2);
  check('scene guess survives the round trip', rt?.guessed === 2);
}
// progressive field extraction from a partial JSON stream (first-paint)
check('extractSceneField pulls prime from a partial stream', extractSceneField('{"prime":"The queen looks like a ru', 'prime') === 'The queen looks like a ru');
check('extractSceneField pulls gap once it starts', extractSceneField('{"prime":"p","gap":"So who runs it', 'gap') === 'So who runs it');
check('extractSceneField returns empty before the field appears', extractSceneField('{"prime":"p"', 'gap') === '');
check('extractSceneField unescapes a quote', extractSceneField('{"gap":"she said \\"hi\\"', 'gap').includes('"'));

// extractScenePartial — text + which part of the stream is composing (narrates the invisible tail)
{
  const early = extractScenePartial('{"recipe":"reveal","prime":"p","gap":"So who runs it');
  check('scenePartial: gap phase while gap streams', early.text === 'So who runs it' && early.phase === 'gap');
  const opts = extractScenePartial('{"prime":"p","gap":"g?","options":["a","b');
  check('scenePartial: guesses phase once options start', opts.text === 'g?' && opts.phase === 'guesses');
  const beats = extractScenePartial('{"prime":"p","gap":"g?","options":["a","b","c"],"answerIndex":1,"beats":["truth is');
  check('scenePartial: reveal phase once beats start', beats.phase === 'reveal');
  const curr = extractScenePartial('{"gap":"g?","beats":["b"],"regap":"r?","currents":[{"label":"next');
  check('scenePartial: currents phase at the tail', curr.phase === 'currents');
  check('scenePartial: empty before anything paints', extractScenePartial('{"recipe":"rev').phase === '');
}

// repairTruncatedJson — a max_tokens-cut stream still salvages its complete prefix
{
  const midString = '{"prime":"p","gap":"why?","options":["a","b","c"],"answerIndex":0,"beats":["the truth.","and it goes deep';
  const s1 = parseScene(JSON.parse(repairTruncatedJson(midString)));
  check('repair: mid-string cut parses to a scene', s1?.gap === 'why?' && s1?.beats.length === 2);
  const danglingKey = '{"gap":"why?","beats":["b1","b2"],"rega';
  const s2 = parseScene(JSON.parse(repairTruncatedJson(danglingKey)));
  check('repair: dangling half-key is dropped', s2?.beats.length === 2);
  const danglingColon = '{"gap":"why?","beats":["b"],"regap":';
  const s3 = parseScene(JSON.parse(repairTruncatedJson(danglingColon)));
  check('repair: dangling key-colon is dropped', s3?.gap === 'why?');
  const midObject = '{"gap":"g?","beats":["b"],"currents":[{"label":"next thought","kind":"di';
  const s4 = parseScene(JSON.parse(repairTruncatedJson(midObject)));
  check('repair: cut inside a currents object keeps the label', s4?.currents[0]?.label === 'next thought');
  const r5 = repairTruncatedJson('{"gap":"she said \\"hi\\" and then\\');
  check('repair: trailing escape is dropped cleanly', (JSON.parse(r5) as { gap: string }).gap.includes('hi'));
  const complete = '{"gap":"g?","beats":["b"]}';
  check('repair: already-valid JSON passes through', JSON.stringify(JSON.parse(repairTruncatedJson(complete))) === JSON.stringify(JSON.parse(complete)));
}

console.log(`\nclustering.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clustering check(s) failed`);
