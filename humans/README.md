# humans/ — the $100M–$5B census

A companion dataset to the ValueGrid map: **the people** the capital flows run through,
in the band between $100 million and $5 billion — **United States only**, and organised
around one question in particular: **who got there before 45.**

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

## Two rules that decide edge cases

**US means residence, not citizenship.** The census maps where money sits, so a Barbadian
or Canadian citizen living in Los Angeles is in it, and an American living in Monaco is not.

**For inherited wealth, `started` is when *they* took control** — not when the business was
founded by someone else. An heir also has `toFirst100` of 0: they cross $100M on
inheritance rather than climbing to it, and recording that as a 20-year climb would make
the speed charts lie.

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
| `ageb` | bucketed from `age`; the 45 line falls on a band edge, so under-45 is exactly the first four bands |
| `u45` | `age < 45` — the cut the census is organised around |

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

## Why 45

The band is full of people who took a whole career to get there and people who took six
years, and a plain rich list cannot tell them apart — it sorts on the size of the fortune,
which is the least interesting fact about it. Splitting on 45 separates the two populations,
and once split, the sector chart stops being a list of industries and becomes an answer to
"which routes are fast." Everything on the page is therefore reported against that cut:
the age histogram, the scatter (which draws the 45 line rather than implying it), and the
sector and region charts, which stack under-45 against 45-and-over rather than totalling them.

Expect the split to be uneven by sector, and expect that unevenness to be real: crypto,
software and the creator economy produce $100M in a person's 30s; Permian oil, private
manufacturing and agriculture take a career. A file that showed those as equally young
would be wrong.

## Reading the charts

- **How old they are** — the age histogram, under-45 bands in blue. Sampling is deliberate,
  so read this as coverage of the census, not as the true age distribution of American
  $100M+ fortunes (which skews considerably older than any list of founders suggests).
- **Age against fortune** — every person by age and net worth, on a log y-axis because the
  band spans 50× and a linear axis buries the entire sub-$1B half. The 45 line is drawn.
  Colour is origin of wealth, and every use of it also carries a text label.
- **Which routes are fast** — sector, stacked under-45 against 45-and-over. This is the
  chart the whole dataset exists to produce.
- **Where they are** — the same split by US region.
