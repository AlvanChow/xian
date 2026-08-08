// Unit tests for the scarcity board dataset (src/rents.js) and its derived
// measures. Schema/integrity guards in the same spirit as data.test.mjs: the
// board's credibility rests entirely on these fields being well-formed, and on
// the rank score being computed rather than typed.
// Runs under node's built-in test runner: `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENTS, ARCHIVE, CATS, BARS, RENT_ASOF,
  rMult, rentScore, rentProv, rentConf, rentFields, RW,
} from '../../src/rents.js';
import { COMPANIES } from '../../src/data.js';

const PROVS = new Set(['R', 'E', 'I']);
const CAT_KEYS = new Set(Object.keys(CATS));
const BAR_KEYS = new Set(Object.keys(BARS));
const COMPANY_IDS = new Set(COMPANIES.map((c) => c.id));
const ARCHIVE_IDS = new Set(ARCHIVE.map((a) => a.id));

// Every {v,p,c,m,s}-shaped figure on an entry, with a label for assertion messages.
const figures = (e) => [
  ['px', e.px], ['base', e.base], ['pool', e.pool], ['gm', e.gm], ['conc', e.conc], ['ttr', e.ttr],
];

test('RENTS have unique, non-empty, uppercase ids', () => {
  const seen = new Set();
  for (const e of RENTS) {
    assert.equal(typeof e.id, 'string', `id must be a string: ${JSON.stringify(e.id)}`);
    assert.ok(e.id.length > 0, 'id must be non-empty');
    assert.equal(e.id, e.id.toUpperCase(), `id must be uppercase (it is the deep-link value): ${e.id}`);
    assert.ok(!seen.has(e.id), `duplicate rent id: ${e.id}`);
    seen.add(e.id);
  }
  assert.ok(RENTS.length > 0, 'RENTS must not be empty');
});

test('RENTS have a name, unit, thesis and a known category', () => {
  for (const e of RENTS) {
    assert.ok(typeof e.n === 'string' && e.n.length > 0, `${e.id}: n missing`);
    assert.ok(typeof e.u === 'string' && e.u.length > 0, `${e.id}: u (unit) missing`);
    assert.ok(typeof e.th === 'string' && e.th.length > 0, `${e.id}: th (thesis) missing`);
    assert.ok(CAT_KEYS.has(e.cat), `${e.id}: cat must be a known category, got ${e.cat}`);
    // The thesis is the one line that has to fit a rail. Keep it honest.
    assert.ok(e.th.length <= 200, `${e.id}: thesis is ${e.th.length} chars, budget is 200`);
  }
});

test('every figure carries valid provenance, confidence and a source', () => {
  for (const e of RENTS) {
    for (const [k, f] of figures(e)) {
      assert.ok(f && typeof f === 'object', `${e.id}.${k}: missing`);
      assert.ok(PROVS.has(f.p), `${e.id}.${k}: p must be one of R/E/I, got ${f.p}`);
      assert.ok(Number.isFinite(f.c) && f.c > 0 && f.c <= 1, `${e.id}.${k}: c must be in (0,1], got ${f.c}`);
      assert.ok(typeof f.s === 'string' && f.s.length > 0, `${e.id}.${k}: s (source) missing`);
    }
  }
});

test('prices are positive and the rent multiple exceeds 1', () => {
  for (const e of RENTS) {
    assert.ok(Number.isFinite(e.px.v) && e.px.v > 0, `${e.id}: px.v must be > 0, got ${e.px.v}`);
    assert.ok(Number.isFinite(e.base.v) && e.base.v > 0, `${e.id}: base.v must be > 0, got ${e.base.v}`);
    // A "scarcity rent" priced at or below its own baseline is not a signal —
    // it is a data error, and it would rank as one.
    assert.ok(rMult(e) > 1, `${e.id}: rent multiple must exceed 1, got ${rMult(e).toFixed(2)}`);
    assert.ok(typeof e.px.asOf === 'string' && e.px.asOf.length > 0, `${e.id}: px.asOf missing`);
    assert.ok(typeof e.base.per === 'string' && e.base.per.length > 0, `${e.id}: base.per missing`);
  }
});

test('rent pool and incumbent margin are in range', () => {
  for (const e of RENTS) {
    assert.ok(Number.isFinite(e.pool.v) && e.pool.v > 0, `${e.id}: pool.v ($B/yr) must be > 0, got ${e.pool.v}`);
    assert.ok(e.pool.v < 1000, `${e.id}: pool.v of ${e.pool.v}B/yr is implausible — check the units`);
    assert.ok(Number.isFinite(e.gm.v) && e.gm.v > 0 && e.gm.v < 1, `${e.id}: gm.v must be a fraction in (0,1), got ${e.gm.v}`);
    assert.ok(typeof e.gm.who === 'string' && e.gm.who.length > 0, `${e.id}: gm.who missing`);
  }
});

