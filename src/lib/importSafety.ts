// src/lib/importSafety.ts
// Pure (no supabase / no JSZip) secret-redaction helpers used by the importer. Kept dependency-free
// so they're unit-testable via a tsx verify script. Real .env files have their VALUES stripped on
// import so plaintext credentials never land in the database; templates/examples pass through.

/** A real secrets file (.env, .env.local, .env.production…) — but NOT a template/example. */
export function isEnvSecretFile(path: string): boolean {
  const base = (path.split('/').pop() ?? '').toLowerCase();
  if (!(base === '.env' || base.startsWith('.env.'))) return false;
  return !(base.endsWith('.example') || base.endsWith('.sample') || base.endsWith('.template'));
}

/** Strip secret VALUES while keeping keys/comments. `KEY=secret` → `KEY=<redacted on import>`. */
export function redactEnvValues(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const m = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=)/.exec(line);
      if (!m) return line; // comments, blank lines, anything non-assignment: keep as-is
      return `${m[1]}<redacted on import>`;
    })
    .join('\n');
}
