// src/lib/garvis/farm.ts
// THE FARM — pure core (verified by farm.verify.ts). Geographic prospecting for a real business:
// a neighborhood list of ADDRESSES (email-never, address-first) that the operator buys or pulls
// from county records, imported without losing columns, deduped by a normalized household key,
// screened by the standard farm-viability math, and merged onto the postcard the mailer studio
// already designs. Honesty rules carried through: a source with no mailing-address columns means
// absentee ownership is UNKNOWABLE (never "0 absentee"); unknown turnover says unknown instead of
// a verdict; suppression (do-not-mail) is checked fail-closed at merge time — a household that
// can't be verified mailable is suppressed, not guessed at.
//
// The impure half is farmRun.ts (Supabase reads/writes); the UI is FarmPanel.tsx.

export interface FarmAddress {
  address1: string;
  city: string;
  state: string;
  zip5: string;
}

export interface FarmRecipient {
  fullName: string;                 // '' = unknown → the address block says "Current Resident"
  situs: FarmAddress;               // the property itself
  mail: FarmAddress | null;         // the owner's mailing address, when the source provides one
  isAbsentee: boolean;              // mail present AND genuinely different from situs
  householdKey: string;             // normalized situs — the dedupe + do-not-mail key
  attrs: Record<string, string>;    // every other source column, kept (close date, sale price…)
}

export interface FarmParseResult {
  recipients: FarmRecipient[];
  rejected: { line: number; reason: string }[];
  duplicatesInFile: number;
  mailingDataPresent: boolean;      // false = absentee status is unknowable from this file, not zero
}

// ---------------------------------------------------------------------------
// Address normalization — the household key must match "123 N. Main Street"
// with "123 n main st" without pretending to be a CASS engine.

const SUFFIX: Record<string, string> = {
  street: 'st', avenue: 'ave', av: 'ave', drive: 'dr', road: 'rd', lane: 'ln', court: 'ct',
  circle: 'cir', boulevard: 'blvd', place: 'pl', trail: 'trl', terrace: 'ter', highway: 'hwy',
  parkway: 'pkwy', square: 'sq', point: 'pt', crossing: 'xing',
  north: 'n', south: 's', east: 'e', west: 'w',
  apartment: '#', apt: '#', unit: '#', suite: '#', ste: '#',
};

