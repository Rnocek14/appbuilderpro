// scripts/kitcheck.ts — extract the scaffold's UI kit (template strings) to a temp tree and
// typecheck it as a real project, so kit changes can't ship TSX that doesn't compile.
// Run: npx tsx scripts/kitcheck.ts && npx tsc -p .tmp-kitcheck/tsconfig.json
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCAFFOLD_FILES } from '../supabase/functions/_shared/scaffold';

const root = join(process.cwd(), '.tmp-kitcheck');
rmSync(root, { recursive: true, force: true });

for (const f of SCAFFOLD_FILES) {
  // Only source files — skip config/entry (main.tsx imports App which doesn't exist here).
  if (!f.path.startsWith('/src/') || f.path === '/src/main.tsx' || f.path.endsWith('.css')) continue;
  const target = join(root, f.path.slice(1));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, f.content);
}

writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2020', lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext',
    moduleResolution: 'bundler', jsx: 'react-jsx', strict: false, noEmit: true,
    skipLibCheck: true, esModuleInterop: true, isolatedModules: true,
    // resolve react/lucide-react/clsx from the repo's node_modules
    typeRoots: ['../node_modules/@types'],
  },
  include: ['src'],
}, null, 2));

console.log('kit extracted to .tmp-kitcheck (' + SCAFFOLD_FILES.length + ' scaffold files)');
