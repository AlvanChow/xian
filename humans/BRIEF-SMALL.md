# The $100M–$500M sweep — research brief

Read `humans/SCHEMA.md` for the record contract. This file replaces BRIEF.md's method.

## The band
**`nw` between 0.1 and 0.5 only.** Not 0.6, not 0.09. Anything outside is out of scope for
this sweep — the census already covers $500M+ well and does not need more of it.

## Why this band is hard, and what that means for method
Forbes stops publishing at $1B. The existing census is **1% Reported in $100–250M and 19%
in $250–500M** — meaning almost every record in your band has to be *computed*, not looked
up. Searching "richest people in <place>" will fail. It returns billionaires and aggregator
spam. **Do not work that way.**

Work from **filings to people**, not from names to figures:

1. **SEC full-text search** (efts.sec.gov/LATEST/search-index?q=...) and EDGAR browse.
   The four documents that pay:
   - **SC 13D / SC 13G** — anyone holding >5% of a public company. A 5% stake in a $2B
     company is $100M. This is the single richest source in your band.
   - **DEF 14A** proxy beneficial-ownership tables — officers, directors, and 5% holders,
     with **ages printed for directors**, which solves the birth-year problem that has
     killed records elsewhere in this census.
   - **S-1 / 424B4** for companies that listed 2020–2026 — founder and early-employee
     stakes, pre-dilution.
   - **DEFM14A** merger-consideration tables — a cash acquisition prices a private stake
     exactly. No modelling needed.
2. **Multiply by a price you actually fetch** (stockanalysis.com or the filing's own date).
   Put the share count, the price, and the date in `m`. Tag `E`.
3. **Regional business journals and city rich lists** — Crain's Chicago/Detroit/NY, the
   Business Journals' local lists, Puget Sound Business Journal, D CEO, Boston Business
   Journal. These reach below $1B where Forbes does not. Tag `R` or `I` by quality.
4. **Announced transaction prices** × a disclosed ownership share. Tag `E`, show the maths.

**Never** use celebritynetworth or any aggregator. Those numbers are invented. A figure that
traces only to one of those means the person does not go in the file.

## Ages
`age` must equal `startAge + (2026 - started)` within 2 years or **the build rejects the
record**. Proxy statements print director ages — use them. If you cannot source a birth year,
**drop the person**; several otherwise-perfect records have been dropped across this census
for exactly this reason and that is the correct outcome. Never guess an age.

## Priorities, in order
1. **In band** ($100M–$500M) and **sourceable**. Nothing else matters if these fail.
2. **Under 45** — aim for half. The census is 24% under 45 and the young are concentrated in
   exactly your band, so this is where that number can actually move. Never shade an age.
3. **Not already in the census.** Check `humans/humans.json` for existing ids before writing.
4. **Women**, who are under-represented for a sourcing reason: Forbes' Self-Made Women list
   was cut to billionaires only in 2026, removing the best verified sub-$1B source. Proxy
   tables are the replacement.

## Prose bar
`did` the concrete thing, with years and numbers. `why` the actual mechanism — a timing
window, a distribution lock, a regulatory moat, a channel nobody else had; never praise.
`comp` real named competitors. `obst` a specific checkable obstacle. `turn` one inflection
point with a year. Each ≤320 chars, no newlines, no double quotes.

## Output
A JSON array to the path your prompt names. Valid JSON, no fences, no trailing commas.
Verify: `node -e "const d=require('<path>'); console.log(d.length, d.every(r=>r.nw>=0.1&&r.nw<=0.5))"`.
Run no git commands. If you can only source 7 good records, write 7 — a short honest file
beats a padded one, and say so in your reply.
