// src/lib/garvis/data.ts
// DATA & NUMBERS WORKSPACE — pure core (no Supabase, no DOM; verified by data.verify.ts).
//
// The #3 objective class. Where the answering desk drafts replies and the document studio produces
// documents, this analyzes STRUCTURED DATA — a pasted or uploaded CSV becomes a typed table, real
// summary statistics, and honest aggregations you can chart. Garvis had no CSV/table/number
// primitive at all; this is it.
//
// The discipline that makes it trustworthy is the no-theater law at its sharpest: EVERY NUMBER IS
// COMPUTED HERE, deterministically, in pure code. The model is NEVER asked to do arithmetic — it only
// narrates over the facts this module hands it, and is forbidden from stating a figure that isn't in
// them. A chart is only ever drawn from a real aggregation. Numbers come from computation; prose only
// interprets. That is the whole contract.

export type ColType = 'number' | 'date' | 'text';
export type Cell = string | number | null;

export interface Column { name: string; type: ColType }
export interface Table { columns: Column[]; rows: Cell[][] }

// ---------------------------------------------------------------------------
// CSV parsing — a real parser (quotes, embedded commas, escaped quotes, CRLF)
// ---------------------------------------------------------------------------

/** Split CSV text into records, honoring quoted fields with embedded commas/newlines and "" escapes. */
function splitRecords(text: string): string[][] {
  const s = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  // Drop a trailing empty record (file ended with a newline).
  return rows.filter((r, i) => !(i === rows.length - 1 && r.length === 1 && r[0].trim() === ''));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/** Coerce a raw cell to a number if it reads as one (strips $ , % and whitespace); else null. */
export function toNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const cleaned = t.replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function looksLikeDate(raw: string): boolean {
  const t = raw.trim();
  return DATE_RE.test(t) && !Number.isNaN(Date.parse(t));
}

/** Infer a column's type from its non-empty cells: number if all numeric, date if all date-shaped,
 *  else text. An empty column is text. */
function inferType(cells: string[]): ColType {
  const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return 'text';
  if (nonEmpty.every((c) => toNumber(c) !== null)) return 'number';
  if (nonEmpty.every(looksLikeDate)) return 'date';
  return 'text';
}

/** Parse CSV text into a typed table. First record is the header row. Numeric columns carry numbers;
 *  empty cells become null. Throws only when there is no header at all. */
export function parseCSV(text: string): Table {
  const records = splitRecords(text);
  if (records.length === 0 || records[0].every((h) => !h.trim())) {
    throw new Error('No columns found — the first row should be a header (comma-separated names).');
  }
  const headers = records[0].map((h, i) => h.trim() || `column_${i + 1}`);
  const body = records.slice(1);
  const width = headers.length;

  const columnCells: string[][] = headers.map((_, ci) => body.map((r) => (r[ci] ?? '').trim()));
  const columns: Column[] = headers.map((name, ci) => ({ name, type: inferType(columnCells[ci]) }));

  const rows: Cell[][] = body.map((r) => columns.map((col, ci) => {
    const raw = (r[ci] ?? '').trim();
    if (!raw) return null;
    if (col.type === 'number') return toNumber(raw);
    return raw;
  }));

  // Pad/trim ragged rows to the header width so callers can index safely.
  const normalized = rows.map((r) => (r.length === width ? r : Array.from({ length: width }, (_, i) => r[i] ?? null)));
  return { columns, rows: normalized };
}

// ---------------------------------------------------------------------------
// Statistics — every figure computed here, never by a model
// ---------------------------------------------------------------------------

export interface NumberStats { kind: 'number'; name: string; count: number; missing: number; sum: number; mean: number; min: number; max: number; median: number; stddev: number }
export interface TextStats { kind: 'text'; name: string; count: number; missing: number; distinct: number; top: { value: string; count: number }[] }
export interface DateStats { kind: 'date'; name: string; count: number; missing: number; min: string; max: string }
export type ColumnStats = NumberStats | TextStats | DateStats;

function colValues(table: Table, ci: number): Cell[] { return table.rows.map((r) => r[ci]); }

function numberStats(name: string, values: Cell[]): NumberStats {
  const nums = values.filter((v): v is number => typeof v === 'number');
  const missing = values.length - nums.length;
  if (nums.length === 0) return { kind: 'number', name, count: 0, missing, sum: 0, mean: 0, min: 0, max: 0, median: 0, stddev: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = nums.length > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1) : 0;
  return { kind: 'number', name, count: nums.length, missing, sum, mean, min: sorted[0], max: sorted[sorted.length - 1], median, stddev: Math.sqrt(variance) };
}

function textStats(name: string, values: Cell[]): TextStats {
  const present = values.filter((v): v is string => typeof v === 'string' && v !== '');
  const missing = values.length - present.length;
  const counts = new Map<string, number>();
  for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));
  return { kind: 'text', name, count: present.length, missing, distinct: counts.size, top };
}

function dateStats(name: string, values: Cell[]): DateStats {
  const present = values.filter((v): v is string => typeof v === 'string' && v !== '');
  const missing = values.length - present.length;
  const sorted = [...present].sort((a, b) => Date.parse(a) - Date.parse(b));
  return { kind: 'date', name, count: present.length, missing, min: sorted[0] ?? '', max: sorted[sorted.length - 1] ?? '' };
}

