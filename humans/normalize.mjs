/* humans/normalize — the one repair pass allowed to touch research files.

   Ten independent research passes cannot be relied on to hit a character cap
   exactly, and a 350-char sentence is a formatting problem, not a data problem —
   rejecting the record would throw away sourced research over punctuation. So
   this trims prose to the cap at the last sentence boundary that fits (falling
   back to a word boundary), and normalises whitespace.

   It deliberately does NOT touch anything that carries meaning: no net worth, no
   date, no age, no provenance tag. Those still fail the build if they are wrong,
   because those are data problems and a human should see them.

   Run: node humans/normalize.mjs   (build.mjs does not call this — it is explicit) */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const CAP = 340, PROSE = ['did', 'why', 'obst', 'turn'];

function trim(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= CAP) return t;
  const head = t.slice(0, CAP);
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '), head.lastIndexOf(', '));
  // only cut at a sentence boundary if it keeps a substantial record
  return stop > CAP * 0.6 ? head.slice(0, stop + 1).trim() : `${head.slice(0, head.lastIndexOf(' ')).trim()}.`;
}

let touched = 0;
for (const f of readdirSync(DATA).filter((x) => x.endsWith('.json'))) {
  const p = join(DATA, f);
  const rows = JSON.parse(readFileSync(p, 'utf8'));
  let n = 0;
  for (const r of rows) {
    for (const k of PROSE) {
      if (typeof r[k] !== 'string') continue;
      const t = trim(r[k]);
      if (t !== r[k]) { console.log(`  ${f} ${r.id}.${k}  ${r[k].length} -> ${t.length}`); r[k] = t; n++; }
    }
  }
  if (n) { writeFileSync(p, JSON.stringify(rows, null, 1)); touched += n; }
}
console.log(touched ? `normalised ${touched} field(s)` : 'nothing to normalise');
