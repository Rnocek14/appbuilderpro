// supabase/functions/_shared/generateDriver.ts — THE SHARED GENERATION DRIVER (SW9.3).
// The off-browser generation pipeline is built ONCE, here: the orchestration that turns a
// blueprint into a working file tree — contracts-first shell, the authoritative page manifest
// from App.tsx's own imports, the sliding parallel page fan-out, truncation guards, and the
// manifest-diff retry — extracted from aiClient.ts's chunkedGenerate and made runtime-neutral
// through injected deps. Consumers:
//   - src/lib/aiClient.ts (browser): deps = rawComplete + project_files upserts + stage marks.
//   - scripts/headless-generate.mjs (CI): deps = direct Anthropic calls + disk writes.
//   - SW10's server-side resume consumes the same core.
// Every prompt builder it uses is the SAME pure module the browser uses — parity by import,
// not by copy. Verified by generateDriver.verify.ts.

import { GENERATE_FILES_STREAM, filesPromptStream, filesPromptChunk } from '../../../src/lib/prompts.ts';
import { looksTruncated } from '../../../src/lib/qaCheck.ts';
import { parseProtocol } from './streamparse.ts';

export interface DriverCall { text: string; stopReason?: string | null; inputTokens: number; outputTokens: number }

export interface DriverDeps {
  /** One model call. The caller owns metering/tracking; the driver owns prompts and caps. */
  complete(messages: { role: 'system' | 'user'; content: string }[], maxTokens: number): Promise<DriverCall>;
  /** Persist ACCEPTED changes (already filtered — reserved paths never reach this). */
  persist(changes: { path: string; content: string }[]): Promise<void>;
  /** Stage telemetry — same vocabulary as the browser's mark(). */
  mark(stage: string, status: 'running' | 'done', note?: string): Promise<void>;
  /** Concurrent page calls (browser direct: 6; relay: 4; CI: caller's choice). */
  parallelism: number;
}

