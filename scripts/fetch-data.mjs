#!/usr/bin/env node
/* Build-time pipeline: fetch REAL reported annual revenue from SEC XBRL
   (companyconcept API, 10-K / 20-F filings), generate market caps
   (price × shares outstanding — scripts/mcaps.mjs), compute the per-year
   flow multiplier, and write it all to src/facts.js.
   Year range comes from src/years.js — bump MAX_YEAR there, never here.
   Zero npm deps — Node 18+ global fetch only.
   Usage: node scripts/fetch-data.mjs */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COMPANIES, FLOW_VINTAGE } from '../src/data.js';
import { MIN_YEAR, MAX_YEAR } from '../src/years.js';
import { buildMcaps } from './mcaps.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// SEC's fair-access policy requires "Name contact-email" in the User-Agent.
// Requests without an email — or with a URL in the string — are 403-rejected.
const UA = 'ValueGrid research alvan.chow0@gmail.com';
const MIN_YEARS = 3;
// RevenuesNetOfInterestExpense is the top-line tag used by banks/brokers
// (GS, MS, WFC) that don't report a plain Revenues concept.
const GAAP_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'];

/* Manual alias map: data.js id -> ticker as it appears in company_tickers.json.
   Mostly foreign ADRs that file 20-F, plus ids that are not real US tickers. */
const ALIAS = {
  BRK: 'BRK-B',            // Berkshire Hathaway class B
  TSMC: 'TSM',             // Taiwan Semiconductor ADR (20-F)
  NOVN: 'NVS',             // Novartis ADR (20-F, reports USD)
  ULVR: 'UL',              // Unilever ADR (20-F)
  NOKIA: 'NOK',            // Nokia ADR (20-F)
  INGA: 'ING',             // ING Groep ADR (20-F)
  ENI: 'E',                // Eni SpA ADR (20-F)
  SEA: 'SE',               // Sea Limited ADR (20-F, USD)
  HDFCBANK: 'HDB',         // HDFC Bank ADR (20-F)
  ICICIBANK: 'IBN',        // ICICI Bank ADR (20-F)
  HONDA: 'HMC',            // Honda Motor ADR (20-F)
  SOFTBANK: 'SFTBY',       // SoftBank (OTC; not an SEC reporter — expected miss)
  PETROCN: 'PTR',          // PetroChina (delisted 2022 — expected miss)
  SINOPEC: 'SNP',          // Sinopec (delisted 2022 — expected miss)
};

/* Ids whose exact-ticker match is KNOWN-CORRECT even though the SEC company
   title shares no obvious token with our display name. */
const NAME_CHECK_OVERRIDE = new Set(['IBM', 'AMD', 'GE', 'TD', 'FMX', 'TSMC', 'BP']); // BP: 2-letter name is shorter than the token filter

/* Tickers whose company_tickers.json row points at a registrant that carries
   no XBRL facts. As of 2026, "XOM" resolves to ExxonMobil Holdings Corp
   (CIK 2115436, a holding-company shell with zero companyconcept data) while
   every filing fact still lives under the operating company. Pin the CIK
   that actually files; drop the pin if facts migrate to the new registrant. */
const CIK_OVERRIDE = { XOM: { cik: 34088, title: 'EXXON MOBIL CORP' } };

/* Companies whose generic tag order would pick a narrow sub-line instead of
   the headline top line. These are tried FIRST; the default list then only
   gap-fills years they leave uncovered.
   - BLK: its `Revenues` concept carries a sub-schedule (~$11-13B) while
     RevenueFromContractWithCustomer... is total revenue ($17.9B -> $24.2B).
   - AXP: headline is "total revenues net of interest expense" ($65.9B in
     FY2024), not the $38.8B contract-revenue subset. */
const TAG_OVERRIDE = {
  BLK: [['us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax']],
  AXP: [['us-gaap', 'RevenuesNetOfInterestExpense']],
};

/* Generic tokens that must not, on their own, validate a ticker collision
   (e.g. our "Int'l Holding Co" vs Independence Holding Co on ticker IHC). */
