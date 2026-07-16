// src/lib/garvis/farm.verify.ts — proof the farm core keeps its promises.
// Run: npx tsx src/lib/garvis/farm.verify.ts

import {
  normalizeAddressLine, zip5, householdKey, parseCsvRows, parseFarmCsv,
  addressBlockLines, partitionMailable, farmMath, type FarmRecipient,
  farmCsv,
} from './farm';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// --- normalization ---------------------------------------------------------
check('suffixes collapse: Street → st', normalizeAddressLine('123 Main Street') === '123 main st');
check('directionals + punctuation: "123 N. Main Street" ≡ "123 n main st"',
  normalizeAddressLine('123 N. Main Street') === normalizeAddressLine('123 n main st'));
check('unit markers unify: Apt 2 ≡ Unit 2 ≡ #2',
  normalizeAddressLine('9 Oak Ave Apt 2') === normalizeAddressLine('9 Oak Avenue Unit 2')
  && normalizeAddressLine('9 Oak Ave Apt 2') === normalizeAddressLine('9 Oak Ave #2'));
check('zip5 strips ZIP+4', zip5('53147-1234') === '53147');
check('zip5 of garbage is empty, not invented', zip5('n/a') === '');
check('household key matches across spellings', householdKey({ address1: '742 Evergreen Terrace', city: 'Lake Geneva', state: 'WI', zip5: '53147' })
  === householdKey({ address1: '742 evergreen ter', city: 'LAKE GENEVA', state: 'wi', zip5: '53147-9001' }));

// --- CSV parsing ------------------------------------------------------------
check('quoted commas survive: "Smith, John" is one cell', parseCsvRows('a,"Smith, John",c')[0][1] === 'Smith, John');
check('escaped quotes survive', parseCsvRows('"say ""hi""",b')[0][0] === 'say "hi"');
check('CRLF handled', parseCsvRows('a,b\r\nc,d').length === 2);

// --- farm list parsing (PropertyRadar-ish headers) ---------------------------
const pr = [
  'Owner Name,Property Address,Property City,Property State,Property Zip,Mailing Address,Mailing City,Mailing State,Mailing Zip,Est Value,Last Sale Date',
  '"Smith, John",742 Evergreen Terrace,Lake Geneva,WI,53147,PO Box 91,Chicago,IL,60601,"$650,000",2019-05-01',
  'Jane Roe,10 Shore Dr,Lake Geneva,WI,53147,10 Shore Drive,Lake Geneva,WI,53147,,2021-03-15',
  ',,,WI,,,,,,,',
  '"Smith, John",742 Evergreen Ter,Lake Geneva,WI,53147-9001,PO Box 91,Chicago,IL,60601,,',
].join('\n');
const p1 = parseFarmCsv(pr);
check('two households parsed (dupe + empty dropped)', p1.recipients.length === 2);
check('duplicate collapsed by household key despite Ter/Terrace + ZIP+4', p1.duplicatesInFile === 1);
check('empty row rejected with a reason', p1.rejected.length === 1 && p1.rejected[0].reason === 'no property address');
check('mailing data recognized', p1.mailingDataPresent === true);
const smith = p1.recipients[0];
check('quoted owner name intact', smith.fullName === 'Smith, John');
check('absentee detected: PO Box in another city', smith.isAbsentee === true);
check('owner-occupied NOT absentee despite Dr/Drive spelling difference', p1.recipients[1].isAbsentee === false);
check('extra columns kept in attrs (value + sale date)', smith.attrs['est value'] === '$650,000' && smith.attrs['last sale date'] === '2019-05-01');

// --- county-style headers, no mailing columns --------------------------------
const county = [
  'PARCEL ID,SITUS ADDRESS,SITUS CITY,SITUS ZIP,OWNER',
   'AB-123,55 Birch Ln,Elkhorn,53121,Chen Wei',
  'AB-124,57 Birch Ln,Elkhorn,53121,',
].join('\n');
const p2 = parseFarmCsv(county);
check('county headers map (situs/owner)', p2.recipients.length === 2 && p2.recipients[0].fullName === 'Chen Wei');
check('no mailing columns → mailingDataPresent false (absentee unknowable, not zero)',
  p2.mailingDataPresent === false && p2.recipients.every((r) => !r.isAbsentee));
check('parcel id kept as attr', p2.recipients[0].attrs['parcel id'] === 'AB-123');

// Regression (double-check): with a mailing-address column but NO name column, the name must stay
// blank ("Current Resident"), never bind to the mailing street.
const noName = parseFarmCsv([
  'Situs Address,Situs City,Situs Zip,Owner Mailing Address,Mailing City,Mailing State,Mailing Zip',
  '5 Fir Rd,Elkhorn,53121,PO Box 7,Chicago,IL,60601',
].join('\n'));
check('mailing column does NOT become the recipient name', noName.recipients.length === 1
  && noName.recipients[0].fullName === '');

