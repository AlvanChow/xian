# ValueGrid Roadmap

Synthesis of an 18-track investigation (data, flows, real-data integration, time series,
cartography, graph features, analytics, navigation, mobile/PWA, accessibility, architecture,
testing/CI, content, SEO, export, competitive landscape, provenance, theming) into a single
prioritized plan. Each item carries effort: **S** (hours), **M** (days), **L** (week+).

## Positioning (from competitive research)

No surveyed comparator (OEC, resourcetrade.earth, FlowmapBlue, Kepler.gl, IMF/IIF trackers,
Bloomberg SPLC, LittleSis, Observable) grades *each figure* by confidence tier with a visible
provenance mix. That is the moat. Position as **"the audited graph of money" — the only flow
map that shows its homework on every number**, not as another trade-flow map. Target wedge:
educators and fin-twitter explainers first (stories + embeds + shareable URLs), data
journalists second (clickable sources + export). Everything below serves that.

---

## Accuracy architecture (from the 20-agent data interrogation, 2026-06)

A full-dataset audit (every entity HQ web-verified, mcaps, non-SEC revenues, macro
fiscal flows, curated corporate flows, point-in-polygon geometry) found ~45 errors —
stale HQ moves (Chevron, Exxon, Gazprom, PDD→Dublin), a Jan-2025 mcap vintage that had
drifted >35% on 13 names, FX errors on non-USD revenues, and macro flows that were
2–3× off (including a Fed remittance shown as current despite being suspended since
Sept 2022). All corrected. The structural lesson: **every hand-typed field is a
liability** — the fix is generation plus drift detection:

1. **Generate HQ + name from SEC EDGAR** — `data.sec.gov/submissions/CIK{n}.json`
   carries the registrant business address; the CIK mapping in fetch-data.mjs already
   exists. Geocode city-level via a cached offline gazetteer. (M)
2. **Generate mcap** — XBRL `dei:EntityCommonStockSharesOutstanding` × a quote source;
   tag with asOf date. Until then the UI labels mcap "point-in-time". (M)
3. **Drift tests in CI** — data.js rev vs FACTS divergence >40% fails; curated lat/lng
   >200 km from the EDGAR address fails (this alone catches the Chevron class). (S)
4. **Per-field `asOf` metadata** on curated values, with a staleness linter (TTL per
   field class: addresses/mcap monthly, flows 18 months). (M)
5. **Replace coarse coastlines with Natural Earth 110m polygons** — fixes the 16
   correct-but-"ocean" pins (Mumbai, Singapore, Basel, Taiwan, Dublin, Aventura). (M)

## Phase 0 — Quick fixes (bugs and integrity holes found during investigation)

| Fix | Where | Effort |
|---|---|---|
| Inspector ignores `secOn`: totals disagree with the arcs drawn when a sector is off | `selectNode` vs `visF()` filter mismatch | S |
| Antimeridian: Pacific flows (US↔Asia) draw the long way around through the Atlantic; pan never wraps | arc loop: shift endpoint ±360° when `|Δlon|>180` | S |
| WCAG AA failures: white on `--accent #5b8cff` = 3.2:1 (`.ddbtn`, `.seg button.on`) | darken accent for filled buttons | S |
| Drill modal: center node rim not grabbable (hit radius 24 < node radius 28) | use per-node radius in hit test | S |
| `tIdx=(tIdx+1)%6` hardcodes period count; blocks range extension | `%PERIODS.length` | S |
| Market-cap tag hardcoded `E` in inspector regardless of data | `selectNode` stats block | S |
| Touch hit-slop too small for fingers (`r+5*DPR`) | `Math.max(r, 15*DPR)` for touch pointers | S |
| Map height jumps with mobile URL bar (`60vh` → `60svh` + fallback) | styles.css 860px branch | S |
| Copy-paste node IDs (`TSM2DBS`, `CMCSA2`, `8306MUFG`, `6758KEYENCE`) | data.js cleanup | S |
| Stale "land top-light overlay" comment; `u:''` dead fields | app.js dead code | S |

## Phase 1 — P0: Credibility & foundations

**1. Provenance verifiability** (the moat-or-bust track)
- Add `u` (source URL) per edge → "Verify source ↗" link in the methodology block; model-derived
  flows link a methodology page (M — schema/UI is S; sourcing real EDGAR/Comtrade/USAspending URLs is the work).
- Add `asOf` vintage per edge; display it, and stop silently scaling a "2024 annual report" figure
  to 2019 — degrade or caveat when the scrubber leaves the vintage (S schema, M timeline honesty).
- Publish a confidence rubric (what 0.9 vs 0.45 *means*); today 449/478 flows carry five
  template values assigned by category (S).
- Only **2 of 478 flows are provenance R** — the marketing says "filing-anchored"; fix the mix
  (see data track: defense procurement edges alone would triple R count).

