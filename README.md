# ValueGrid

An interactive, canvas-rendered world map of **global capital flows** — companies, governments, central banks, and household sectors, linked by ~510 directional money flows. Every figure carries a **provenance tag** so you can see exactly how trustworthy it is.

Live site: **https://alvanchow.github.io/xian/**

![ValueGrid](https://img.shields.io/badge/render-canvas-5b8cff) ![provenance](https://img.shields.io/badge/provenance-R%2FE%2FI-3fd68a)

Three tabs, three questions. The **Map** answers *where does the money go?* The **Scarcity board**
answers *where is the money stuck?* The **Humans** census answers *who ends up holding it — and how
long did that take?*

## The Map

- **164 nodes** — public companies (sized by market cap or revenue), plus macro nodes: treasuries, central banks (Fed, ECB, PBOC, BOJ), governments, and household sectors.
- **~510 flow edges** — supplier payments, corporate tax, household consumption, banking/credit, energy input-output, foundry bill-of-materials, dividends, central-bank remittances, and government transfers.
- **A ranked flow budget.** Drawing all ~510 edges and all 164 pins at once was a hairball: every
  arc faint, none legible, and no way to tell a $400B relationship from a $2B one. The map draws the
  largest 120 flows by default (20 / 40 / 120 / All is a control), and the largest ~45 entities at
  fit-view, revealing the tail as you zoom. Selecting a node always shows its own flows in full,
  whatever the budget. Travelling dots mark only the selected ego-network — five hundred of them
  moving at once read as static.
- **A force-directed drill-down graph** for any node's ego-network.
- **Time scrubbing** (2019–2025) and a simulated **live feed** panel.
- **An inspector** that breaks down every node's inflows/outflows and shows the methodology + source behind each figure.
- **Mouse, touch, and keyboard control** — drag/scroll-wheel on desktop; one-finger pan, pinch-zoom, and tap-select on touch devices; arrow keys pan, `+`/`−` zoom, and `0` resets when the map is focused.

## The Scarcity board

A ranked board of **scarcity rents** — things whose price has diverged far above the cost of new
supply because supply cannot respond. DRAM and HBM are the canonical recent examples: the same
bits, priced at multiples of their own trough, because a fab is a three-to-four year commitment
and nobody wanted to repeat 2019.

Each signal carries the price now, the baseline it is priced against, the annual excess rent that
gap implies, who collects it, why supply is stuck, when relief arrives, **what solving it actually
requires**, and what would kill the trade. Named suppliers that exist on the map are clickable —
one click jumps to that entity's flow network.

- **Two scales.** *Industrial* is the 26 signals nobody can act on alone — a fab, an enrichment
  cascade, a transformer plant. *Small operator* (`src/micro.js`) is the same phenomenon at a size
  one person or a small team could take on: 16 niches where the barrier is a certification queue, a
  tacit skill, one machine or an approved-vendor listing rather than $10B of capex. Those entries
  additionally answer what it costs to start, how long until the first invoice, what one to five
  people could bill, and how many months that takes to pay back. Nothing on that board is a
  published price, and it says so on every entry.
- **A sortable table.** Nine visible columns on the industrial board, ten on the small-operator one,
  and every one of them sorts — click a header, click again to flip. Each column is declared once in
  `app.js` and drives the header, the cell and the ordering together, so a header can never disagree
  with the ordering underneath it. Header and rows share one `grid-template`, so their alignment
  cannot drift either. Rows are ~34px; the board spent one revision as ~280px editorial cards, which
  read beautifully and let four things fit on a screen — a ranked board whose ranking you cannot see
  is not doing its job. The prose those cards carried lives in the inspector beside the table.
- **A chart in every row** — inline SVG, the price series against a dashed baseline, so the shaded
  gap between the two *is* the rent. A scatter plot sat above the list for one revision and was cut:
  it was the most technical thing on the page and its bubbles piled up in the 3–5 year band.
- **Derived measures, never typed** — implied unit volume (`rVolume`, which inverts the rent-pool
  identity), last year's move, years elevated, biggest swing, substitutes, barriers. All computed
  from fields the entries already carry, so widening the board never introduces a number that can
  drift from the rest.
- **Media and policy attention** — 0–100 *editorial judgements* of how much something is being
  written about and legislated about. They are deliberately **not** counts: no honest article- or
  bill-mention tally spans these categories, and inventing one would dress a guess up as a
  measurement. Tagged `I` throughout, rendered as bars rather than digits, and unit-tested to stay
  out of the rank score — an entry should rank on its economics, not on how loud it is.
- **Named counterparties on both sides.** Every entry names who collects the rent *and* who pays it,
  and on the small-operator board who is already doing the work. Names that exist on the Map are
  clickable straight through to that entity's flow network; a unit test asserts every claimed id
  resolves, so the link can never dead-end.
- **One click-in, not two views.** Selecting a row fills the right-hand panel with the complete
  record: the five table columns restated, the price chart, what is going on, who collects it, why
  nobody can make more (with each barrier explained), what is already being built, what solving it
  requires, what would kill it, substitutes, the historical analogue, and a per-figure provenance
  table with the score formula. There used to be a "Full dossier" modal on top of this; it repeated
  what the panel beside it already said, so it was folded in and removed.
- **A reverted-signals archive** — DRAM 2018, container freight 2021, lithium 2022, travel nurses
  2021, GLP-1 2023, SiC 2023, TTF gas 2022, LCD panels 2021, NYC taxi medallions 2013. Every one
  of them was, at its peak, as compelling as anything currently on the board. Rents decay; the
  archive is there so the board never reads as a list of permanent conditions.

**The rank score is computed, never typed** — 30% rent multiple, 28% rent pool, 20% persistence,
12% concentration, 10% incumbent margin, derived in `rentScore()` (`src/rents.js`) from the entry's
own fields and unit-tested for monotonicity. Provenance is deliberately *excluded* from the score:
a weakly-sourced signal ranks where its numbers put it and shows an **I** badge, rather than being
quietly demoted inside a number.

Deep-linkable: `#view=rents&r=HBM`, with scale, category, barrier, sort column and sort direction all
carried in the hash. Each view emits only its own keys — a board link never carries the map's
selected node or period, and the map's state is held in memory across a tab switch rather than in
the URL.

## The Humans census

The people the flows run through, in the band between **$100 million and $5 billion**, United
States only — and organised around one question in particular: **who got there before 45.**

- **557 people, 48 states, 224 cities.** Bottom-heavy by design: 176 records sit in $100M–$250M
  and 160 in $250M–$500M, which is the true shape of the population and the opposite of what a
  rich list shows.
- **353 records are computed, not looked up.** Forbes and Bloomberg stop at the billion mark, so
  beneath it every figure is a share count taken from a named SEC filing — a 13D, 13G, DEF 14A,
  Form 4, S-1 or merger-consideration table — times a price fetched on the as-of date, with the
  count, the price and the filing date carried on the record. The published rate by band runs
  100%, 93%, 17%, 11%, 1% as the bands descend.
- **A dossier for every person**: what they built, the year they started and their age then, how
  long it took to reach the first $100M, why it worked, who they competed against, what nearly
  stopped them, and a per-figure provenance table.
- **Five views** — the net-worth distribution stacked by sector, age and speed, what kind of
  wealth each era made, geography, and a findings page whose every number is computed from the
  dataset at render time rather than written into the prose.
- **A sortable table with drag-to-reorder columns** (Alt+←/→ moves the focused one), remembered
  per viewer.

Deep-linkable: `#view=humans&h=MATEI_ZAHARIA`, with the active view, sort and filters in the hash.

**What it does not claim.** There is no complete list of American $100M–$5B fortunes and there
cannot be. This is a deliberately spread census, not a ranking and not a roster, and three biases
are documented rather than hidden: the **birth-year problem** (US proxies print the ages of
*directors* and not of officers, holders or heirs, so ~20 fully-sourced people were dropped for a
missing date of birth, which biases the age distribution old and falls hardest on people under 45
and on women); **`city` is best-effort residence**, since an SEC-derived record often has only the
filer's HQ city; and figures are **gross beneficial ownership** except where a record's own
methodology says it nets something down. Full method in [`humans/README.md`](humans/README.md).

The dataset is **generated**: `humans/build.mjs` merges the regional research files, validates
them, derives every computable measure, and emits `src/humans.js`. It fails the build on a net
worth outside scope, a duplicate id, an unknown enum, or an `age` that disagrees with
`started + startAge` by more than two years.

## The provenance model (R / E / I)

Every node and every flow is tagged with one of three confidence tiers, and carries a confidence score (0–1), a methodology string, and a source string:

| Tag | Name | Meaning |
|-----|------|---------|
| **R** | **Reported** | Anchored to a primary filing or disclosure (e.g. a company's annual report or 10-K). Highest confidence. |
| **E** | **Estimated** | Modeled from disclosure + input-output tables, tax-incidence models, or trade data. Also covers point-in-time figures like market cap that move daily. |
| **I** | **Inferred** | Third-party allocations or heuristics (e.g. bill-of-materials traces, 13-F ownership × payout, banking-relationship models). Directional only. |

The left rail shows the live **provenance mix** — the share of visible flow volume resting on Reported vs. Estimated vs. Inferred figures. Toggle the data layers to see how much of the picture is modeled versus filed.

## Data sources

The figures are drawn from / modeled on a mix of public sources, including:

- Company **annual reports / 10-K filings** (revenue, supplier concentration, segments).
- **UN Comtrade** bilateral trade flows (e.g. crude oil HS-2709) for cross-border supply.
- **BEA / OECD** consumption input-output coefficients for household-demand allocation.
- **13-F** holdings for dividend/ownership flows.
- **USAspending.gov** / federal contract data for government procurement.
- Central-bank annual financial statements and **Treasury / Eurostat** outlay & receipt tables for transfers and remittances.
- Tax-incidence modeling (sector margin × jurisdiction effective rate) for corporate tax flows.

> **Note:** This is an illustrative visualization. Company revenue is **real where we can prove it**: `scripts/fetch-data.mjs` pulls reported annual revenue (FY2019–2025) from SEC XBRL filings (10-K / 20-F) into a generated `src/facts.js`, and only those figures display the **R (Reported)** tag — with a "Verify at SEC" link in the inspector. Everything not backed by a fetched filing is shown as **E (Estimated)** or **I (Inferred)** and should be treated as directional, not audited. Flow edges are modeled throughout. The "Market feeds" panel mixes real quotes (ECB FX via Frankfurter, BTC/gold via CoinGecko, fetched only while Live is on) with simulated series — each row is labeled `live` or `sim`.
>
> **The Scarcity board is mostly modeled, and says so.** Advanced-packaging slots, CDMO line rates, HBM ASPs and bilateral isotope supply are not publicly quoted, so most of its prices are **E** or **I** — the board's provenance mix reports the split, and each signal's headline tag is the *weakest* figure holding it up, not an average. A handful of figures are genuinely **R** (PJM capacity auction clears, FCC auction averages, FDA shortage status). Rent pools are the softest number on the board: they multiply a modeled price gap by a modeled volume. Treat the ranking as a way to argue about where capacity is missing, not as a valuation.

## Project structure

```
src/
  index.html   # shell markup (Vite dev entry)
  styles.css   # all styling
  world.js     # coastline geometry (export const WORLD)
  data.js      # COMPANIES + FLOWS (export const)
  facts.js     # GENERATED — real SEC-reported revenue series (do not edit)
  rents.js     # Scarcity board: RENTS + ARCHIVE + the derived rank score
  humans.js    # GENERATED — census metadata + the on-demand loader (see humans/)
  public/humans-data.json  # GENERATED — the 557 records, fetched on first open
  app.js       # render loop, projection/zoom, interaction, inspector, drill-down, scarcity board
scripts/
  postbuild.mjs   # copies the inlined build to repo-root index.html
  fetch-data.mjs  # fetches reported revenue from SEC XBRL -> src/facts.js
humans/
  build.mjs       # merge + validate + derive -> src/humans.js, humans/index.html
  data/*.json     # the regional research files
  README.md       # method, provenance, and the census's known biases
index.html      # BUILT single-file deliverable (GitHub Pages entry point)
humans-data.json # GENERATED — served beside it, fetched by the census on demand
tests/
  smoke.spec.js   # Playwright smoke tests for the map and board (file://)
  census.spec.js  # Playwright smoke tests for the census (served build)
  unit/           # node:test data-integrity tests (data, rents, micro, humans)
.github/workflows/
  ci.yml            # lint + unit + build (staleness guard) + smoke tests
  refresh-data.yml  # monthly SEC data refresh + rebuild + commit
```

## Run it

```bash
npm install

# Live dev server with hot reload
npm run dev

# Build the single self-contained file -> dist/index.html, then copy to ./index.html
npm run build

# Lint
npm run lint

# Browser smoke tests (run `npm run build` first)
npx playwright install chromium   # one-time
npm test
```

The build produces a **self-contained `index.html`** at the repo root — no external CSS/JS
requests — plus **`humans-data.json`** beside it. Both are committed and both are what GitHub
Pages serves.

The census is the one view that fetches. Its 557 records are ~900KB, and inlining them put that
on the first paint of every visitor, including the majority who only ever open the Map. They now
load once, on the first click of the Humans tab, which keeps `index.html` at ~450KB (120KB
gzipped) — the weight it was before the census existed. The trade is that the census alone needs
the page **served over http** rather than opened from disk; it says so on screen instead of
failing silently, and the Map and the Scarcity board still work from `file://` exactly as before.

## Deploy (GitHub Pages, deploy-from-branch)

The repo root `index.html` is the committed, self-contained build. To publish:

1. Push to `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source → Deploy from a branch**.
3. Set **Branch** to `main` and the folder to **/ (root)**, then **Save**.
4. After a minute, the site is live at **https://alvanchow.github.io/xian/**.

Re-run `npm run build` and commit the updated root `index.html` whenever you change anything in `src/`.

## License

MIT