/** App.tsx's own ./pages imports are the authoritative manifest — both static and lazy forms. */
export function pagesFromAppTsx(appTsx: string): string[] {
  const pagePaths = new Set<string>();
  const addSpec = (spec: string) => {
    if (!spec.startsWith('./pages/')) return;
    let p = '/src/' + spec.slice(2);
    if (!/\.(t|j)sx?$/.test(p)) p += '.tsx';
    pagePaths.add(p);
  };
  for (const m of appTsx.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) addSpec(m[1]);
  for (const m of appTsx.matchAll(/(?:^|\n)\s*import[^'"\n]*from\s*['"]([^'"]+)['"]/g)) addSpec(m[1]);
  return [...pagePaths];
}

/** The verbatim shell every page call compiles against (capped — same cap as the browser). */
export function contractsContext(written: Map<string, string>, cap = 60_000): string {
  return [...written.entries()]
    .filter(([p]) => p.startsWith('/src/'))
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join('\n\n').slice(0, cap);
}

/** The blueprint's declared integrations → the deduped secret manifest (pure). */
export function integrationManifest(blueprint: Record<string, unknown>): {
  integrations: Record<string, unknown>[];
  manifestSecrets: { env: string; service: string; purpose: string; status: 'missing' }[];
} {
  const integrations = Array.isArray(blueprint.integrations)
    ? (blueprint.integrations as Record<string, unknown>[])
    : [];
  const requiredSecrets: { env: string; service: string; purpose: string; status: 'missing' }[] = [];
  for (const it of integrations) {
    const service = typeof it.service === 'string' ? it.service : '';
    const purpose = typeof it.purpose === 'string' ? it.purpose : '';
    const secrets = Array.isArray(it.secrets) ? it.secrets : [];
    for (const s of secrets) if (typeof s === 'string' && s.trim()) requiredSecrets.push({ env: s.trim(), service, purpose, status: 'missing' });
  }
  const secretEnvs = [...new Set(requiredSecrets.map((s) => s.env))];
  return { integrations, manifestSecrets: secretEnvs.map((env) => requiredSecrets.find((s) => s.env === env)!) };
}

export interface DriveFilesResult {
  written: Map<string, string>;
  stillMissing: string[];
}

/** The file-production pipeline: shell → page manifest → sliding-pool fan-out → manifest-diff
 *  retry. Throws when the shell yields no App.tsx or nothing at all was produced — those are
 *  generation failures, not degradations. */
export async function driveFiles(deps: DriverDeps, args: {
  bpJson: string; hasBackend: boolean; hasIntegrations: boolean; reserved: Set<string>;
}): Promise<DriveFilesResult> {
  const written = new Map<string, string>();
  const accept = async (changes: { path: string; content: string }[]) => {
    const kept = changes.filter((f) =>
      f.path && f.content.trim() && !args.reserved.has(f.path) && !f.path.startsWith('/src/components/ui/'));
    await deps.persist(kept);
    for (const f of kept) written.set(f.path, f.content);
  };

  // 1) SHELL — contracts first: one bounded call; pages are generated against these exact
  // contracts next, so cross-file drift can't happen.
  await deps.mark('file_tree', 'running', 'contracts + shell');
  const shellRaw = await deps.complete([
    { role: 'system', content: GENERATE_FILES_STREAM },
    { role: 'user', content: filesPromptStream(args.bpJson, args.hasBackend, args.hasIntegrations) +
      '\n\nTHIS CALL — CONTRACTS + SHELL ONLY: emit /src/lib types + db.ts' +
      (args.hasIntegrations ? ' + api.ts' : '') +
      ', /src/App.tsx (ALL routes, pages lazy-loaded), shared layout components (shell/nav/footer)' +
      (args.hasIntegrations ? ', and the /supabase/functions/* edge functions' : '') +
      '. Do NOT emit /src/pages/* in this call — each page is generated next against these exact contracts, so App.tsx MAY route to pages not yet emitted (this call only). End with §END.' },
  ], 12_000);
  let shellChanges = parseProtocol(shellRaw.text).changes;
  // A max_tokens-cut call leaves its LAST file half-written — never persist half a file.
  if (shellRaw.stopReason === 'max_tokens' && shellChanges.length && looksTruncated(shellChanges[shellChanges.length - 1].content)) {
    shellChanges = shellChanges.slice(0, -1);
  }
  await accept(shellChanges);
  const appTsx = written.get('/src/App.tsx') ?? '';
  if (!appTsx) throw new Error('The model produced no App.tsx in the shell pass.');

  // 2) PAGE LIST + 3) CONTRACTS CONTEXT
  const pageList = pagesFromAppTsx(appTsx).filter((p) => !written.has(p));
  const contracts = contractsContext(written);

  // 4) PAGES — a SLIDING parallel pool (not batches: a slow page never holds up the next).
  await deps.mark('file_tree', 'running', `${pageList.length} pages, ${deps.parallelism} in parallel`);
  const genPage = async (pagePath: string): Promise<void> => {
    const r = await deps.complete([
      { role: 'system', content: GENERATE_FILES_STREAM },
      { role: 'user', content: filesPromptChunk(args.bpJson, pagePath, contracts, args.hasBackend, args.hasIntegrations) },
    ], 9_000);
    let changes = parseProtocol(r.text).changes;
    if (r.stopReason === 'max_tokens' && changes.length && looksTruncated(changes[changes.length - 1].content)) {
      changes = changes.slice(0, -1);
    }
    if (!changes.some((c) => c.path === pagePath && c.content.trim())) {
      throw new Error(`page ${pagePath} was not emitted`);
    }
    await accept(changes);
    await deps.mark('file_tree', 'running', pagePath.split('/').pop());
  };
  {
    const queue = [...pageList];
    const worker = async () => { for (let p = queue.shift(); p; p = queue.shift()) await genPage(p).catch(() => undefined); };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, deps.parallelism), Math.max(1, queue.length)) }, worker));
  }

  // 5) MANIFEST DIFF — every routed page must exist; one serial retry per missing page.
  for (const p of pageList.filter((x) => !written.has(x))) {
    await deps.mark('file_tree', 'running', `retrying ${p.split('/').pop()}`);
    await genPage(p).catch(() => undefined);
  }
  if (!written.size) throw new Error('The model produced no source files.');
  return { written, stillMissing: pageList.filter((x) => !written.has(x)) };
}
