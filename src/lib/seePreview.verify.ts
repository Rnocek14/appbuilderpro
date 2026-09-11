// Run: npx tsx src/lib/seePreview.verify.ts
// Pins SW9.6 — the agent looks at what it built: the see_preview tool exists with the honest
// degrade, the loop carries image-bearing results as real content blocks, the capture rides the
// EXISTING shell-rasterizer seam (no duplicate screenshot machinery), and the build prompt
// nudges self-critique after UI changes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const here = dirname(fileURLToPath(import.meta.url));
const tools = readFileSync(join(here, 'agent/tools.ts'), 'utf8');
const loop = readFileSync(join(here, 'agent/loop.ts'), 'utf8');
const prompts = readFileSync(join(here, '../../supabase/functions/_shared/prompts.ts'), 'utf8');
const pane = readFileSync(join(here, '../components/editor/PreviewPane.tsx'), 'utf8');
const pkg = readFileSync(join(here, '../../package.json'), 'utf8');

check('the see_preview tool is registered with an honest description',
  tools.includes("name: 'see_preview'") && tools.includes('Degrades honestly'));
check('the activity feed says what is happening', tools.includes("ctx.onActivity?.('Looking at the preview')"));
check('a closed preview degrades to a named state, never an invented view',
  tools.includes('The preview is not open — nothing to look at.'));
check('the capture rides the EXISTING shell-rasterizer seam (no second screenshot machinery)',
  tools.includes('captureScreenshot') && pane.includes('registerScreenshotCapture(') && !pkg.includes('html2canvas'));
check('the screenshot is labeled APPROXIMATE in the tool result',
  tools.includes('APPROXIMATE — the preview shell rasterizes its own DOM'));
check('a missing screenshot is said plainly, with the fallback named',
  tools.includes('No screenshot available'));
check('the loop carries image-bearing results as real content blocks',
  loop.includes("{ type: 'image', source: { type: 'base64'"));
check('…while text-only results stay plain strings exactly as before',
  loop.includes(': out.text,'));
check('run_typecheck verification reads the structured text, not the object', loop.includes('test(out.text)'));
check('the build prompt nudges self-critique after UI changes',
  prompts.includes('see_preview — LOOK at the running preview') && prompts.includes('compiling is not the same as looking'));

console.log(`\nseePreview.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} see_preview check(s) failed`);
