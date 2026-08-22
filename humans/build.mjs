/* humans/ build — merges the ten regional research files into one dataset.

   Every derived measure is computed HERE, never typed into the source records,
   so a person's "years to fortune" can never disagree with the year they started.
   Mirrors the rule the Scarcity board already follows in src/rents.js.

   Usage:  node humans/build.mjs            merge + validate + write humans.json
           node humans/build.mjs --check    validate only, non-zero exit on error  */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');

export const ASOF = '2026-08';
const ASOF_YEAR = 2026;

/* Wealth bands. The whole point of the dataset is that it spans these, so the
   band edges are declared once and drive the histogram, the filter and the
   coverage report together. */
export const BANDS = [
  { id: 'b1', lo: 0.1,  hi: 0.25, n: '$100M - $250M' },
  { id: 'b2', lo: 0.25, hi: 0.5,  n: '$250M - $500M' },
  { id: 'b3', lo: 0.5,  hi: 1.0,  n: '$500M - $1B'   },
  { id: 'b4', lo: 1.0,  hi: 2.5,  n: '$1B - $2.5B'   },
  { id: 'b5', lo: 2.5,  hi: 5.0,  n: '$2.5B - $5B'   },
];

/* US regions. The census is US-only, so "region" is domestic geography — which is
   also the axis the sourcing varies along: Bay Area fortunes are visible through
   S-1s and 13Gs, Midwest industrial ones are private and only surface in a sale. */
/* Age bands. The 45 line is the one the census is organised around, so it falls
   on a band edge rather than inside one — under-45 is exactly the first four. */
export const AGEBANDS = [
  { id: 'a1', lo: 0,  hi: 30, n: 'Under 30' },
  { id: 'a2', lo: 30, hi: 35, n: '30-34' },
  { id: 'a3', lo: 35, hi: 40, n: '35-39' },
  { id: 'a4', lo: 40, hi: 45, n: '40-44' },
  { id: 'a5', lo: 45, hi: 55, n: '45-54' },
  { id: 'a6', lo: 55, hi: 65, n: '55-64' },
  { id: 'a7', lo: 65, hi: 200, n: '65+' },
];
export const U45 = ['a1', 'a2', 'a3', 'a4'];

export const REGIONS = {
  bay:   'SF Bay Area',
  socal: 'Southern California',
  pnw:   'Pacific Northwest',
  mtn:   'Mountain West & Plains',
  tx:    'Texas',
  mw:    'Midwest',
  se:    'Southeast',
  ne:    'Northeast (ex-NYC)',
  nyc:   'New York metro',
  dc:    'DC, Maryland & Virginia',
};

export const SECTORS = {
  tech: 'Technology', finance: 'Finance', industry: 'Industry & manufacturing',
  consumer: 'Consumer goods', realestate: 'Real estate', energy: 'Energy',
  health: 'Health & pharma', media: 'Media & entertainment', retail: 'Retail',
  logistics: 'Logistics & transport', agri: 'Agriculture & food',
  crypto: 'Crypto & digital assets', other: 'Other',
};

const PROV = { R: 'Reported', E: 'Estimated', I: 'Inferred' };

const STATES = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS ' +
  'MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));
const ORIGINS = { self: 'Self-made', inherited: 'Inherited', mixed: 'Mixed' };

const bandOf = (nw) => BANDS.find((b) => nw >= b.lo && nw < b.hi) || BANDS[BANDS.length - 1];
const ageBandOf = (a) => (a == null ? null : (AGEBANDS.find((b) => a >= b.lo && a < b.hi) || AGEBANDS[AGEBANDS.length - 1]).id);

/* Derived measures — computed, never typed. */
function derive(r) {
  const years = r.started ? ASOF_YEAR - r.started : null;
  return {
    ...r,
    band: bandOf(r.nw).id,
    ageb: ageBandOf(r.age),
    u45: r.age != null ? r.age < 45 : null,      // the census's primary cut
    years,                                                  // time taken to reach today's figure
    // $M of net worth accumulated per year since starting. The single most
    // comparable number across a 40-year industrialist and a 6-year exit.
    vel: years && years > 0 ? +((r.nw * 1000) / years).toFixed(1) : null,
    // age at which they first crossed $100M
    ageAt100: r.startAge != null && r.toFirst100 != null ? r.startAge + r.toFirst100 : null,
    // years spent compounding AFTER the first $100M
    since100: years != null && r.toFirst100 != null ? Math.max(0, years - r.toFirst100) : null,
  };
}

