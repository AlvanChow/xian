// Unit tests for the static dataset (src/data.js) and, when present, the
// generated facts module (src/facts.js). Runs under node's built-in test
// runner: `npm run test:unit` (node --test tests/unit/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COMPANIES, FLOWS, STATE_SHARES } from '../../src/data.js';
import { MIN_YEAR as YEAR_MIN, MAX_YEAR as YEAR_MAX, PERIODS } from '../../src/years.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PROVS = new Set(['R', 'E', 'I']);
const SECS = new Set(['tech', 'fin', 'energy', 'health', 'cons', 'ind', 'gov', 'telecom', 'materials', 'utilities']);
const VALID_KINDS = new Set(['tax', 'household', 'banking', 'energy', 'dividend', 'govt_transfer', 'govt_tax', 'central_bank', 'govt_procurement', 'wage', 'foundry', 'supply', 'payment_net', 'tac', 'cloud_spend', 'other']);
const ids = new Set(COMPANIES.map((c) => c.id));

test('COMPANIES have unique, non-empty ids', () => {
  const seen = new Set();
  for (const c of COMPANIES) {
    assert.equal(typeof c.id, 'string', `id must be a string: ${JSON.stringify(c.id)}`);
    assert.ok(c.id.length > 0, 'id must be non-empty');
    assert.ok(!seen.has(c.id), `duplicate company id: ${c.id}`);
    seen.add(c.id);
  }
  assert.ok(COMPANIES.length > 0, 'COMPANIES must not be empty');
});

test('COMPANIES have valid coordinates', () => {
  for (const c of COMPANIES) {
    assert.ok(Number.isFinite(c.lat) && c.lat >= -90 && c.lat <= 90,
      `${c.id}: lat out of range: ${c.lat}`);
    assert.ok(Number.isFinite(c.lng) && c.lng >= -180 && c.lng <= 180,
      `${c.id}: lng out of range: ${c.lng}`);
  }
});

test('COMPANIES have valid financials and provenance', () => {
  for (const c of COMPANIES) {
    assert.ok(Number.isFinite(c.rev) && c.rev > 0, `${c.id}: rev must be > 0, got ${c.rev}`);
    assert.ok(Number.isFinite(c.mcap) && c.mcap >= 0, `${c.id}: mcap must be >= 0, got ${c.mcap}`);
    assert.ok(PROVS.has(c.prov), `${c.id}: prov must be one of R/E/I, got ${c.prov}`);
  }
});

test('COMPANIES have name, country and sector', () => {
  for (const c of COMPANIES) {
    assert.ok(typeof c.name === 'string' && c.name.length > 0, `${c.id}: name missing`);
    assert.ok(typeof c.country === 'string' && c.country.length > 0, `${c.id}: country missing`);
    assert.ok(typeof c.sec === 'string' && c.sec.length > 0, `${c.id}: sec missing`);
    assert.ok(SECS.has(c.sec), `${c.id}: sec must be a known sector, got ${c.sec}`);
  }
});

test('FLOWS reference existing companies and are not self-loops', () => {
  for (const fl of FLOWS) {
    assert.ok(ids.has(fl.f), `flow source not in COMPANIES: ${fl.f}`);
    assert.ok(ids.has(fl.t), `flow target not in COMPANIES: ${fl.t}`);
    assert.notEqual(fl.f, fl.t, `self-loop flow: ${fl.f}`);
  }
  assert.ok(FLOWS.length > 0, 'FLOWS must not be empty');
});

test('FLOWS have valid value, provenance and confidence', () => {
  for (const fl of FLOWS) {
    const tag = `${fl.f}->${fl.t}`;
    assert.ok(Number.isFinite(fl.v) && fl.v > 0, `${tag}: v must be > 0, got ${fl.v}`);
    assert.ok(PROVS.has(fl.p), `${tag}: p must be one of R/E/I, got ${fl.p}`);
    assert.ok(Number.isFinite(fl.c) && fl.c > 0 && fl.c <= 1, `${tag}: c must be in (0,1], got ${fl.c}`);
  }
});