// --- honest failures ----------------------------------------------------------
const noAddr = parseFarmCsv('Name,Phone\nJo,555-1212');
check('missing address column named honestly', noAddr.recipients.length === 0
  && noAddr.rejected[0].reason.includes("property-address column"));
check('header-only file says so', parseFarmCsv('Owner Name,Address').rejected[0].reason.includes('no data rows'));
const noCity = parseFarmCsv('Address,State\n1 Elm St,WI');
check('row without city or ZIP rejected with reason', noCity.rejected.length === 1 && noCity.rejected[0].reason === 'no city or ZIP');

// --- address block -------------------------------------------------------------
check('address block uses the MAILING address when present',
  (addressBlockLines(smith) ?? [])[1] === 'PO Box 91' && (addressBlockLines(smith) ?? [])[2] === 'Chicago, IL 60601');
const nameless: FarmRecipient = { fullName: '', situs: { address1: '5 Fir Rd', city: 'Elkhorn', state: 'WI', zip5: '53121' }, mail: null, isAbsentee: false, householdKey: 'k1', attrs: {} };
check('no name → "Current Resident", never invented', (addressBlockLines(nameless) ?? [])[0] === 'Current Resident');
check('incomplete address → null block (no state/ZIP → cannot print)',
  addressBlockLines(p2.recipients[0]) === null); // county file had no state column

// --- merge partition (fail-closed) ---------------------------------------------
const dnm = new Set([smith.householdKey]);
const part = partitionMailable([smith, p1.recipients[1], nameless, p2.recipients[0]], dnm);
check('do-not-mail suppressed', part.suppressed.some((s) => s.reason === 'do-not-mail' && s.recipient === smith));
check('incomplete address suppressed with named reason',
  part.suppressed.some((s) => s.recipient === p2.recipients[0] && s.reason.includes('incomplete address')));
check('clean recipients pass', part.mailable.includes(p1.recipients[1]) && part.mailable.includes(nameless));
check('nothing lost: mailable + suppressed = input', part.mailable.length + part.suppressed.length === 4);

// --- farm math -------------------------------------------------------------------
const unknown = farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: null });
check('unknown turnover → verdict unknown, says so, still computes cost',
  unknown.verdict === 'unknown' && unknown.line.includes('Turnover unknown') && unknown.annualCostUsd === 3300);
check('strong at ≥8%', farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 40 }).verdict === 'strong');
check('viable at 6–8%', farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 33 }).verdict === 'viable');
check('thin at 5–6%', farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 27 }).verdict === 'thin');
check("don't-farm under 5%, and it says why", (() => {
  const m = farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 10 });
  return m.verdict === 'dont' && m.line.includes("don't farm");
})());
check('break-even listings from GCI', farmMath({ homes: 500, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 40, avgGciUsd: 8000 }).listingsToBreakEven === 0.4);
check('zero homes → honest prompt, no division blowup', farmMath({ homes: 0, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: null }).line.includes('No homes yet'));
check('small farm flagged against the EDDM/viability floors',
  farmMath({ homes: 150, pieceCostUsd: 0.55, dropsPerYear: 12, soldLast12: 12 }).line.includes('200-piece'));

// --- determinism ------------------------------------------------------------------
check('deterministic: same file → identical result', JSON.stringify(parseFarmCsv(pr)) === JSON.stringify(parseFarmCsv(pr)));

// --- the mail-house CSV: what a print vendor actually receives -------------------------------
{
  const r = (name: string, addr: string, mail: boolean): FarmRecipient => ({
    fullName: name, situs: { address1: addr, city: 'Lake Geneva', state: 'WI', zip5: '53147' },
    mail: mail ? { address1: '9 Elm "Cottage", Unit B', city: 'Chicago', state: 'IL', zip5: '60601' } : null,
    isAbsentee: mail, householdKey: addr.toLowerCase(), attrs: {},
  });
  const csv = farmCsv([r('Ann Ames', '12 Maple St', false), r('', '77 Oak Ave', true)]);
  const rows = csv.split('\n');
  check('csv has the header + one row per mailable recipient', rows.length === 3 && rows[0] === 'full_name,address1,city,state,zip,absentee_owner');
  check('a known owner mails to the SITUS when no mailing address', rows[1] === 'Ann Ames,12 Maple St,Lake Geneva,WI,53147,no');
  check('unknown name becomes Current Resident; absentee uses the OWNER mailing address', rows[2].startsWith('Current Resident,') && rows[2].includes('60601') && rows[2].endsWith('yes'));
  check('commas + quotes are RFC-4180 escaped', rows[2].includes('"9 Elm ""Cottage"", Unit B"'));
  check('deterministic', farmCsv([r('A', '1 St', false)]) === farmCsv([r('A', '1 St', false)]));
}

console.log(`\nfarm.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
