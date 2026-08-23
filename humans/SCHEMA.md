# humans/ record schema

One JSON array per agent, written to `humans/data/<slug>.json`.
Field naming mirrors src/rents.js so the provenance machinery (p/c/m/s) is reused verbatim.

```jsonc
{
  "id":      "ELON_MUSK",        // STABLE_UPPER_SNAKE, unique globally, ASCII only
  "n":       "Jane Doe",         // display name
  "age":     58,                 // integer, or null if genuinely unknown
  "city":    "Austin",           // primary city of residence
  "country": "US",               // always "US" — this census is US-only, on RESIDENCE
                                 // not citizenship: it maps where the money sits.
                                 // A Barbadian or Canadian citizen resident in LA is in.
  "state":   "TX",               // USPS two-letter state code
  "region":  "tx",               // one of: bay | socal | pnw | mtn | tx | mw | se | ne | nyc | dc
  "nw":      2.4,                // net worth in $B. MUST be >= 0.1 and <= 5.0.
                                 // BOTH ENDS INCLUSIVE: exactly 5.0 is in scope, not out.
  "p":       "R",                // provenance: R reported | E estimated | I inferred
  "c":       0.9,                // source confidence, 0 < c <= 1
  "s":       "Forbes Real-Time, Aug 2026",   // the actual source
  "m":       "Published list figure",        // methodology, one line
  "sect":    "tech",             // tech|finance|industry|consumer|realestate|energy|health|media|retail|logistics|agri|crypto|other
  "origin":  "self",             // self | inherited | mixed
  "co":      "Acme Systems",     // company / vehicle the wealth came from
  "did":     "...",              // WHAT THEY DID. 1-2 sentences, concrete.
  "started": 1998,               // year they began the wealth-creating venture
  "startAge":33,                 // their age that year
  "toFirst100": 9,               // years from `started` to first crossing $100M (E/I is fine)
  "why":     "...",              // WHY IT WORKED. the actual mechanism, not praise.
  "comp":    ["Rival A","Rival B"],  // who they competed against
  "obst":    "...",              // obstacles overcome — concrete, specific
  "turn":    "..."               // the single inflection point
}
```

`years` (time taken to reach current net worth) is DERIVED — `NW_ASOF_YEAR - started` —
computed in code, never typed, so it cannot drift from `started`.

## Rules
- **Never invent a person.** Every record is a real, publicly documented individual.
- **Never invent a number.** If you cannot source a net worth, do not include the person.
- Tag honestly: `R` only for a figure published by Forbes / Bloomberg / a national rich list
  (Sunday Times, Manager Magazin, Hurun, AFR, Challenges, Quote 500, etc.).
  `E` for a figure you modeled from a stake x valuation. `I` for a third-party or dated estimate.
- `did`, `why`, `obst`, `turn` must be SPECIFIC. "Hard work and vision" is a failed record.
  Name the product, the year, the competitor, the near-death moment.
- Prose fields: no newlines, no double quotes inside, <= 320 chars each.