**2. Shareable URL state** (flagged independently by 5 tracks — the biggest single multiplier)
- Hash scheme `#node=NVDA&t=2022&sec=tech,fin&layers=RE&view=10,25,1.0&size=rev`;
  `hashchange` restore; back/forward steps through selections; boot demo-select only when hash
  empty; route all selection clears through one `clearSelection()` (M).

**3. About/Methodology in-app** (integrity gap: the R/E/I model and "illustrative, not audited"
caveat exist only in the README, which Pages never serves)
- About modal reusing the existing `#modal` pattern: provenance table, rubric, sources, vintage,
  caveat; "About the data" link in the top bar + ⓘ chip near the legend; `#about` hash (S/M).
- One-line disclaimer in drill-modal footer and inspector empty state; label "SIM" feeds explicitly (S).

**4. CI with staleness guard** (the committed root `index.html` can silently go stale today)
- GitHub Actions: lint → build → `git diff --exit-code -- index.html` → cached Playwright smoke
  (S). Verify the singlefile build is byte-deterministic first.
- Vitest + `tests/data.test.js`: schema/integrity validation of COMPANIES/FLOWS (orphan edges,
  coord ranges, provenance fields, confidence bounds) as a millisecond non-browser test (S).

**5. Mobile selection feedback** (the core loop is broken on phones: tapping a pin shows nothing —
the inspector is below the fold)
- Tap → tooltip-as-preview-card with "Details" action; commit scrolls to / opens the inspector
  (bottom sheet under 860px) (M).
- Timebar/legend/hint collision at ≤480px; `.srch` 16px to stop iOS focus-zoom (S).

**6. Color pipeline unification** (prerequisite for theming + color-blind support)
- CSS vars become canonical; JS reads them at boot via `getComputedStyle` into `SEC`/`PCOL`;
  then: Okabe-Ito color-blind-safe palette toggle, and shape redundancy (circle/square/triangle)
  for the R/E/I pin dots — the product's trust signal is currently illegible to ~5% of male users (S/M).
- Preference persistence: one `localStorage` blob (filters, sizeBy, theme, cvd, last view) (S).

**7. Data quick wins**
- Typed `k` (kind) field on every edge — 446/478 map mechanically from their source string;
  enables flow-type filtering (S, + S/M for the `kindOn` filter UI).
- Defense/gov procurement edges (UST→LMT/RTX/BA/GE/HON; EUGOV→AIR): high-value, *Reported*
  provenance, cheap (S).
- Sector taxonomy: add `telecom`/`materials`/`utilities`, re-tag ~8 misfiled nodes (S).
- Escape-or-template helper (`esc()`/`html` tagged template) for all innerHTML interpolation —
  closes the stored-XSS surface before data ever becomes external (S).
- LICENSE file (MIT, code) + data license statement (CC-BY-4.0 + "modeled/illustrative") (S).

## Phase 2 — P1: Depth & reach

**Data & realism**
- Real live panel: Frankfurter (FX) + CoinGecko (crypto/gold proxy) fetched browser-side —
  both verified CORS-open and keyless; sim becomes the offline fallback; per-ticker freshness
  labels (S).
- GitHub Action data pipeline (`refresh-data.yml` + `scripts/fetch-data.mjs`): FRED daily series
  (rates/oil/gold), World Bank GDP for macro nodes; emits `data/latest.json` + dated snapshots;
  the Action's commit *is* the deploy under deploy-from-branch (M).
- SEC `companyfacts` XBRL pipeline replacing hardcoded `rev` with true per-year reported revenue —
  this also kills the fake TMUL curve for covered names (M).
- Per-entity time series: optional `revT`/`vT` arrays with TMUL fallback via one `valAt()`
  accessor; curate ~30 high-variance series (NVDA, TSLA, oil majors, COVID pharma) ≈ +8–10KB;
  make pin sizing respect time; inspector sparkline + YoY delta (M).
- Famous missing edges: GOOGL→AAPL TAC (~$20B), ad-spend and cloud-spend templates,
  AAPL→QCOM/AVGO; fix one-edge central banks (FED→UST QE, sovereign-debt holdings, interbank);
  de-artifact BRK's fictional degree-49 "primary lender" hub (M).
- Missing entity classes: asset owners (Vanguard, State Street, NBIM, GPIF, PIF, GIC),
  commodity traders (Vitol, Trafigura, Glencore, Cargill), Maersk; supranationals (IMF, World
  Bank, BIS) as gov macro-nodes; regional rebalance (~20 nodes: India, SE Asia, LatAm, Africa,
  Middle East) (M–L, the flows wiring is the real effort).

**Map & graph**
- Per-country polygons (Natural Earth 110m, build-script generated, ~10k vertices) → choropleth
  by aggregate flow, country click-select, borders, lakes — the single biggest cartography unlock (M).