test('price series is ordered, non-empty and within the sparkline budget', () => {
  for (const e of RENTS) {
    assert.ok(Array.isArray(e.ser) && e.ser.length > 0, `${e.id}: ser must be a non-empty array`);
    assert.ok(e.ser.length <= 12, `${e.id}: ser has ${e.ser.length} points, budget is 12`);
    let prev = null;
    for (const d of e.ser) {
      assert.ok(Number.isFinite(d.v) && d.v > 0, `${e.id}: ser value must be > 0, got ${d.v}`);
      assert.ok(typeof d.t === 'string' && d.t.length > 0, `${e.id}: ser point missing t`);
      if (prev !== null) assert.ok(d.t > prev, `${e.id}: ser must be chronological, ${d.t} follows ${prev}`);
      prev = d.t;
    }
  }
});

test('concentration is coherent and named suppliers resolve where they claim to', () => {
  for (const e of RENTS) {
    const { top3, hhi, sup } = e.conc;
    assert.ok(Number.isFinite(top3) && top3 > 0 && top3 <= 1, `${e.id}: conc.top3 must be in (0,1], got ${top3}`);
    assert.ok(Number.isFinite(hhi) && hhi > 0 && hhi <= 10000, `${e.id}: conc.hhi must be in (0,10000], got ${hhi}`);
    assert.ok(Array.isArray(sup) && sup.length > 0, `${e.id}: conc.sup must be a non-empty array`);
    let total = 0;
    for (const s of sup) {
      assert.ok(Number.isFinite(s.sh) && s.sh > 0 && s.sh <= 1, `${e.id}: supplier share must be in (0,1], got ${s.sh}`);
      total += s.sh;
      assert.ok(s.id || s.n, `${e.id}: every supplier needs an id (linking to COMPANIES) or a plain name`);
      // This is the guard that keeps the board's click-through to the map from
      // silently dead-ending: an id claims a map node, so it must exist.
      if (s.id) assert.ok(COMPANY_IDS.has(s.id), `${e.id}: supplier id ${s.id} does not resolve in COMPANIES`);
    }
    assert.ok(total <= 1.0001, `${e.id}: supplier shares sum to ${total.toFixed(3)}, must not exceed 1`);
  }
});

test('barriers are known, ordered and non-empty', () => {
  for (const e of RENTS) {
    assert.ok(Array.isArray(e.bar) && e.bar.length > 0, `${e.id}: bar must be a non-empty array`);
    assert.equal(new Set(e.bar).size, e.bar.length, `${e.id}: duplicate barrier in ${e.bar.join(',')}`);
    for (const b of e.bar) assert.ok(BAR_KEYS.has(b), `${e.id}: unknown barrier ${b}`);
  }
});

test('time to relief is a plausible positive month count', () => {
  for (const e of RENTS) {
    assert.ok(Number.isInteger(e.ttr.mo) && e.ttr.mo > 0, `${e.id}: ttr.mo must be a positive integer, got ${e.ttr.mo}`);
    assert.ok(e.ttr.mo <= 240, `${e.id}: ttr.mo of ${e.ttr.mo} exceeds the 20-year sanity bound`);
    assert.ok(typeof e.build === 'string' && e.build.length > 0, `${e.id}: build (what is under construction) missing`);
  }
});

test('every signal says what would solve it and what would kill it', () => {
  for (const e of RENTS) {
    for (const k of ['solve', 'kill', 'sub']) {
      assert.ok(Array.isArray(e[k]) && e[k].length > 0, `${e.id}: ${k} must be a non-empty array`);
      for (const s of e[k]) {
        assert.ok(typeof s === 'string' && s.length > 0, `${e.id}: empty ${k} entry`);
        assert.ok(s.length <= 200, `${e.id}: ${k} entry is ${s.length} chars, budget is 200`);
      }
    }
  }
});

test('historical analogues resolve to an ARCHIVE entry', () => {
  for (const e of RENTS) {
    if (e.an == null) continue;
    assert.ok(ARCHIVE_IDS.has(e.an), `${e.id}: an "${e.an}" does not resolve in ARCHIVE`);
  }
});

test('ARCHIVE entries are well-formed and actually reverted', () => {
  const seen = new Set();
  for (const a of ARCHIVE) {
    assert.ok(a.id && !seen.has(a.id), `duplicate or missing archive id: ${a.id}`);
    seen.add(a.id);
    assert.ok(CAT_KEYS.has(a.cat), `${a.id}: cat must be a known category, got ${a.cat}`);
    assert.ok(PROVS.has(a.p), `${a.id}: p must be one of R/E/I, got ${a.p}`);
    assert.ok(Number.isFinite(a.c) && a.c > 0 && a.c <= 1, `${a.id}: c must be in (0,1], got ${a.c}`);
    for (const k of ['n', 'u', 'why', 'lesson', 's']) {
      assert.ok(typeof a[k] === 'string' && a[k].length > 0, `${a.id}: ${k} missing`);
    }
    // The archive exists to show rents decaying. An entry whose trough is not
    // below its peak is filed in the wrong list.
    assert.ok(Number.isFinite(a.peak.v) && Number.isFinite(a.trough.v), `${a.id}: peak/trough values must be numeric`);
    assert.ok(a.trough.v < a.peak.v, `${a.id}: trough (${a.trough.v}) must be below peak (${a.peak.v})`);
    assert.ok(a.peak.t && a.trough.t && a.trough.t > a.peak.t, `${a.id}: trough must be dated after the peak`);
  }
  assert.ok(ARCHIVE.length > 0, 'ARCHIVE must not be empty — the board needs its counter-examples');
});