const STOP = new Set(['inc', 'corp', 'co', 'cos', 'ltd', 'plc', 'sa', 'ag', 'se', 'nv', 'spa',
  'group', 'groep', 'holding', 'holdings', 'company', 'companies', 'limited', 'bank',
  'national', 'intl', 'int', 'the', 'of', 'and', 'de', 'cv', 'sab', 'new', 'class']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;
async function rateLimited(url) {
  // ~7 req/s max: at least 150ms between request starts.
  const wait = lastReq + 150 - Date.now();
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
  return fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
}
async function getJSON(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await rateLimited(url);
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { json: await res.json() };
    } catch (err) {
      if (attempt === 1) return { error: String(err) };
      await sleep(1000); // retry once
    }
  }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
/* Guard against ticker collisions (our id "MTN" = MTN Group, SEC "MTN" = Vail
   Resorts): require a meaningful token shared between our name and SEC title. */
function namesAgree(ourName, secTitle) {
  const a = tokens(ourName), b = tokens(secTitle), an = norm(ourName), bn = norm(secTitle);
  return a.some((t) => bn.includes(t)) || b.some((t) => an.includes(t));
}

function tickerCandidates(id) {
  const out = [];
  if (ALIAS[id]) out.push(ALIAS[id]);
  out.push(id, `${id}-A`, `${id}-B`);
  return out;
}

/* Keep annual USD facts: 10-K/20-F, fp FY, true ~annual duration. */
function annualEntries(conceptJson) {
  const usd = conceptJson?.units?.USD;
  if (!Array.isArray(usd)) return new Map();
  const byYear = new Map(); // calendar year -> {val, filed, end, fy}
  for (const e of usd) {
    if (e.fp !== 'FY' || !e.form || !(e.form.startsWith('10-K') || e.form.startsWith('20-F'))) continue;
    // Reject non-positive values too: a $0 or restated-negative revenue fact
    // would otherwise flow into facts.js and break sizing/provenance display.
    if (!e.start || !e.end || typeof e.val !== 'number' || e.val <= 0) continue;
    const days = (Date.parse(e.end) - Date.parse(e.start)) / 86400000;
    // Positive-range check so NaN (unparseable dates) is rejected, not passed.
    if (!(days >= 330 && days <= 400)) continue; // annual periods only, not quarters
    const end = new Date(e.end + 'T00:00:00Z');
    // Assign each period to the calendar year containing the majority of it
    // (end month >= 7 -> end year, else end year - 1): NVDA's FY ending
    // Jan 2025 is overwhelmingly calendar-2024 activity and lands in 2024.
    // NOTE: e.fy is NOT usable here — it is the fiscal year of the FILING,
    // so the prior-year comparatives included in every 10-K would all
    // collapse onto the filing's year.
    const year = end.getUTCMonth() + 1 >= 7 ? end.getUTCFullYear() : end.getUTCFullYear() - 1;
    if (year < MIN_YEAR || year > MAX_YEAR) continue;
    const prev = byYear.get(year);
    if (!prev || (e.filed || '') >= prev.filed) byYear.set(year, { val: e.val, filed: e.filed || '' });
  }
  return byYear;
}

