/* Market-cap generation: live price × shares outstanding, one dated snapshot.
   Called from fetch-data.mjs; emitted into src/facts.js as MCAPS/MCAP_ASOF.

   Three paths, in precedence order per company id:
     1. CURATED_LISTINGS — foreign nodes with no usable SEC dei series: price
        from their home listing (or USD ADR), shares curated with a source note.
     2. SHARES_OVERRIDE — US filers whose dei shares are unusable (multi-class
        registrants: companyconcept drops dimensioned facts, so GOOGL 404s and
        BRK is frozen at a 2011 Class-A-only figure).
     3. SEC dei EntityCommonStockSharesOutstanding × the matched US ticker's
        price — only when the latest fact came from a 10-K/10-Q (20-F filers'
        dei counts are ordinary shares while their US quote is per-ADR at
        ratios like 1:5 — rejecting non-domestic forms sidesteps that trap)
        and is fresh (<= 400 days old).

   Every computed value must land within [0.2x, 5x] of the curated data.js
   mcap or it is dropped (catches share-unit and ADR-ratio mistakes); dropped
   or uncovered ids simply keep the curated fallback in the app. */

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';
// Frankfurter (ECB reference rates) has no SAR; the riyal has been pegged
// at 3.75/USD since 1986. Extend here if another pegged listing is added.
const FX_PEGS = { SAR: 3.75 };
const MAX_DEI_AGE_DAYS = 400; // one filing cycle + slack

/* US registrants where dei shares are absent or wrong (multi-class). Shares
   are total across classes, in the reference class of the quoted ticker.
   Vintage: 2025 10-Q cover pages; drift is slow (buybacks ~1-3%/yr) and the
   sanity band plus the monthly refresh keep it honest. */
export const SHARES_OVERRIDE = {
  GOOGL: { shares: 12.1e9, note: 'A+B+C total; companyconcept dei 404s (dimensioned)' },
  META: { shares: 2.51e9, note: 'A+B total; dei carries Class A only' },
  BRK: { shares: 2.15e9, note: 'Class-B-equivalent total (A x1500 + B), priced off BRK-B; dei frozen at 2011' },
};

/* Foreign nodes worth a real quote: symbol on the exchange whose price we
   fetch, shares outstanding in that listing's per-share class. */
export const CURATED_LISTINGS = {
  ARAM: { sym: '2222.SR', shares: 241.84e9, note: 'Tadawul; ordinary shares post-2024 secondary' },
  TSMC: { sym: 'TSM', shares: 5.186e9, note: 'NYSE ADR (1 ADR = 5 ordinary); 25.93B ordinary / 5' },
  SAMSUNG: { sym: '005930.KS', shares: 5.919e9, note: 'KRX common shares (preferred excluded)' },
  TCEHY: { sym: '0700.HK', shares: 9.15e9, note: 'HKEX ordinary, net of buyback cancellations' },
  TM: { sym: '7203.T', shares: 13.0e9, note: 'TSE ordinary, net of retirements' },
  SONY: { sym: '6758.T', shares: 6.16e9, note: 'TSE ordinary, post Oct-2024 5:1 split' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastYahoo = 0;
async function yahooPrice(sym) {
  // v8 chart meta carries regularMarketPrice + currency and needs no crumb.
  const url = `${YAHOO}${encodeURIComponent(sym)}?range=1d&interval=1d`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Elapsed-based pacing (>=300ms between request starts) so requests
      // already spaced by network latency don't pay an extra fixed sleep.
      const wait = lastYahoo + 300 - Date.now();
      if (wait > 0) await sleep(wait);
      lastYahoo = Date.now();
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) {
        throw new Error('no regularMarketPrice in chart meta');
      }
      return { price: meta.regularMarketPrice, currency: meta.currency };
    } catch (err) {
      if (attempt === 1) return { error: String(err) };
      await sleep(1500);
    }
  }
}