test('rank weights sum to 1', () => {
  const total = Object.values(RW).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `rank weights sum to ${total}, must be 1`);
});

test('rentScore is bounded, finite, and computed from the entry fields', () => {
  for (const e of RENTS) {
    const s = rentScore(e);
    assert.ok(Number.isFinite(s) && s >= 0 && s <= 100, `${e.id}: score out of bounds, got ${s}`);
    // Nothing in the data may pre-empt the computation.
    assert.equal(e.score, undefined, `${e.id}: score must never be stored on an entry`);
    assert.equal(e.mult, undefined, `${e.id}: mult must never be stored — it is derived from px/base`);
  }
});

test('rentScore is monotone in each of its five inputs', () => {
  // Shallow-clone only the branch being perturbed — the fixture must not be
  // mutated, and the score only reads these leaf fields.
  const bump = (e, path, factor) => {
    const [a, b] = path.split('.');
    return { ...e, [a]: { ...e[a], [b]: e[a][b] * factor } };
  };
  // A mid-board entry: every component is off its cap, so each bump can move.
  const base = RENTS.find((e) => e.id === 'XFMR');
  assert.ok(base, 'expected XFMR in RENTS as the monotonicity fixture');
  const s0 = rentScore(base);
  for (const path of ['px.v', 'pool.v', 'ttr.mo', 'conc.top3', 'gm.v']) {
    const up = rentScore(bump(base, path, 1.1));
    const down = rentScore(bump(base, path, 0.9));
    assert.ok(up > s0, `score must rise when ${path} rises (${s0.toFixed(3)} -> ${up.toFixed(3)})`);
    assert.ok(down < s0, `score must fall when ${path} falls (${s0.toFixed(3)} -> ${down.toFixed(3)})`);
  }
  // Raising the baseline shrinks the multiple, so the score must fall.
  assert.ok(rentScore(bump(base, 'base.v', 1.1)) < s0, 'score must fall when the baseline rises');
});

test('rentProv reports the weakest tier, never an average', () => {
  for (const e of RENTS) {
    const tiers = rentFields(e).map((f) => f.p);
    const expected = tiers.includes('I') ? 'I' : tiers.includes('E') ? 'E' : 'R';
    assert.equal(rentProv(e), expected, `${e.id}: headline provenance must be the weakest of ${tiers.join('')}`);
    const conf = rentConf(e);
    assert.ok(conf > 0 && conf <= 1, `${e.id}: mean confidence out of range, got ${conf}`);
  }
});

test('the board is honest about being mostly modeled', () => {
  // Not a style preference: if this board ever reports itself as majority
  // Reported, someone has mislabeled bilateral prices that nobody publishes.
  const reported = RENTS.filter((e) => rentProv(e) === 'R').length;
  assert.ok(reported <= RENTS.length * 0.5,
    `${reported}/${RENTS.length} signals claim fully-Reported provenance — implausible for contract prices that are not publicly quoted`);
});

test('RENT_ASOF is a well-formed, non-stale snapshot date', () => {
  assert.match(RENT_ASOF, /^\d{4}-(0[1-9]|1[0-2])$/, `RENT_ASOF must be YYYY-MM, got ${RENT_ASOF}`);
  const [y, m] = RENT_ASOF.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  assert.ok(months >= 0, `RENT_ASOF ${RENT_ASOF} is in the future`);
  // Staleness tripwire, mirroring the FACTS freshness guard in data.test.mjs.
  // A board of prices nobody has revisited in half a year is not a price signal.
  assert.ok(months <= 6, `RENT_ASOF ${RENT_ASOF} is ${months} months old — refresh the board's figures`);
});

test('every barrier has an explanation the dossier can render', async () => {
  const { BARWHY } = await import('../../src/rents.js');
  for (const k of Object.keys(BARS)) {
    assert.ok(typeof BARWHY[k] === 'string' && BARWHY[k].length > 0, `BARWHY missing an entry for barrier "${k}"`);
  }
  for (const k of Object.keys(BARWHY)) {
    assert.ok(BAR_KEYS.has(k), `BARWHY has an entry for unknown barrier "${k}"`);
  }
});
