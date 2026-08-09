import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MICRO, MCATS, MCAT, MBARS, MBARWHY, MICRO_ASOF, MW,
  mMult, mPayback, microScore, microProv, microConf, microFields,
} from '../../src/micro.js';

const CAT_KEYS = new Set(Object.keys(MCATS));
const BAR_KEYS = new Set(Object.keys(MBARS));

test('every entry satisfies the schema the board renders against', () => {
  const ids = new Set();
  for (const e of MICRO) {
    assert.match(e.id, /^[A-Z0-9]+$/, `bad id "${e.id}"`);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(CAT_KEYS.has(e.cat), `${e.id} has unknown category "${e.cat}"`);
    for (const k of ['n', 'pn', 'u', 'th']) {
      assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${e.id}.${k} missing`);
    }
    for (const k of ['need', 'who', 'bar', 'kill', 'sub']) {
      assert.ok(Array.isArray(e[k]) && e[k].length > 0, `${e.id}.${k} must be a non-empty list`);
    }
    for (const b of e.bar) assert.ok(BAR_KEYS.has(b), `${e.id} has unknown barrier "${b}"`);
    assert.ok(e.ser.length >= 2, `${e.id} needs a series the row chart can draw`);
    for (const pt of e.ser) {
      assert.match(pt.t, /^\d{4}$/, `${e.id} series label "${pt.t}"`);
      assert.ok(pt.v > 0, `${e.id} series value must be positive`);
    }
  }
});

test('every figure the score reads carries provenance and a method', () => {
  for (const e of MICRO) {
    for (const f of microFields(e)) {
      assert.ok(['R', 'E', 'I'].includes(f.p), `${e.id} has provenance "${f.p}"`);
      assert.ok(f.c > 0 && f.c <= 1, `${e.id} confidence out of range`);
      assert.ok(typeof f.m === 'string' && f.m.length > 20, `${e.id} needs a real method note`);
      assert.ok(typeof f.s === 'string' && f.s.length > 0, `${e.id} needs a source`);
    }
  }
});

test('nothing on this board claims to be a published price', () => {
  // Small-lot work is quoted bilaterally. If an entry ever tags R, either a real
  // published source appeared — in which case update this test deliberately — or
  // someone over-claimed.
  for (const e of MICRO) {
    assert.notStrictEqual(e.px.p, 'R', `${e.id} claims a published price; small-niche prices are not published`);
  }
});

test('the numbers are internally coherent', () => {
  for (const e of MICRO) {
    assert.ok(mMult(e) > 1, `${e.id} is not actually overpriced`);
    // A niche whose whole annual spend is smaller than one team's billing is a
    // contradiction, and would make the ranking nonsense.
    assert.ok(e.mkt.v * 1000 > e.take.v, `${e.id}: one team cannot bill more than the entire niche`);
    assert.ok(e.ramp.mo > 0 && e.ramp.mo <= 36, `${e.id} ramp out of plausible range`);
    assert.ok(e.entry.v > 0 && e.take.v > 0, `${e.id} entry and take must be positive`);
    // "Within reach" has to mean something. Above this the entry is a business
    // loan, not something a small team funds itself.
    assert.ok(e.entry.v <= 300, `${e.id} costs $${e.entry.v}K to start — past what this board promises`);
  }
});

test('payback is months of billing, not a ratio', () => {
  for (const e of MICRO) {
    const expected = (e.entry.v / e.take.v) * 12;
    assert.ok(Math.abs(mPayback(e) - expected) < 1e-9, `${e.id} payback drifted`);
  }
});

test('the opportunity score is monotone in each of its five inputs', () => {
  const base = MICRO.find((e) => e.id === 'CALIB');
  const at = (o) => microScore({ ...base, ...o });
  const s0 = microScore(base);

  assert.ok(at({ px: { ...base.px, v: base.px.v * 2 } }) > s0, 'more overpriced must score higher');
  assert.ok(at({ entry: { ...base.entry, v: base.entry.v / 2 } }) > s0, 'cheaper to start must score higher');
  assert.ok(at({ ramp: { ...base.ramp, mo: base.ramp.mo / 2 } }) > s0, 'faster to start must score higher');
  assert.ok(at({ take: { ...base.take, v: base.take.v * 2 } }) > s0, 'bigger take must score higher');
  assert.ok(at({ bar: [...base.bar, 'scale'] }) >= s0, 'more barriers must not score lower');
});

test('the score is derived, never stored on an entry', () => {
  for (const e of MICRO) {
    for (const k of ['score', 'rank', 'opportunity']) {
      assert.ok(!(k in e), `${e.id} stores "${k}" — the ranking must stay derived`);
    }
  }
  assert.ok(Math.abs(Object.values(MW).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'weights must sum to 1');
});

test('score and provenance stay in their declared ranges', () => {
  for (const e of MICRO) {
    const s = microScore(e);
    assert.ok(s >= 0 && s <= 100, `${e.id} scored ${s}`);
    assert.ok(['R', 'E', 'I'].includes(microProv(e)));
    const c = microConf(e);
    assert.ok(c > 0 && c <= 1, `${e.id} confidence ${c}`);
  }
});

test('every category and barrier is used, and every barrier is explained', () => {
  const cats = new Set(MICRO.map((e) => e.cat));
  for (const k of CAT_KEYS) assert.ok(cats.has(k), `category "${k}" has no entries`);
  const bars = new Set(MICRO.flatMap((e) => e.bar));
  for (const k of BAR_KEYS) {
    assert.ok(bars.has(k), `barrier "${k}" is never used`);
    assert.ok(typeof MBARWHY[k] === 'string' && MBARWHY[k].length > 0, `MBARWHY missing "${k}"`);
  }
  for (const k of Object.keys(MCAT)) assert.ok(CAT_KEYS.has(k), `MCAT has colour for unknown category "${k}"`);
  for (const k of CAT_KEYS) assert.match(MCAT[k], /^#[0-9a-f]{6}$/i, `category "${k}" needs a colour`);
});

test('plain names lead the board and never repeat the technical name verbatim', () => {
  const seen = new Set();
  for (const e of MICRO) {
    assert.notStrictEqual(e.pn, e.n, `${e.id}'s plain name is just its technical name`);
    assert.ok(e.pn.length <= 46, `${e.id}'s plain name is too long for a headline`);
    assert.ok(!seen.has(e.pn), `two entries share the plain name "${e.pn}"`);
    seen.add(e.pn);
  }
});

test('MICRO_ASOF is well-formed and not stale', () => {
  assert.match(MICRO_ASOF, /^\d{4}-(0[1-9]|1[0-2])$/);
  const [y, m] = MICRO_ASOF.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  assert.ok(months >= 0, `${MICRO_ASOF} is in the future`);
  assert.ok(months <= 6, `${MICRO_ASOF} is ${months} months old — refresh the board`);
});
