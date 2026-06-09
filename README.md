# ValueGrid

An interactive, canvas-rendered world map of **global capital flows** — companies, governments, central banks, and household sectors, linked by ~480 directional money flows. Every figure carries a **provenance tag** so you can see exactly how trustworthy it is.

Live site: **https://alvanchow.github.io/xian/**

![ValueGrid](https://img.shields.io/badge/render-canvas-5b8cff) ![provenance](https://img.shields.io/badge/provenance-R%2FE%2FI-3fd68a)

## What it is

- **~163 nodes** — public companies (sized by market cap or revenue), plus macro nodes: treasuries, central banks (Fed, ECB, PBOC, BOJ), governments, and household sectors.
- **~480 flow edges** — supplier payments, corporate tax, household consumption, banking/credit, energy input-output, foundry bill-of-materials, dividends, central-bank remittances, and government transfers.
- **A force-directed drill-down graph** for any node's ego-network.
- **Time scrubbing** (2019–2024) and a simulated **live feed** panel.
- **An inspector** that breaks down every node's inflows/outflows and shows the methodology + source behind each figure.

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

> **Note:** This is an illustrative visualization. Reported (R) figures are anchored to filings; Estimated (E) and Inferred (I) figures are modeled and should be treated as directional, not audited.

## Project structure

```
src/
  index.html   # shell markup (Vite dev entry)
  styles.css   # all styling
  world.js     # coastline geometry (export const WORLD)
  data.js      # COMPANIES + FLOWS (export const)
  app.js       # render loop, projection/zoom, interaction, inspector, drill-down
scripts/
  postbuild.mjs # copies the inlined build to repo-root index.html
tests/
  smoke.spec.js # Playwright browser smoke tests
index.html      # BUILT single-file deliverable (GitHub Pages entry point)
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

The build produces a **single, fully self-contained `index.html`** at the repo root — no external CSS/JS requests — which is exactly what GitHub Pages serves.

## Deploy (GitHub Pages, deploy-from-branch)

The repo root `index.html` is the committed, self-contained build. To publish:

1. Push to `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source → Deploy from a branch**.
3. Set **Branch** to `main` and the folder to **/ (root)**, then **Save**.
4. After a minute, the site is live at **https://alvanchow.github.io/xian/**.

Re-run `npm run build` and commit the updated root `index.html` whenever you change anything in `src/`.

## License

MIT