test('FLOWS have non-empty methodology and source strings', () => {
  for (const fl of FLOWS) {
    const tag = `${fl.f}->${fl.t}`;
    assert.ok(typeof fl.m === 'string' && fl.m.length > 0, `${tag}: m must be a non-empty string`);
    assert.ok(typeof fl.s === 'string' && fl.s.length > 0, `${tag}: s must be a non-empty string`);
  }
});

test('FLOWS with explicit k field use a valid kind', () => {
  for (const fl of FLOWS) {
    if (!('k' in fl)) continue;
    const tag = `${fl.f}->${fl.t}`;
    assert.ok(VALID_KINDS.has(fl.k), `${tag}: k must be a known kind, got ${fl.k}`);
  }
});

test('FLOWS have no duplicate f|t pairs', () => {
  const seen = new Set();
  for (const fl of FLOWS) {
    const key = `${fl.f}|${fl.t}`;
    assert.ok(!seen.has(key), `duplicate flow pair: ${key}`);
    seen.add(key);
  }
});

test('STATE_SHARES are keyed by COMPANIES ids with valid metadata', () => {
  const entries = Object.entries(STATE_SHARES);
  assert.ok(entries.length > 0, 'STATE_SHARES must not be empty');
  for (const [id, sb] of entries) {
    assert.ok(ids.has(id), `STATE_SHARES key is not a COMPANIES id: ${id}`);
    assert.ok(typeof sb.m === 'string' && sb.m.length > 0, `${id}: m must be a non-empty string`);
    assert.ok(typeof sb.s === 'string' && sb.s.length > 0, `${id}: s must be a non-empty string`);
    assert.ok(PROVS.has(sb.p), `${id}: p must be one of R/E/I, got ${sb.p}`);
    assert.ok(typeof sb.t === 'string' && sb.t.length > 0, `${id}: t (unit singular) must be a non-empty string`);
    assert.ok(typeof sb.tp === 'string' && sb.tp.length > 0, `${id}: tp (unit plural) must be a non-empty string`);
  }
});

test('STATE_SHARES rows have unique names/abbreviations and shares summing to 1', () => {
  for (const [id, sb] of Object.entries(STATE_SHARES)) {
    const names = new Set();
    const abbrs = new Set();
    let sum = 0;
    for (const r of sb.rows) {
      assert.ok(typeof r.n === 'string' && r.n.length > 0, `${id}: row name missing`);
      assert.ok(/^[A-Z]{2}$/.test(r.a), `${id}/${r.n}: abbreviation must be two capitals, got ${r.a}`);
      assert.ok(Number.isFinite(r.sh) && r.sh > 0 && r.sh < 1, `${id}/${r.n}: sh must be in (0,1), got ${r.sh}`);
      assert.ok(!names.has(r.n), `${id}: duplicate state name: ${r.n}`);
      assert.ok(!abbrs.has(r.a), `${id}: duplicate state abbreviation: ${r.a}`);
      names.add(r.n);
      abbrs.add(r.a);
      sum += r.sh;
    }
    assert.ok(Math.abs(sum - 1) < 1e-9, `${id}: shares must sum to 1, got ${sum}`);
  }
});

test('STATE_SHARES for USHH covers all 50 states plus DC', () => {
  assert.ok(STATE_SHARES.USHH, 'USHH breakdown must exist');
  assert.equal(STATE_SHARES.USHH.rows.length, 51, 'expected 50 states + DC');
});

test('every household macro node has a regional breakdown', () => {
  const households = COMPANIES.filter((c) => /HH$/.test(c.id)).map((c) => c.id);
  assert.ok(households.length >= 5, `expected several household nodes, found ${households.length}`);
  for (const id of households) {
    assert.ok(STATE_SHARES[id], `household node ${id} is missing a STATE_SHARES breakdown`);
  }
});

// --- src/facts.js (optional, generated) -----------------------------------
// facts.js may be produced by a separate pipeline and is allowed to be absent.
// Its exact shape isn't pinned down yet, so extractYearValues() accepts the
// plausible encodings of a per-year revenue series.
let FACTS = null;
try {
  const mod = await import('../../src/facts.js');
  FACTS = mod.FACTS ?? mod.default ?? null;
} catch {
  // module absent — facts tests below will be skipped
}

