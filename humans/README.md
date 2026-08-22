# humans/ — the $100M–$5B census

A companion dataset to the ValueGrid map: **the people** the capital flows run through,
in the band between $100 million and $5 billion.

Open `humans/index.html` — a single self-contained file, same as the root site.

## What this is, and what it is not

The brief was "all of them." That list does not exist, and it is worth being precise
about why, because the gap is itself the interesting finding:

- Roughly **30,000+ people worldwide hold more than $100M**. No public source enumerates
  them. Forbes and Bloomberg between them track ~2,800 billionaires closely; below $1B
  the coverage thins fast and becomes national rather than global.
- The sub-$1B band is documented **unevenly by geography, not by wealth**. India's Hurun
  list reaches ~$100M and the UK's Sunday Times and Australia's AFR reach roughly their
  local equivalents, so those countries look "richer in the tail" than, say, Indonesia or
  Nigeria — which reflects who publishes lists, not where the money is.
- **Privately-estimated wealth is, by construction, not enumerable.** Fortunes held through
  trusts, private holdcos, and family offices surface only when a transaction, a filing, or
  a lawsuit forces them into the open.

So this is a **census, not a ranking and not a roster**: a deliberate spread across every
wealth band, region and sector, sized so the *shape* of the population is legible. Adding
people makes it denser; it never makes it complete. The table says so on its face.

## Provenance (R / E / I)

Reused verbatim from the main site, because the problem is the same one:

| Tag | Meaning |
|-----|---------|
| **R** | Reported — a figure published by a named rich list (Forbes, Bloomberg, Hurun, Sunday Times, Manager Magazin, AFR, Forbes Middle East, …). |
| **E** | Estimated — modelled from a disclosed stake × a known valuation or market cap. Moves daily. |
| **I** | Inferred — a third-party or dated estimate. Directional only. |

A person's headline tag is the **weakest** figure holding it up, not an average.
Net worth in this band is dominated by illiquid, privately-held stakes, so **E is the
honest default** and the dataset is deliberately heavy with it.

## Derived, never typed

Anything computable is computed in `build.mjs` from the fields the records already carry,
so a person's arithmetic can never drift from their dates:

| Measure | Derived as |
|---|---|
| `years` | `2026 − started` — time taken to reach today's figure |
| `vel` | `nw × 1000 ÷ years` — $M accumulated per year, the one number comparable across a 40-year industrialist and a 6-year exit |
| `ageAt100` | `startAge + toFirst100` — how old they were at the first $100M |
| `since100` | `years − toFirst100` — years spent compounding after that |
| `band` | bucketed from `nw` against the band edges declared once in `build.mjs` |

`build.mjs` also **fails the build** on: a net worth outside the $100M–$5B scope, a
duplicate id, an unknown region/sector/origin, a confidence outside (0,1], a `started` year
after the as-of date, and — the check that catches the most research errors — an `age` that
disagrees with `started + startAge` by more than two years.

## Structure

```
humans/
  SCHEMA.md      the record contract the ten research passes wrote against
  data/*.json    ten regional files, one per research pass — the raw records
  build.mjs      merge + validate + derive; emits humans.json and index.html
  template.html  the page, with /*__DATA__*/ placeholders
  humans.json    GENERATED — merged, validated, derived
  index.html     GENERATED — self-contained page (do not edit; edit template.html)
```

## Run it

```bash
node humans/build.mjs           # merge, validate, derive, emit
node humans/build.mjs --check   # validate only; non-zero exit on any error
```

## Reading the charts

- **Where the band actually sits** — the census shape. Sampling is deliberate, so read
  this as coverage, not as the real population (which is a steep power law: far more
  people at $100M than at $5B).
- **How long it took** — years since starting against today's figure, on a log scale
  because the band spans 50× and a linear axis buries the entire sub-$1B half. Colour is
  origin of wealth, and every use of it also carries a text label.
- **Where they are** and **what they did** — region and sector coverage.