const PROSE = ['did', 'why', 'obst', 'turn'];
const REQ = ['id', 'n', 'city', 'state', 'country', 'region', 'nw', 'p', 'c', 's', 'm',
  'sect', 'origin', 'co', 'did', 'started', 'startAge', 'why', 'comp', 'obst', 'turn'];

function validate(rows) {
  const errs = [];
  const warns = [];
  const seen = new Map();
  const E = (r, msg) => errs.push(`${r.id || '<no id>'}: ${msg}`);

  for (const r of rows) {
    for (const k of REQ) if (r[k] === undefined || r[k] === null || r[k] === '') E(r, `missing ${k}`);
    if (seen.has(r.id)) E(r, `duplicate id survived resolution (also in ${seen.get(r.id)})`);
    else seen.set(r.id, r._src);
    if (!/^[A-Z0-9_]+$/.test(r.id || '')) E(r, 'id must be A-Z 0-9 _');
    if (!(r.nw >= 0.1 && r.nw <= 5.0)) E(r, `nw ${r.nw} outside the $100M-$5B scope`);
    if (!PROV[r.p]) E(r, `bad provenance tag ${r.p}`);
    if (!(r.c > 0 && r.c <= 1)) E(r, `confidence ${r.c} outside (0,1]`);
    if (!REGIONS[r.region]) E(r, `unknown region ${r.region}`);
    if (!SECTORS[r.sect]) E(r, `unknown sector ${r.sect}`);
    if (!ORIGINS[r.origin]) E(r, `unknown origin ${r.origin}`);
    if (r.country !== 'US') E(r, `this census is US-only, got country ${r.country}`);
    if (!STATES.has(r.state)) E(r, `unknown USPS state code ${r.state}`);
    if (!Array.isArray(r.comp) || !r.comp.length) E(r, 'comp must be a non-empty array');
    if (r.started && (r.started < 1900 || r.started > ASOF_YEAR)) E(r, `started ${r.started} implausible`);
    if (r.startAge != null && (r.startAge < 10 || r.startAge > 90)) E(r, `startAge ${r.startAge} implausible`);
    // age must be consistent with started/startAge, within a year of rounding
    if (r.age != null && r.started && r.startAge != null) {
      const implied = r.startAge + (ASOF_YEAR - r.started);
      if (Math.abs(implied - r.age) > 2) E(r, `age ${r.age} disagrees with started ${r.started} + startAge ${r.startAge} (implies ${implied})`);
    }
    if (r.toFirst100 != null && r.started && r.started + r.toFirst100 > ASOF_YEAR)
      E(r, `crossed $100M in ${r.started + r.toFirst100}, after the as-of year`);
    for (const k of PROSE) {
      if (typeof r[k] === 'string') {
        if (r[k].length > 340) E(r, `${k} is ${r[k].length} chars, over the 340 cap`);
        if (/\n/.test(r[k])) E(r, `${k} contains a newline`);
        if (r[k].length < 25) warns.push(`${r.id}: ${k} is only ${r[k].length} chars — likely too thin`);
      }
    }
  }
  return { errs, warns };
}

function coverage(rows) {
  const by = (fn) => rows.reduce((a, r) => { const k = fn(r); a[k] = (a[k] || 0) + 1; return a; }, {});
  return {
    total: rows.length,
    band: by((r) => r.band),
    region: by((r) => r.region),
    sect: by((r) => r.sect),
    origin: by((r) => r.origin),
    prov: by((r) => r.p),
    u45: rows.filter((r) => r.u45).length,
    states: new Set(rows.map((r) => r.state)).size,
    ageb: by((r) => r.ageb),
    cities: new Set(rows.map((r) => r.city)).size,
    totalNw: +rows.reduce((a, r) => a + r.nw, 0).toFixed(1),
  };
}

const files = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
let rows = [];  // eslint-disable-line prefer-const
for (const f of files) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(join(DATA, f), 'utf8')); }
  catch (e) { console.error(`FATAL ${f}: ${e.message}`); process.exit(1); }
  if (!Array.isArray(parsed)) { console.error(`FATAL ${f}: not a JSON array`); process.exit(1); }
  rows.push(...parsed.map((r) => ({ ...r, _src: f })));
  console.log(`  ${f.padEnd(14)} ${String(parsed.length).padStart(3)} records`);
}

/* Cross-file duplicates are expected: ten independent passes, and a person can sit in
   both a geographic slice and a national vertical. Two passes reaching the same person
   from the same filing is corroboration, not an error — so resolve rather than reject,
   deterministically and out loud. Highest source confidence wins; ties go to the first
   file alphabetically so the result never depends on directory order.

   A material disagreement between the two figures is the interesting case, and it is
   preserved in the surviving record's methodology field rather than silently discarded:
   two people reading one filing and getting different numbers means one of them is
   wrong, and the reader should be able to see that. */