// Normalizes a revT series into [year, value] pairs. Supported shapes:
//   { 2019: 10, 2020: 12 }                      — year-keyed map
//   [[2019, 10], [2020, 12]]                    — array of pairs
//   [{ y: 2019, v: 10 }, ...] (or year/value)   — array of objects
//   [10, 12, ...] with sibling years array      — parallel arrays
function extractYearValues(revT, entry) {
  if (Array.isArray(revT)) {
    if (revT.every((x) => Array.isArray(x) && x.length >= 2)) {
      return revT.map(([y, v]) => [Number(y), v]);
    }
    if (revT.every((x) => x && typeof x === 'object')) {
      return revT.map((x) => [Number(x.y ?? x.year), x.v ?? x.value ?? x.rev]);
    }
    if (revT.every((x) => typeof x === 'number')) {
      const years = entry && (entry.years ?? entry.yT);
      if (Array.isArray(years) && years.length === revT.length) {
        return revT.map((v, i) => [Number(years[i]), v]);
      }
      // Plain number array without explicit years: values are checkable,
      // years are assumed contiguous ending at YEAR_MAX.
      return revT.map((v, i) => [YEAR_MAX - revT.length + 1 + i, v]);
    }
  } else if (revT && typeof revT === 'object') {
    return Object.entries(revT).map(([y, v]) => [Number(y), v]);
  }
  return null;
}

test('FACTS keys are COMPANIES ids with valid revT series (skipped if src/facts.js absent)', (t) => {
  if (!FACTS) {
    t.skip('src/facts.js not present');
    return;
  }
  const entries = Object.entries(FACTS);
  assert.ok(entries.length > 0, 'FACTS must not be empty');
  for (const [id, entry] of entries) {
    assert.ok(ids.has(id), `FACTS key is not a COMPANIES id: ${id}`);
    const revT = entry && typeof entry === 'object' && 'revT' in entry ? entry.revT : entry;
    const pairs = extractYearValues(revT, entry);
    assert.ok(pairs && pairs.length > 0, `${id}: unrecognized or empty revT series`);
    for (const [year, value] of pairs) {
      assert.ok(Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX,
        `${id}: year out of range ${YEAR_MIN}-${YEAR_MAX}: ${year}`);
      assert.ok(Number.isFinite(value) && value > 0,
        `${id}: revT value for ${year} must be a finite positive number, got ${value}`);
    }
  }
});

// --- year-axis integrity (src/years.js is the single source of truth) ------

test('year axis is not stale (calendar tripwire)', () => {
  // By July 1 of MAX_YEAR+2, a full fiscal year newer than MAX_YEAR has been
  // filed by every issuer (even May/June-FYE stragglers like ORCL). If this
  // fires: bump MAX_YEAR in src/years.js, re-run scripts/fetch-data.mjs,
  // rebuild, and review the regenerated data.
  assert.ok(Date.now() < Date.UTC(YEAR_MAX + 2, 6, 1),
    `year axis is stale: MAX_YEAR=${YEAR_MAX} but it is now past ${YEAR_MAX + 2}-07-01 — bump src/years.js and rerun the pipeline`);
});

test('src/index.html year copy matches src/years.js', () => {
  // The static scrubber attributes are a no-JS fallback and the About modal
  // states the covered range — both must track the real axis.
  const html = readFileSync(join(ROOT, 'src/index.html'), 'utf8');
  const last = String(PERIODS.length - 1);
  assert.ok(html.includes(`max="${last}" value="${last}"`),
    `scrubber max/value must be ${last} (PERIODS.length-1)`);
  assert.ok(html.includes(`(${YEAR_MIN}–${YEAR_MAX})`),
    `scrubber aria-label must state (${YEAR_MIN}–${YEAR_MAX})`);
  assert.ok(html.includes(`FY${YEAR_MIN}–${YEAR_MAX}`),
    `About copy must state FY${YEAR_MIN}–${YEAR_MAX}`);
  assert.ok(html.includes(`id="period">${PERIODS[PERIODS.length - 1]}<`),
    `#period fallback text must be ${PERIODS[PERIODS.length - 1]}`);
});