export function normalizeAddressLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[.,'’]/g, ' ')
    .replace(/#/g, ' # ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIX[t] ?? t)
    .join(' ');
}

export function zip5(zip: string): string {
  const m = zip.trim().match(/\d{5}/);
  return m ? m[0] : '';
}

/** The dedupe + do-not-mail key: normalized street line + city + ZIP5. */
export function householdKey(a: FarmAddress): string {
  return [normalizeAddressLine(a.address1), a.city.trim().toLowerCase(), zip5(a.zip5) || a.zip5.trim().toLowerCase()]
    .filter(Boolean)
    .join('|');
}

/** Same household? Compare the street line first; only let ZIPs disagree when both are present. */
function sameAddress(a: FarmAddress, b: FarmAddress): boolean {
  if (normalizeAddressLine(a.address1) !== normalizeAddressLine(b.address1)) return false;
  const az = zip5(a.zip5); const bz = zip5(b.zip5);
  if (az && bz && az !== bz) return false;
  return true;
}

// ---------------------------------------------------------------------------
// CSV — a proper quoted parser (a "Smith, John" owner must not split the row).

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Match a header column by candidate names — exact first, then substring — with an optional
 *  exclusion (so "address" never grabs "mailing address" for the situs slot). */
function findCol(headers: string[], candidates: string[], exclude?: RegExp): number {
  for (const c of candidates) {
    const ix = headers.findIndex((h) => h === c && !(exclude && exclude.test(h)));
    if (ix !== -1) return ix;
  }
  for (const c of candidates) {
    const ix = headers.findIndex((h) => h.includes(c) && !(exclude && exclude.test(h)));
    if (ix !== -1) return ix;
  }
  return -1;
}

const ATTR_CAP = 12;

/** Parse a farm list CSV (county export, PropertyRadar, Cole, anything with headers).
 *  KEEPS the columns the audience importer used to discard — they land in attrs. */
export function parseFarmCsv(text: string): FarmParseResult {
  const rows = parseCsvRows(text);
  const empty: FarmParseResult = { recipients: [], rejected: [], duplicatesInFile: 0, mailingDataPresent: false };
  if (rows.length === 0) return empty;
  if (rows.length === 1) return { ...empty, rejected: [{ line: 1, reason: 'only a header row — no data rows' }] };

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const notMail = /mail|owner/;
  const col = {
    name: findCol(headers, ['owner name', 'owner 1 name', 'owner1 name', 'full name', 'owner', 'name'], /street|city|state|zip|company|business|address|addr|mail/),
    situs1: findCol(headers, ['situs address', 'property address', 'site address', 'street address', 'situs addr', 'address'], notMail),
    situsCity: findCol(headers, ['situs city', 'property city', 'site city', 'city'], notMail),
    situsState: findCol(headers, ['situs state', 'property state', 'site state', 'state'], notMail),
    situsZip: findCol(headers, ['situs zip', 'property zip', 'site zip', 'zip code', 'zipcode', 'zip', 'postal code'], notMail),
    mail1: findCol(headers, ['mailing address', 'mail address', 'owner mailing address', 'owner address', 'mailing addr', 'mail addr']),
    mailCity: findCol(headers, ['mailing city', 'mail city', 'owner city']),
    mailState: findCol(headers, ['mailing state', 'mail state', 'owner state']),
    mailZip: findCol(headers, ['mailing zip code', 'mailing zip', 'mail zip', 'owner zip']),
  };

  if (col.situs1 === -1) {
    return { ...empty, rejected: [{ line: 1, reason: "couldn't find a property-address column (looked for: situs/property/site/street address)" }] };
  }

  const picked = new Set(Object.values(col).filter((ix) => ix !== -1));
  const get = (r: string[], ix: number) => (ix >= 0 && ix < r.length ? r[ix].trim() : '');

  const recipients: FarmRecipient[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const situs: FarmAddress = {
      address1: get(r, col.situs1),
      city: get(r, col.situsCity),
      state: get(r, col.situsState).toUpperCase(),
      zip5: zip5(get(r, col.situsZip)),
    };
    if (!situs.address1) { rejected.push({ line: i + 1, reason: 'no property address' }); continue; }
    if (!situs.city && !situs.zip5) { rejected.push({ line: i + 1, reason: 'no city or ZIP' }); continue; }

    let mail: FarmAddress | null = null;
    if (col.mail1 !== -1) {
      const m1 = get(r, col.mail1);
      if (m1) {
        mail = {
          address1: m1,
          city: get(r, col.mailCity),
          state: get(r, col.mailState).toUpperCase(),
          zip5: zip5(get(r, col.mailZip)),
        };
      }
    }

    const key = householdKey(situs);
    if (seen.has(key)) { duplicatesInFile++; continue; }
    seen.add(key);

    const attrs: Record<string, string> = {};
    headers.forEach((h, ix) => {
      if (picked.has(ix)) return;
      const v = get(r, ix);
      if (v && Object.keys(attrs).length < ATTR_CAP) attrs[h] = v.slice(0, 200);
    });

    recipients.push({
      fullName: get(r, col.name),
      situs,
      mail,
      isAbsentee: !!mail && !sameAddress(mail, situs),
      householdKey: key,
      attrs,
    });
  }

  return { recipients, rejected, duplicatesInFile, mailingDataPresent: col.mail1 !== -1 };
}

// ---------------------------------------------------------------------------
// Address block — what actually prints on the card. Mail goes to the OWNER's
// mailing address when the source gave one (that's the absentee play), else the property.

export function addressBlockLines(r: FarmRecipient): string[] | null {
  const a = r.mail ?? r.situs;
  if (!a.address1 || !a.city || !a.state || !zip5(a.zip5)) return null;
  return [r.fullName || 'Current Resident', a.address1, `${a.city}, ${a.state} ${zip5(a.zip5)}`];
}

export interface MergePartition {
  mailable: FarmRecipient[];
  suppressed: { recipient: FarmRecipient; reason: string }[];
}

/** The MAIL-HOUSE CSV — the addressed list a print vendor needs to run a real drop, so a 1,500-piece
 *  mailing doesn't have to squeeze through a browser print dialog. Callers pass the MAILABLE partition
 *  only (do-not-mail + incomplete addresses already excluded — the suppression never leaks into the
 *  export). Uses the owner's mailing address when present (that's where mail actually goes), the
 *  "Current Resident" convention for unknown names, and RFC-4180 quoting. Pure + deterministic. */
export function farmCsv(mailable: FarmRecipient[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = mailable.map((r) => {
    const a = r.mail ?? r.situs;
    return [r.fullName || 'Current Resident', a.address1, a.city, a.state, a.zip5, r.isAbsentee ? 'yes' : 'no']
      .map(esc).join(',');
  });
  return ['full_name,address1,city,state,zip,absentee_owner', ...rows].join('\n');
}

/** Fail-closed merge gate: on the do-not-mail list → suppressed; can't compose a complete
 *  USPS address block → suppressed with the reason. Nothing prints on a guess. */
export function partitionMailable(recipients: FarmRecipient[], doNotMailKeys: ReadonlySet<string>): MergePartition {
  const mailable: FarmRecipient[] = [];
  const suppressed: { recipient: FarmRecipient; reason: string }[] = [];
  for (const r of recipients) {
    if (doNotMailKeys.has(r.householdKey)) { suppressed.push({ recipient: r, reason: 'do-not-mail' }); continue; }
    if (!addressBlockLines(r)) { suppressed.push({ recipient: r, reason: 'incomplete address (needs street, city, state, ZIP)' }); continue; }
    mailable.push(r);
  }
  return { mailable, suppressed };
}

// ---------------------------------------------------------------------------
// Farm economics — the go/no-go the blueprint specified: pieces × postage is computed,
// the turnover screen decides, and an unknown turnover is an honest unknown, never a verdict.

export interface FarmMathInput {
  homes: number;
  pieceCostUsd: number;             // all-in per piece (print + postage)
  dropsPerYear: number;
  soldLast12: number | null;        // homes sold in the last 12 months — from her MLS, never guessed
  avgGciUsd?: number | null;        // her average gross commission per listing, if she knows it
}

export interface FarmMathResult {
  perDropUsd: number;
  annualCostUsd: number;
  turnoverPct: number | null;
  verdict: 'strong' | 'viable' | 'thin' | 'dont' | 'unknown';
  line: string;
  listingsToBreakEven: number | null;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function farmMath(input: FarmMathInput): FarmMathResult {
  const homes = Math.max(0, Math.floor(input.homes));
  const drops = Math.max(0, Math.floor(input.dropsPerYear));
  const piece = Math.max(0, input.pieceCostUsd);

  if (homes === 0) {
    return { perDropUsd: 0, annualCostUsd: 0, turnoverPct: null, verdict: 'unknown', listingsToBreakEven: null,
      line: 'No homes yet — import a list or enter the neighborhood size to run the math.' };
  }

  const perDropUsd = Math.round(homes * piece * 100) / 100;
  const annualCostUsd = Math.round(perDropUsd * drops * 100) / 100;
  const costLine = `${usd(perDropUsd)}/drop, ${usd(annualCostUsd)}/yr at ${homes.toLocaleString('en-US')} homes × ${drops} drops`;
  const small = homes < 200 ? ' (NB: under the 200-piece EDDM minimum and well below the ~500-home farm floor.)' : '';

  const listingsToBreakEven = input.avgGciUsd && input.avgGciUsd > 0
    ? Math.round((annualCostUsd / input.avgGciUsd) * 10) / 10
    : null;
  const beLine = listingsToBreakEven != null ? ` Break-even: ${listingsToBreakEven} listing${listingsToBreakEven === 1 ? '' : 's'}/yr.` : '';

  if (input.soldLast12 == null) {
    return { perDropUsd, annualCostUsd, turnoverPct: null, verdict: 'unknown', listingsToBreakEven,
      line: `Turnover unknown — enter homes sold in the last 12 months (from the MLS) to get a verdict. Cost side: ${costLine}.${beLine}${small}` };
  }

  const turnoverPct = Math.round((Math.max(0, input.soldLast12) / homes) * 1000) / 10;
  let verdict: FarmMathResult['verdict'];
  let judgement: string;
  if (turnoverPct >= 8) { verdict = 'strong'; judgement = `${turnoverPct}% turnover — a strong farm by the standard screen (≥8%).`; }
  else if (turnoverPct >= 6) { verdict = 'viable'; judgement = `${turnoverPct}% turnover — viable (the screen wants ≥6%).`; }
  else if (turnoverPct >= 5) { verdict = 'thin'; judgement = `${turnoverPct}% turnover — thin. Below the 6% bar; workable only with a real edge here.`; }
  else { verdict = 'dont'; judgement = `${turnoverPct}% turnover — the standard screen says don't farm this one; the postage outruns the listings.`; }

  return { perDropUsd, annualCostUsd, turnoverPct, verdict, listingsToBreakEven,
    line: `${judgement} ${costLine}.${beLine}${small}` };
}