const dupes = new Map();
for (const r of rows) {
  const prev = dupes.get(r.id);
  if (!prev) { dupes.set(r.id, r); continue; }
  const [keep, drop] = (r.c > prev.c || (r.c === prev.c && r._src < prev._src)) ? [r, prev] : [prev, r];
  const gap = Math.abs(keep.nw - drop.nw) / Math.max(keep.nw, drop.nw);
  console.log(`  dup ${r.id}: kept ${keep._src} ($${keep.nw}B, c=${keep.c}) over ${drop._src} ($${drop.nw}B, c=${drop.c})`
    + (gap > 0.1 ? `  <- FIGURES DISAGREE by ${Math.round(gap * 100)}%` : ''));
  if (gap > 0.1) {
    keep.m += ` A second independent pass priced this at $${drop.nw}B from the same filing (${drop.s});`
      + ` the two disagree by ${Math.round(gap * 100)}% and the higher-confidence read is shown.`;
    keep.c = Math.min(keep.c, 0.5);   // an unresolved disagreement is not a confident figure
  }
  dupes.set(r.id, keep);
}
rows = [...dupes.values()];

const { errs, warns } = validate(rows);
if (warns.length) { console.log(`\n${warns.length} warning(s):`); warns.slice(0, 20).forEach((w) => console.log(`  ! ${w}`)); }
if (errs.length) {
  console.error(`\n${errs.length} ERROR(S):`);
  errs.slice(0, 60).forEach((e) => console.error(`  x ${e}`));
  process.exit(1);
}

rows = rows.map(derive).sort((a, b) => b.nw - a.nw);
rows.forEach((r) => delete r._src);

const cov = coverage(rows);
console.log(`\n${cov.total} people | ${cov.states} states | ${cov.cities} cities | $${cov.totalNw}B combined`);
console.log('bands  ', BANDS.map((b) => `${b.n}: ${cov.band[b.id] || 0}`).join('  |  '));
console.log('prov   ', Object.entries(cov.prov).map(([k, v]) => `${k}:${v}`).join('  '));
console.log(`under 45: ${cov.u45} of ${cov.total} (${Math.round((cov.u45 / cov.total) * 100)}%)`);
console.log('ages   ', AGEBANDS.map((b) => `${b.n}: ${cov.ageb[b.id] || 0}`).join('  |  '));

if (!process.argv.includes('--check')) {
  writeFileSync(join(HERE, 'humans.json'), JSON.stringify({ asof: ASOF, rows }, null, 0));

  /* Inline the data into the template -> one self-contained humans/index.html,
     the same shape the root build produces for the main site. No fetch, so it
     opens straight off the filesystem and off Pages alike. */
  const page = readFileSync(join(HERE, 'template.html'), 'utf8')
    .replace('/*__DATA__*/null', JSON.stringify({ asof: ASOF, rows }))
    .replace('/*__BANDS__*/null', JSON.stringify(BANDS))
    .replace('/*__AGEBANDS__*/null', JSON.stringify(AGEBANDS))
    .replace('/*__REGIONS__*/null', JSON.stringify(REGIONS))
    .replace('/*__SECTORS__*/null', JSON.stringify(SECTORS));
  if (page.includes('__DATA__')) { console.error('FATAL: data placeholder not substituted'); process.exit(1); }
  writeFileSync(join(HERE, 'index.html'), page);

  /* Artifact build. Same page, minus the document wrapper: the Artifact host
     supplies <!doctype>/<html>/<head>/<body> and a CSS reset, so shipping our own
     would nest a document inside a document. Everything else is already inline —
     no external CSS, JS, fonts or images — which is what the Artifact CSP requires. */
  const art = page
    .replace(/^[\s\S]*?<meta name="viewport"[^>]*>\s*/, '')   // drop doctype/html/head open + meta
    .replace(/<\/head>\s*<body>\s*/, '')
    .replace(/\s*<\/body>\s*<\/html>\s*$/, '\n');
  for (const tag of ['<!doctype', '<html', '<head>', '<body>', '</html>']) {
    if (art.toLowerCase().includes(tag)) { console.error(`FATAL: artifact still contains ${tag}`); process.exit(1); }
  }
  if (!art.trimStart().startsWith('<title>')) { console.error('FATAL: artifact must open with <title>'); process.exit(1); }
  writeFileSync(join(HERE, 'artifact.html'), art);
  console.log(`wrote humans/humans.json + humans/index.html (${(page.length / 1024).toFixed(0)} KB)`
    + ` + humans/artifact.html (${(art.length / 1024).toFixed(0)} KB)`);
}