// --- generated-data quality guards (skipped if src/facts.js absent) ---------
// These enforce the accuracy architecture from ROADMAP.md: hand-typed values
// must not drift from generated truth, and generated values must stay sane.

let GEN = null;
try {
  GEN = await import('../../src/facts.js');
} catch { /* module absent — guards below skip */ }
const { FLOW_VINTAGE } = await import('../../src/data.js');

// Known, documented divergences between the curated rev anchor and the
// FY-vintage reported figure. Empty today; add `id: 'reason'` only with a
// source comment, never to silence a failure you have not investigated.
const DRIFT_ALLOWLIST = {};

test('curated rev anchors track reported flow-vintage revenue (<=40% drift)', (t) => {
  if (!GEN?.FACTS) { t.skip('src/facts.js not present'); return; }
  for (const c of COMPANIES) {
    const ref = GEN.FACTS[c.id]?.revT?.[FLOW_VINTAGE];
    if (ref == null || DRIFT_ALLOWLIST[c.id]) continue;
    const drift = Math.abs(c.rev - ref) / ref;
    assert.ok(drift <= 0.4,
      `${c.id}: curated rev ${c.rev} drifts ${(drift * 100).toFixed(0)}% from reported FY${FLOW_VINTAGE} ${ref} — resync data.js (see scripts/fetch-data.mjs) or allowlist with a reason`);
  }
});

test('MCAPS are sane: known ids, positive, within 0.2x-5x of curated', (t) => {
  if (!GEN?.MCAPS) { t.skip('MCAPS not generated'); return; }
  assert.match(GEN.MCAP_ASOF ?? '', /^\d{4}-\d{2}-\d{2}$/, 'MCAP_ASOF must be an ISO date');
  const byIdMap = new Map(COMPANIES.map((c) => [c.id, c]));
  for (const [id, m] of Object.entries(GEN.MCAPS)) {
    const c = byIdMap.get(id);
    assert.ok(c, `MCAPS key is not a COMPANIES id: ${id}`);
    assert.ok(Number.isFinite(m.v) && m.v > 0, `${id}: mcap must be finite positive, got ${m.v}`);
    if (c.mcap > 0) {
      const ratio = m.v / c.mcap;
      assert.ok(ratio >= 0.2 && ratio <= 5,
        `${id}: generated mcap ${m.v} is ${ratio.toFixed(2)}x the curated ${c.mcap} — check shares/ADR ratio in scripts/mcaps.mjs`);
    }
  }
});

test('YEAR_MULT covers post-vintage years with plausible multipliers', (t) => {
  if (!GEN?.YEAR_MULT) { t.skip('YEAR_MULT not generated'); return; }
  for (const [y, m] of Object.entries(GEN.YEAR_MULT)) {
    const year = Number(y);
    assert.ok(Number.isInteger(year) && year > Number(FLOW_VINTAGE) && year <= YEAR_MAX,
      `YEAR_MULT key out of range (${FLOW_VINTAGE}, ${YEAR_MAX}]: ${y}`);
    assert.ok(Number.isFinite(m) && m >= 0.5 && m <= 2,
      `YEAR_MULT[${y}] implausible: ${m} (expected 0.5-2 aggregate growth vs FY${FLOW_VINTAGE})`);
  }
});

test('FACTS are fresh: staggered-FYE mega-caps all report MAX_YEAR', (t) => {
  // The anti-recurrence guard: AAPL (Sep FYE), NVDA (Jan), JPM and XOM (Dec)
  // all file their MAX_YEAR 10-K well before the calendar tripwire fires, so
  // if this fails the pipeline has stopped ingesting new filings — exactly
  // the failure mode that silently froze the dataset at FY2024 for 18 months.
  // Deliberately excludes June-FYE names (MSFT) whose MAX_YEAR slot files late.
  if (!GEN?.FACTS) { t.skip('src/facts.js not present'); return; }
  for (const id of ['AAPL', 'NVDA', 'JPM', 'XOM']) {
    assert.ok(GEN.FACTS[id]?.revT?.[YEAR_MAX] != null,
      `${id} has no reported revenue for ${YEAR_MAX} — rerun scripts/fetch-data.mjs (and check its skip report)`);
  }
});