/** Compute honest per-column statistics for the whole table. */
export function describe(table: Table): ColumnStats[] {
  return table.columns.map((col, ci) => {
    const values = colValues(table, ci);
    if (col.type === 'number') return numberStats(col.name, values);
    if (col.type === 'date') return dateStats(col.name, values);
    return textStats(col.name, values);
  });
}

// ---------------------------------------------------------------------------
// Aggregation — the only source a chart is ever drawn from
// ---------------------------------------------------------------------------

export type Agg = 'sum' | 'mean' | 'count' | 'min' | 'max';
export interface GroupRow { key: string; value: number; n: number }

/** Group rows by `byCol` and aggregate `valueCol` (ignored for 'count'). Deterministic order:
 *  by value descending, then key. Returns [] when the columns don't support the op. */
export function groupBy(table: Table, byCol: string, valueCol: string, agg: Agg): GroupRow[] {
  const bi = table.columns.findIndex((c) => c.name === byCol);
  const vi = table.columns.findIndex((c) => c.name === valueCol);
  if (bi === -1) return [];
  if (agg !== 'count' && (vi === -1 || table.columns[vi].type !== 'number')) return [];

  const buckets = new Map<string, number[]>();
  for (const row of table.rows) {
    const key = row[bi] == null ? '(blank)' : String(row[bi]);
    const v = agg === 'count' ? 1 : row[vi];
    if (agg !== 'count' && typeof v !== 'number') continue; // skip non-numeric value cells
    const arr = buckets.get(key) ?? [];
    arr.push(agg === 'count' ? 1 : (v as number));
    buckets.set(key, arr);
  }

  const rows: GroupRow[] = [...buckets.entries()].map(([key, arr]) => {
    const n = arr.length;
    let value: number;
    switch (agg) {
      case 'count': value = n; break;
      case 'sum': value = arr.reduce((a, b) => a + b, 0); break;
      case 'mean': value = arr.reduce((a, b) => a + b, 0) / n; break;
      case 'min': value = Math.min(...arr); break;
      case 'max': value = Math.max(...arr); break;
    }
    return { key, value, n };
  });
  return rows.sort((a, b) => (b.value - a.value) || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Formatting + grounding for the (optional) narrative
// ---------------------------------------------------------------------------

/** A compact, human number: thousands separators, ≤2 decimals, no trailing zeros. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** The deterministic FACT SHEET the model narrates over — the only numbers it is allowed to use. */
export function dataFacts(table: Table, stats: ColumnStats[]): string {
  const lines = [`TABLE: ${table.rows.length} rows × ${table.columns.length} columns.`];
  for (const s of stats) {
    if (s.kind === 'number') {
      lines.push(`- ${s.name} (number): count ${s.count}, sum ${fmtNum(s.sum)}, mean ${fmtNum(s.mean)}, median ${fmtNum(s.median)}, min ${fmtNum(s.min)}, max ${fmtNum(s.max)}, stddev ${fmtNum(s.stddev)}${s.missing ? `, missing ${s.missing}` : ''}.`);
    } else if (s.kind === 'date') {
      lines.push(`- ${s.name} (date): ${s.count} values, from ${s.min || '?'} to ${s.max || '?'}${s.missing ? `, missing ${s.missing}` : ''}.`);
    } else {
      const top = s.top.map((t) => `${t.value} (${t.count})`).join(', ');
      lines.push(`- ${s.name} (text): ${s.count} values, ${s.distinct} distinct${top ? `; most common: ${top}` : ''}${s.missing ? `; missing ${s.missing}` : ''}.`);
    }
  }
  return lines.join('\n');
}

export const DATA_SYSTEM = `You are Garvis interpreting a dataset for the owner. You are given a FACT
SHEET of statistics that were computed exactly from their data. Rules:
- Use ONLY the numbers in the FACT SHEET. NEVER state a figure that isn't there, and NEVER compute a
  new number yourself — if a question needs a statistic the fact sheet doesn't contain, say what
  you'd need to compute instead of guessing.
- Point out what actually stands out: the largest/smallest, spread (stddev vs mean), skew (mean vs
  median), missing data, or a lopsided category. Plain, specific, no filler.
- Do not invent causes or business conclusions the data can't support; distinguish what the numbers
  SHOW from what they might SUGGEST.
- A few tight sentences or short bullets. Plain text, no markdown fences.`;

/** Build the user turn: the owner's question (optional) + the computed fact sheet. */
export function buildDataUser(question: string, facts: string): string {
  return [
    `FACT SHEET (the only numbers you may use):`,
    facts,
    ``,
    question.trim() ? `QUESTION: ${question.trim().slice(0, 500)}` : `Summarize what stands out in this data.`,
    ``,
    `Interpret now, using only the fact sheet.`,
  ].join('\n');
}

/** A saved analysis becomes a deterministic record on the world's shelf: the computed fact sheet is
 *  the substance (numbers that stand without any AI), the narrative rides along if present. */
export function analysisArtifact(title: string, facts: string, narrative: string): { id: string; kind: 'doc'; title: string; detail: string; source: 'garvis' } {
  let h = 5381;
  for (const ch of `${title}:${facts}`) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  const id = `data-${(h >>> 0).toString(36)}`;
  const detail = narrative.trim() ? `${narrative.trim()}\n\n— computed from —\n${facts}` : facts;
  return { id, kind: 'doc', title: `Analysis: ${title}`.slice(0, 80), detail, source: 'garvis' };
}