/* Latest fresh shares-outstanding fact filed on a domestic form. */
function freshDeiShares(conceptJson, nowMs) {
  const units = conceptJson?.units?.shares;
  if (!Array.isArray(units)) return null;
  let best = null;
  for (const e of units) {
    if (!e.form || !(e.form.startsWith('10-K') || e.form.startsWith('10-Q'))) continue;
    if (typeof e.val !== 'number' || e.val <= 0 || !e.end) continue;
    if (!best || e.end > best.end) best = e;
  }
  if (!best) return null;
  const age = (nowMs - Date.parse(best.end)) / 86400000;
  if (!(age >= 0 && age <= MAX_DEI_AGE_DAYS)) return null;
  // Multi-class registrants can carry one undimensioned fact PER CLASS with
  // the same cover-page date; picking one row would silently understate the
  // cap. Distinct values on the latest date -> ambiguous -> curated fallback
  // (add the name to SHARES_OVERRIDE with the cross-class total instead).
  const atEnd = new Set(units
    .filter((e) => e.end === best.end && (e.form.startsWith('10-K') || e.form.startsWith('10-Q')) && typeof e.val === 'number' && e.val > 0)
    .map((e) => e.val));
  if (atEnd.size > 1) return null;
  return best.val;
}

/**
 * @param companies  data.js company nodes with mcap !== 0 (curated fallbacks)
 * @param facts      generated FACTS (provides cik per covered id)
 * @param tickerOf   id -> SEC-matched US ticker (quote symbol for the dei path)
 * @param getJSON    rate-limited SEC fetcher from fetch-data.mjs
 */
export async function buildMcaps({ companies, facts, tickerOf, getJSON }) {
  const nowMs = Date.now();
  const MCAP_ASOF = new Date(nowMs).toISOString().slice(0, 10);
  const MCAPS = {};
  const dropped = [];

  // Sanity-band anchor: prefer last run's generated value (facts.js is read
  // before this run overwrites it). Anchoring month-over-month lets real caps
  // walk arbitrarily far from the hand-curated data.js snapshot over the
  // years without ever tripping the band, while still catching sudden
  // share-unit / ADR-ratio mistakes; the curated value is only the first-run
  // anchor.
  let prevMcaps = {};
  try {
    prevMcaps = (await import('../src/facts.js')).MCAPS || {};
  } catch { /* first run or malformed facts.js -> curated anchors */ }

  let fx = {};
  try {
    const res = await fetch(FX_URL);
    if (res.ok) fx = (await res.json())?.rates || {};
  } catch { /* FX down -> non-USD listings drop to curated fallback */ }
  const toUSD = (amount, ccy) => {
    if (ccy === 'USD') return amount;
    const rate = FX_PEGS[ccy] ?? fx[ccy];
    return rate ? amount / rate : null;
  };

  for (const c of companies) {
    let sym = null, shares = null, src = null;
    if (CURATED_LISTINGS[c.id]) {
      ({ sym, shares } = CURATED_LISTINGS[c.id]);
      src = 'curated-listing';
    } else if (SHARES_OVERRIDE[c.id]) {
      sym = tickerOf[c.id];
      shares = SHARES_OVERRIDE[c.id].shares;
      src = 'override*quote';
    } else if (facts[c.id]) {
      const cik10 = String(facts[c.id].cik).padStart(10, '0');
      const r = await getJSON(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik10}/dei/EntityCommonStockSharesOutstanding.json`);
      shares = r.json ? freshDeiShares(r.json, nowMs) : null;
      if (shares) { sym = tickerOf[c.id]; src = 'dei*quote'; }
    }
    if (!sym || !shares) continue; // no generated path -> curated fallback

    const q = await yahooPrice(sym);
    if (q.error) { dropped.push(`${c.id} (${sym}: ${q.error})`); continue; }
    const usd = toUSD(q.price * shares, q.currency);
    if (usd == null) { dropped.push(`${c.id} (${sym}: no FX for ${q.currency})`); continue; }
    const vB = Math.round(usd / 1e8) / 10; // $B, 1dp
    const anchor = prevMcaps[c.id]?.v ?? (c.mcap > 0 ? c.mcap : null);
    const ratio = anchor ? vB / anchor : 1;
    if (!(ratio >= 0.2 && ratio <= 5)) {
      dropped.push(`${c.id} (${sym}: ${vB} vs anchor ${anchor} — outside 0.2x-5x sanity band)`);
      continue;
    }
    MCAPS[c.id] = { v: vB, src };
  }

  return { MCAPS, MCAP_ASOF, dropped };
}