async function main() {
  console.log('Fetching SEC ticker -> CIK map ...');
  const tk = await getJSON('https://www.sec.gov/files/company_tickers.json');
  if (!tk.json) throw new Error(`company_tickers.json failed: ${tk.error || '404'}`);
  const byTicker = new Map(); // TICKER -> {cik, title}
  for (const row of Object.values(tk.json)) {
    byTicker.set(row.ticker.toUpperCase(), { cik: row.cik_str, title: row.title });
  }
  console.log(`  ${byTicker.size} tickers loaded.`);

  const candidates = COMPANIES.filter((c) => c.mcap !== 0);
  const macroSkipped = COMPANIES.length - candidates.length;

  const facts = {}; // id -> {cik, tag, asOf, url, revT}
  const tickerOf = {}; // id -> SEC-matched US ticker (quote symbol for mcaps)
  const skipped = { 'no CIK match (not an SEC reporter / delisted)': [], 'ticker collision rejected': [],
    'fetch failed': [], 'no annual USD revenue facts (likely non-USD or 40-F filer)': [],
    [`fewer than ${MIN_YEARS} years in ${MIN_YEAR}-${MAX_YEAR}`]: [] };
  let mapped = 0, fetchedOK = 0;

  for (const c of candidates) {
    // --- map id -> CIK ---
    let hit = null, collided = null;
    if (CIK_OVERRIDE[c.id]) { hit = CIK_OVERRIDE[c.id]; tickerOf[c.id] = ALIAS[c.id] || c.id; }
    else for (const t of tickerCandidates(c.id)) {
      const m = byTicker.get(t.toUpperCase());
      if (!m) continue;
      if (NAME_CHECK_OVERRIDE.has(c.id) || namesAgree(c.name, m.title)) { hit = m; tickerOf[c.id] = t.toUpperCase(); break; }
      collided = `${t} -> "${m.title}"`;
    }
    if (!hit) {
      if (collided) { skipped['ticker collision rejected'].push(`${c.id} (${collided})`); }
      else skipped['no CIK match (not an SEC reporter / delisted)'].push(c.id);
      continue;
    }
    mapped++;
    const cik10 = String(hit.cik).padStart(10, '0');

    // --- fetch revenue concepts, MERGING years across tags ---
    // Companies switch tags across filings (e.g. Revenues vs RevenueFromContract
    // ...), which leaves single-tag series with gap years. Earlier-priority tags
    // win on conflicts; later tags only fill years the earlier ones missed.
    const merged = new Map();
    let primary = null, anyData = false, hardError = null;
    // IFRS filers switch top-line concepts too: UBS's `Revenue` series died
    // after FY2021 when it moved to RevenueAndOperatingIncome; TotalEnergies
    // uses RevenueFromContractsWithCustomers. The merge below only gap-fills,
    // so adding tags never changes years an earlier-priority tag covered.
    const baseTags = [...GAAP_TAGS.map((t) => ['us-gaap', t]),
      ['ifrs-full', 'Revenue'],
      ['ifrs-full', 'RevenueFromContractsWithCustomers'],
      ['ifrs-full', 'RevenueAndOperatingIncome']];
    const pre = TAG_OVERRIDE[c.id] || [];
    const tryTags = [...pre, ...baseTags.filter(([ns, t]) => !pre.some(([n2, t2]) => n2 === ns && t2 === t))];
    for (const [ns, tag] of tryTags) {
      const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10}/${ns}/${tag}.json`;
      const r = await getJSON(url);
      if (r.error) { hardError = r.error; continue; }
      if (r.notFound) continue;
      anyData = true;
      const byYear = annualEntries(r.json);
      if (byYear.size === 0) continue;
      // An override tag with data is pinned as primary: its values win the
      // merge, so the emitted tag/url ("Verify at SEC") must describe it even
      // if a lower-priority tag happens to cover more years.
      if (!primary || (byYear.size > primary.count && !primary.pinned)) {
        primary = { tag, url, count: byYear.size, pinned: pre.some(([, t2]) => t2 === tag) };
      }
      for (const [y, v] of byYear) if (!merged.has(y)) merged.set(y, v);
      if (merged.size >= MAX_YEAR - MIN_YEAR + 1) break; // full coverage — stop
    }

    if (!anyData) {
      if (hardError) skipped['fetch failed'].push(`${c.id} (${hardError})`);
      else skipped['no annual USD revenue facts (likely non-USD or 40-F filer)'].push(c.id);
      continue;
    }
    fetchedOK++;
    if (merged.size === 0) {
      skipped['no annual USD revenue facts (likely non-USD or 40-F filer)'].push(c.id);
      continue;
    }
    if (merged.size < MIN_YEARS) {
      skipped[`fewer than ${MIN_YEARS} years in ${MIN_YEAR}-${MAX_YEAR}`].push(`${c.id} (${merged.size}y)`);
      continue;
    }

    const revT = {};
    const years = [...merged.keys()].sort((a, b) => a - b);
    for (const y of years) revT[y] = Math.round(merged.get(y).val / 1e8) / 10; // raw USD -> $B, 1dp
    facts[c.id] = { cik: hit.cik, tag: primary.tag, asOf: `FY${years[years.length - 1]}`, url: primary.url, revT };
    process.stdout.write(`  ${c.id.padEnd(12)} ${primary.tag.padEnd(52)} ${years.map((y) => `${y}:${revT[y]}`).join(' ')}\n`);
  }

  // --- year multiplier: aggregate reported growth vs the flow-vintage year ---
  // Drives the app's TMUL for years after FLOW_VINTAGE (flow values are stored
  // at vintage and scaled). Computed over ids reporting BOTH years so the
  // ratio is growth, not coverage drift.
  const YEAR_MULT = {};
  const vintageIds = Object.values(facts).filter((f) => f.revT[FLOW_VINTAGE] != null).length;
  for (let y = Number(FLOW_VINTAGE) + 1; y <= MAX_YEAR; y++) {
    let cur = 0, vint = 0, n = 0;
    for (const f of Object.values(facts)) {
      if (f.revT[y] != null && f.revT[FLOW_VINTAGE] != null) { cur += f.revT[y]; vint += f.revT[FLOW_VINTAGE]; n++; }
    }
    // Coverage floor: right after an annual MAX_YEAR bump only a handful of
    // off-cycle early filers cover the new year, and a sum ratio over that
    // cohort is a few mega-caps' growth, not a global multiplier. Below half
    // coverage, omit the year — the app falls back to 1 (honest "no data yet")
    // and the multiplier appears once enough issuers have filed.
    if (vint > 0 && n >= vintageIds / 2) YEAR_MULT[y] = Math.round((cur / vint) * 1000) / 1000;
    else if (vint > 0) console.log(`  YEAR_MULT[${y}] skipped: only ${n}/${vintageIds} issuers cover both ${y} and ${FLOW_VINTAGE}`);
  }

  // --- market caps: price × shares outstanding, one dated snapshot ---
  console.log('\nGenerating market caps (price × shares outstanding) ...');
  const { MCAPS, MCAP_ASOF, dropped } = await buildMcaps({ companies: candidates, facts, tickerOf, getJSON });

  // --- emit src/facts.js ---
  const ident = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : `'${k}'`);
  const lines = Object.entries(facts).map(([id, f]) => {
    const rt = Object.entries(f.revT).map(([y, v]) => `${y}:${v}`).join(',');
    return ` ${ident(id)}:{cik:${f.cik},tag:'${f.tag}',asOf:'${f.asOf}',url:'${f.url}',revT:{${rt}}},`;
  });
  const mcapLines = Object.entries(MCAPS).map(([id, m]) => ` ${ident(id)}:{v:${m.v},src:'${m.src}'},`);
  const multLines = Object.entries(YEAR_MULT).map(([y, m]) => `${y}:${m}`).join(',');
  const out = `// GENERATED by scripts/fetch-data.mjs — do not edit by hand.\n` +
    `// FACTS: real annual revenue ($B) from SEC XBRL companyconcept (10-K / 20-F filings).\n` +
    `// MCAPS: market cap ($B) = price × shares outstanding as of MCAP_ASOF (see scripts/mcaps.mjs).\n` +
    `// YEAR_MULT: aggregate reported revenue growth vs FY${FLOW_VINTAGE} (scales flow display).\n` +
    `export const FACTS={\n${lines.join('\n')}\n};\n` +
    `export const MCAP_ASOF='${MCAP_ASOF}';\n` +
    `export const MCAPS={\n${mcapLines.join('\n')}\n};\n` +
    `export const YEAR_MULT={${multLines}};\n`;
  writeFileSync(join(ROOT, 'src/facts.js'), out);

  // --- coverage summary ---
  console.log('\n=== COVERAGE SUMMARY ===');
  console.log(`Total entities in data.js:        ${COMPANIES.length}`);
  console.log(`Macro nodes skipped (mcap===0):   ${macroSkipped}`);
  console.log(`Companies considered:             ${candidates.length}`);
  console.log(`Mapped to a CIK:                  ${mapped}`);
  console.log(`Fetched OK (some XBRL data):      ${fetchedOK}`);
  console.log(`Included in FACTS (>=${MIN_YEARS} years):    ${Object.keys(facts).length}`);
  console.log('Skipped:');
  for (const [reason, ids] of Object.entries(skipped)) {
    if (ids.length) console.log(`  ${reason} (${ids.length}): ${ids.join(', ')}`);
  }
  console.log(`Market caps generated:            ${Object.keys(MCAPS).length} (as of ${MCAP_ASOF})`);
  if (dropped.length) console.log(`  mcap dropped (kept curated fallback): ${dropped.join('; ')}`);
  console.log(`Year multipliers vs FY${FLOW_VINTAGE}:       ${JSON.stringify(YEAR_MULT)}`);
  console.log(`\nWrote src/facts.js with ${Object.keys(facts).length} companies.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
