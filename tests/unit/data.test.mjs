// Unit tests for the static dataset (src/data.js) and, when present, the
// generated facts module (src/facts.js). Runs under node's built-in test
// runner: `npm run test:unit` (node --test tests/unit/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANIES, FLOWS, STATE_SHARES } from '../../src/data.js';

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

const YEAR_MIN = 2019;
const YEAR_MAX = 2024;

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