- Arc aggregation at world view (merge by endpoint region below scale ~2); skip true edge
  bundling — frame-budget-hostile and it destroys the provenance dash encoding (M).
- Perf: replace per-pin `shadowBlur` with pre-rendered glow sprites; batch arcs by style;
  idle-pause the RAF loop when the view is settled (S/M).
- Drill-down: hover tooltip + click-to-navigate (closes the current dead end), hub-ego label
  declutter (port the map's clash pass), ring radius scaled by node count, pin/unpin, modal
  zoom/pan, then 2-hop expand-in-place (S→M ladder).
- **Shortest money path** ("how does a dollar get from Saudi Aramco to NVIDIA?"): Dijkstra over
  478 edges is microseconds; highlight the path on the map with per-hop provenance — the marquee
  analytical feature (M).

**Analytics & navigation**
- Inspector derived metrics: net flow, concentration (top-counterparty %), flows as % of revenue,
  sector rank; flow share-of-total in methodology block (S).
- Bottom analytics drawer over the map (the 336px rail is full): leaderboards, 7×7 sector flow
  matrix, country aggregates — every row click-navigates (M).
- Search ranking (exact ticker ≫ prefix ≫ substring, mcap tie-break) + ArrowDown/Enter keyboard
  flow (S); counterparty names in flow rows click-through to `selectNode` (S); Cmd+K palette (M).
- Per-node provenance scorecard replacing the binary verdict ("72% of NVDA's picture is
  Inferred"); confidence-driven arc alpha + min-confidence slider (S/M).

**Reach**
- OG/Twitter card + build-time `og.png` via the existing Playwright tooling; h1 semantics;
  JSON-LD WebApplication; robots/sitemap; theme-color + apple-touch-icon; repo topics (S/M).
- Publish `data/companies.json` + `data/flows.json` with `_meta` (version, license, schema) —
  a free static API in ~20 lines of postbuild (S); filtered-view CSV/JSON export + per-node CSV (S/M);
  map PNG export with legend/caption composited (M); CITATION.cff (S).
- Story mode: data-driven step arrays over existing `selectNode`/camera APIs; ship three:
  "Follow the iPhone dollar", "Where the Fed's profit goes", "2020: the COVID crater" (M).
- First-run overlay (3 bullets + "take the tour"), glossary in the About modal (S).
- PWA shell: manifest + ~30-line cache-first service worker (the app is already one file;
  offline is nearly free) + safe-area insets (M).
- Accessibility: `aria-live` region announcing selection/filter changes (S, highest leverage);
  roving keyboard focus over visible pins using the existing `lastDrawn` array (M); combobox
  pattern for search (M); dash samples in the map legend (S).

## Phase 3 — P2: Architecture & expansion

- Module split in shippable steps: constants/format → tiny pub-sub store (fixes the
  forgotten-rerender bug class; prerequisite already half-needed by URL sync) → drill → feed →
  projection → views → render last. JSDoc `@typedef` + `checkJs` over TS (zero-dep build) (M–L).
- Light theme behind the unified color pipeline (`prefers-color-scheme` default, manual toggle);
  settings popover (gear in top bar); density setting (M).
- Full-graph view (all 163 nodes — trivially renderable), centrality rankings, community
  detection tint, per-node sankey toggle in the modal (M each).
- Visual regression via `toHaveScreenshot` with `reducedMotion:'reduce'` emulation (M);
  extract + unit-test pure functions (proj/unproj round-trip, fmt, relaxation invariant) (M).
- Extend years to 2014–2025 annual (skip quarterly — 6–8× data for seasonal noise);
  per-year `mcapT` for top ~15 names (M).
- Structured derivation chains for E flows (`d:{inputs,formula}` — the method strings already
  contain the data); "report an issue with this figure" → prefilled GitHub issue (S–M).
- `?embed=1` chrome-less mode (CSS-only; skip the postMessage API — speculative) (M);
  print stylesheet for node dossiers (S); watchlist/pinned entities (M);
  landscape-phone layout query; long-press touch preview (M).
- Exchanges/SWIFT/insurers/crypto entity classes; M&A/buybacks/FDI flow types (needs
  stock-vs-flow date semantics) (L).

## Sequencing logic

1. **Phase 0 + P0 items 1–4 first**: they are mostly S-effort and every later feature inherits
   their credibility (verifiable sources, shareable links, served methodology, CI that prevents
   stale deploys).
2. URL state (P0-2) before stories, embeds, OG deep links, and the analytics drawer — they all
   want addressable state.
3. Color pipeline (P0-6) before any theming work; typed `k` field (P0-7) before flow-type UI.
4. Real-data pipeline (P1) before expanding the entity set — adding 40 nodes is cheaper when
   revenue/mcap refresh automatically.
5. Module split (P2) can ride alongside any phase; do the store extraction when URL sync lands.
