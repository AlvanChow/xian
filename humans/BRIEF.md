# US census — shared research brief

Read `humans/SCHEMA.md` for the record contract. This file is the *research* method.
The census is **US-only**: every record is `"country": "US"` with a USPS `state`.

## Scope
`nw` strictly between **0.1 and 5.0** ($100M–$5B). Anyone above $5B is out of scope —
check the current figure before excluding *or* including. Do not include a person whose
figure you cannot source. A short honest file beats a padded one.

## The band quota is the whole point
Do NOT fill your file with the richest names you can recall. The sub-$1B half is the
harder and more valuable half, and it is where this census earns its keep.

## Sources, best first
1. **Forbes Real-Time Billionaires** and the **Forbes 400** — for $1B+. Tag `R`.
2. **Forbes America's Richest Self-Made Women** — the single best published source for
   *verified sub-billion* US net worths. Tag `R`.
3. **SEC filings** — SC 13D/13G, Form 4, and DEF 14A beneficial-ownership tables give a
   share count. Multiply by a price you actually fetch, and name the filing in `m`.
   Tag `E`. This is how you reach the $100M–$1B band for people no list covers.
4. **Regional business journals and city rich lists** — Crain's, the Business Journals,
   Texas Monthly, Puget Sound Business Journal, D CEO. Tag `R` or `I` by quality.
5. **Reported transaction proceeds** — an acquisition price times a disclosed ownership
   share, net of known dilution. Tag `E`, show the arithmetic in `m`.

**Never** use a net-worth aggregator site (celebritynetworth and its clones). Those numbers
are invented. If a figure traces only to one of those, drop the person.

## Two sourcing artifacts already found — do not reproduce them silently
- **The published sub-$1B US cohort skews female**, because Forbes' Self-Made Women list is
  nearly the only publisher that verifies figures below $1B. If you fill your lower bands
  only from that list, you will encode a publishing artifact as a fact about wealth. Reach
  the sub-$1B men through SEC stake computations (`E`) so the bands are comparably sourced.
- **Private industrial and family fortunes are systematically invisible** next to listed-equity
  ones. A Midwest packaging or distribution fortune surfaces only when the company sells.
  Do not let that make your file all software.

## Prose bar — this is a dossier, not a listicle
- `did` — the concrete thing. Product, year, buyer, price.
- `why` — the actual *mechanism*: a timing window, a distribution lock, a regulatory moat,
  a cost advantage, a channel nobody else had. Never praise, never "vision and hard work."
- `comp` — real named competitors they actually faced.
- `obst` — a specific, checkable obstacle: a lawsuit, a near-bankruptcy, a rejected round,
  a recall, a co-founder split, a short-seller report, a bank pulling a line.
- `turn` — one inflection point, with a year.
- `toFirst100` — years from `started` to first crossing $100M. Estimate honestly.

## Arithmetic the build enforces (it will reject your file)
`age` must equal `startAge + (2026 - started)` within 2 years. Check every record before
writing — this is the single most common failure.

## Do not duplicate these 31 people already in the census
NEIL_BLUMENTHAL AARON_LEVIE PETER_RAHAL KATRINA_LAKE JEREMY_STOPPELMAN JANICE_BRYANT_HOWROYD
EMMA_GREDE JENNY_JUST THERESE_TUCKER ADI_TATARKO MERRILEE_KICK KENDRA_SCOTT TORY_BURCH
ANASTASIA_SOARE JAMIE_KERN_LIMA CELINE_DION JUDY_SHEINDLIN RYAN_PETERSEN JEREMY_ALLAIRE
GARY_MICHELSON TOPE_AWOTONA RON_SHAICH FARRIS_WILKS SHEILA_JOHNSON JIM_MCKELVEY SARA_BLAKELY
MICHAEL_JORDAN FRANK_VANDERSLOOT MICHELLE_ZATLYN CAMERON_WINKLEVOSS HERBERT_WERTHEIM

## Output
One JSON array to the path your prompt names. Valid JSON, no fences, no trailing commas.
Verify with `node -e "const d=require('<path>'); console.log(d.length)"` and fix if it fails.
Run no git commands.
