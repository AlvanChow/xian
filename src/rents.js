/* Scarcity board — the curated dataset of scarcity rents.

   A "scarcity rent" is the gap between what a thing costs to buy today and what
   it would cost if supply could respond. The gap is the price signal: the market
   asking for capacity that does not exist yet. Every entry answers the same six
   questions — what is the price, what should it be, who collects the difference,
   why supply cannot respond, when relief arrives, and what would kill the trade.

   Field naming deliberately mirrors src/data.js so the provenance machinery
   (PCOL / PNAME / .tag.R|E|I) is reused verbatim:
     p  provenance tier, 'R' | 'E' | 'I'
     c  source-quality score, (0,1]
     m  methodology prose
     s  source string
     u  unit of measure
     n  display name

   Per-entry schema:
     id    stable uppercase key (also the deep-link value: #view=rents&r=<id>)
     n     display name
     cat   category enum — see CATS
     u     unit the price is quoted in
     th    one-line thesis (<=160 chars)
     px    current price       {v, asOf, p, c, m, s, url?}
     base  reference price     {v, per, p, c, m, s}      — what supply-responsive costs
     ser   short price series  [{t, v}]                  — sparkline, <=12 points
     pool  annual excess rent  {v ($B/yr), p, c, m, s}
     gm    incumbent gross margin {v (0-1), who, p, c, m, s, url?}
     conc  concentration       {top3 (0-1), hhi, p, c, s, sup:[{id?|n, sh}]}
             sup[].id, when present, MUST resolve in COMPANIES (src/data.js) —
             that is what makes a supplier row click through to the map.
     bar   barrier enum list, most-binding first — see BARS
     ttr   time to relief      {mo (months), p, c, m, s}
     build what is already under construction
     solve what solving it actually requires  [<=180 chars each]
     kill  what would collapse the rent       [<=180 chars each]
     sub   substitutes / adjacent plays
     an    ARCHIVE id of the closest historical analogue

   The rank score is NEVER stored here — it is derived in app.js (rentScore) from
   these fields, so the ranking is auditable and cannot drift from the data.

   Figures are curated estimates unless tagged R. Treat E and I as directional.  */

export const RENT_ASOF = '2026-08';

/* Category enum. Keys are also the color keys in app.js (RCAT). */
export const CATS = {
  compute: 'Compute & semiconductors',
  power: 'Power & grid',
  materials: 'Materials & mining',
  pharma: 'Pharma & bio',
  labor: 'Labor',
  logistics: 'Logistics & transport',
  infra: 'Infrastructure',
  agri: 'Agriculture & food',
  defense: 'Defense',
  regulated: 'Regulated & licensed',
};

/* Barrier enum — why supply cannot respond. Ordered most-binding-first per entry. */
export const BARS = {
  capex: 'Capacity lead time',
  physics: 'No known process',
  permit: 'Permitting & siting',
  labor: 'Licensed headcount',
  export: 'Export control',
  ip: 'Patent / trade secret',
  feedstock: 'Upstream input',
  grid: 'Grid interconnection',
  capital: 'Capital discipline',
};

/* What each barrier actually means for how — and how fast — a rent can be
   solved. Rendered in the dossier beside the entry-specific relief note. */
export const BARWHY = {
  capex: 'Money can fix this, but not quickly: the plant exists as a construction schedule, and the schedule is the price.',
  physics: 'No process exists at the required scale. Capital does not shorten this one — only research does.',
  permit: 'The plant could be built. The permission to build it is the scarce good, and it is granted politically.',
  labor: 'Supply is people who hold a certification. The training pipeline sets the ceiling, and it runs in years.',
  export: 'Capacity exists but is withheld as policy. The premium can vanish on an announcement, in either direction.',
  ip: 'A patent or an unwritten process advantage keeps entrants out. Licensable in principle, rarely in practice.',
  feedstock: 'The visible bottleneck sits downstream of a scarcer one. Fixing this step just moves the constraint upstream.',
  grid: 'The asset is finished but cannot connect. Queue position, not construction, is what is being rationed.',
  capital: 'Capacity could be added and is not. Incumbents were burned last cycle and are choosing price over volume.',
};

/* ---- derived measures ----
   These live beside the data, not in the UI, so the unit tests score exactly
   what the board scores. Nothing here is ever stored in an entry. */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Rent multiple: what the thing costs now over what supply-responsive costs. */
export const rMult = (e) => e.px.v / e.base.v;

/** Rank weights. Surfaced in the About modal so the ranking is auditable. */
export const RW = { mult: 0.30, pool: 0.28, persist: 0.20, conc: 0.12, margin: 0.10 };

/** Composite 0-100 rank score. Caps: 6x multiple, $200B/yr pool, 6-year horizon. */
export function rentScore(e) {
  return 100 * (
    RW.mult * clamp01(Math.log(rMult(e)) / Math.log(6)) +
    RW.pool * clamp01(Math.log10(e.pool.v + 1) / Math.log10(201)) +
    RW.persist * clamp01(e.ttr.mo / 72) +
    RW.conc * clamp01((e.conc.top3 - 0.33) / 0.62) +
    RW.margin * clamp01((e.gm.v - 0.20) / 0.60));
}

/** The key figures a signal rests on — the inputs to both provenance measures. */
export const rentFields = (e) => [e.px, e.base, e.pool, e.gm, e.conc, e.ttr];

/** Headline provenance is the WEAKEST tier, not an average: a signal is only as
    good as the softest number holding it up. */
export const rentProv = (e) => {
  const t = rentFields(e).map((f) => f.p);
  return t.includes('I') ? 'I' : t.includes('E') ? 'E' : 'R';
};

/** Mean source quality across those same figures. */
export const rentConf = (e) => {
  const f = rentFields(e);
  return f.reduce((a, b) => a + b.c, 0) / f.length;
};

export const RENTS = [
  {
    id: 'HBM',
    n: 'HBM3E / HBM4 stacked memory',
    cat: 'compute',
    u: '$ per GB of stacked DRAM',
    th: 'AI accelerators cannot ship without stacked memory, and stacking capacity is a scarcer, separate constraint from DRAM bits themselves.',
    px: { v: 20, asOf: '2026-Q2', p: 'E', c: 0.5, m: 'Blended HBM ASP implied by disclosed HBM revenue divided by estimated shipped GB.', s: 'Vendor earnings disclosures; channel estimates' },
    base: { v: 3.4, per: '2023 commodity DDR5 contract average', p: 'E', c: 0.55, m: 'Conventional server DRAM $/GB — the cost floor stacking is priced against, since HBM is the same bits plus TSV assembly.', s: 'DRAM contract price series' },
    ser: [{ t: '2022', v: 4.0 }, { t: '2023', v: 6.2 }, { t: '2024', v: 13.0 }, { t: '2025', v: 18.5 }, { t: '2026', v: 20.0 }],
    pool: { v: 32, p: 'I', c: 0.35, m: '(price − baseline) × estimated annual HBM bit shipments. Both terms are modeled, so the product is directional only.', s: 'Derived from vendor shipment guidance' },
    gm: { v: 0.58, who: 'SKHYNIX', p: 'E', c: 0.5, m: 'Company-level gross margin, not an HBM-segment figure — vendors do not break HBM out, so this understates the product margin.', s: 'FY2025 annual report' },
    conc: { top3: 0.95, hhi: 3800, p: 'E', c: 0.65, s: 'Vendor bit-share disclosures', sup: [{ id: 'SKHYNIX', sh: 0.5 }, { id: 'SAMSUNG', sh: 0.31 }, { id: 'MU', sh: 0.14 }] },
    bar: ['capex', 'ip', 'physics'],
    ttr: { mo: 30, p: 'E', c: 0.45, m: 'Time for announced TSV/stacking lines to reach qualified volume — qualification, not construction, is the binding step.', s: 'Announced capex schedules' },
    build: 'All three incumbents have announced stacking capacity additions; each still gates on customer qualification cycles measured in quarters, not weeks.',
    solve: [
      'Decouple stacking from the DRAM makers — qualify independent OSAT partners so TSV capacity can be added without a fab.',
      'Standardize the base die so a fourth supplier can enter without winning a captive design slot first.',
    ],
    kill: [
      'An accelerator demand pause: HBM content per unit stops rising while three suppliers land capacity at once — the exact 2018 sequence.',
      'A packaging route that reaches bandwidth parity without TSV stacking.',
    ],
    sub: ['Wider conventional DDR5 buses', 'On-package SRAM or LPDDR for inference-class parts'],
    an: 'DRAM2018',
  },
  {
    id: 'DDR5',
    n: 'Server DDR5 conventional DRAM',
    cat: 'compute',
    u: '$ per GB, contract',
    th: 'Diverting wafers to HBM starved the commodity market that funds the fabs, so ordinary server memory re-priced without any new demand shock.',
    px: { v: 9.5, asOf: '2026-Q2', p: 'E', c: 0.55, m: 'Server DDR5 RDIMM contract price per GB.', s: 'Contract price series' },
    base: { v: 2.2, per: '2023 trough', p: 'E', c: 0.6, m: 'The prior cycle low — roughly cash cost for the marginal supplier, which is what a supply-responsive market clears at.', s: 'Contract price series' },
    ser: [{ t: '2022', v: 3.3 }, { t: '2023', v: 2.2 }, { t: '2024', v: 4.1 }, { t: '2025', v: 7.4 }, { t: '2026', v: 9.5 }],
    pool: { v: 46, p: 'I', c: 0.35, m: '(price − baseline) × estimated annual server DRAM bit shipments.', s: 'Derived from industry bit-shipment estimates' },
    gm: { v: 0.55, who: 'MU', p: 'E', c: 0.55, m: 'Company gross margin at the top of the cycle. Amplitude, not level, is the point: the same line printed negative margins in 2023.', s: 'FY2025 10-K' },
    conc: { top3: 0.94, hhi: 3400, p: 'E', c: 0.7, s: 'Industry bit-share estimates', sup: [{ id: 'SAMSUNG', sh: 0.4 }, { id: 'SKHYNIX', sh: 0.34 }, { id: 'MU', sh: 0.2 }] },
    bar: ['capex', 'capital'],
    ttr: { mo: 24, p: 'E', c: 0.5, m: 'Greenfield DRAM capacity runs three to four years; converting existing lines back from HBM is faster but sacrifices the higher-margin product.', s: 'Historical fab construction timelines' },
    build: 'Capex has turned up, but the incumbents are pointing it at HBM, which consumes roughly three wafers per bit of equivalent conventional output.',
    solve: [
      'Add wafer starts rather than re-mixing them — the shortage is bits, and HBM conversion removes bits from the same pool.',
      'Break the three-supplier structure: any credible fourth entrant changes the discipline, not just the capacity.',
    ],
    kill: [
      'Capex discipline breaking, which it always has: DRAM has never sustained a rent past the capacity it funds.',
      'Demand normalizing while converted HBM lines swing back to commodity bits.',
    ],
    sub: ['DDR4 on older platforms', 'CXL memory pooling to raise utilization of installed DRAM'],
    an: 'DRAM2018',
  },
  {
    id: 'COWOS',
    n: 'CoWoS / SoIC advanced packaging slots',
    cat: 'compute',
    u: '$ per 300 mm interposer-equivalent wafer',
    th: 'The binding constraint on AI silicon is not the logic wafer but the packaging step that bonds it to memory — one supplier, allocated by relationship.',
    px: { v: 8500, asOf: '2026-Q2', p: 'I', c: 0.35, m: 'Implied packaging cost per interposer wafer from teardown-derived accelerator BOM allocations.', s: 'Teardown analyses; supply-chain estimates' },
    base: { v: 2600, per: 'conventional flip-chip BGA equivalent', p: 'I', c: 0.35, m: 'Cost of the packaging step this displaced, adjusted for area.', s: 'Packaging cost models' },
    ser: [{ t: '2023', v: 4200 }, { t: '2024', v: 6400 }, { t: '2025', v: 7900 }, { t: '2026', v: 8500 }],
    pool: { v: 14, p: 'I', c: 0.3, m: '(price − baseline) × estimated annual advanced-packaging wafer capacity. Capacity is disclosed only in ranges, so this is the weakest figure on this entry.', s: 'Derived from disclosed capacity ranges' },
    gm: { v: 0.59, who: 'TSMC', p: 'E', c: 0.6, m: 'Company gross margin; the packaging line is not broken out separately.', s: 'FY2025 20-F' },
    conc: { top3: 0.9, hhi: 5200, p: 'E', c: 0.6, s: 'Capacity share estimates', sup: [{ id: 'TSMC', sh: 0.7 }, { id: 'SAMSUNG', sh: 0.12 }, { n: 'Amkor / ASE', sh: 0.1 }] },
    bar: ['capex', 'ip', 'labor'],
    ttr: { mo: 24, p: 'E', c: 0.45, m: 'Packaging fabs build faster than logic fabs, but yield learning on a new site is the real gate.', s: 'Announced facility schedules' },
    build: 'Multiple new packaging facilities are under construction, and the incumbent has repeatedly guided to capacity roughly doubling year over year.',
    solve: [
      'Qualify OSAT second sources at volume — the technology is licensable, the yield learning is not.',
      'Move to packaging routes with fewer bespoke steps so capacity is fungible across customers.',
    ],
    kill: [
      'Capacity roughly doubling annually, on the incumbent\'s own guidance, against demand that cannot double forever.',
      'Panel-level packaging reaching yield parity and breaking the wafer-format constraint entirely.',
    ],
    sub: ['Organic interposers', 'Fan-out panel-level packaging', 'Bridge-die approaches'],
    an: 'SIC2023',
  },
  {
    id: 'HIGHNA',
    n: 'High-NA EUV lithography scanners',
    cat: 'compute',
    u: '$ per tool',
    th: 'A single vendor sells the only machine capable of the next node, at a price set by what the node is worth rather than what the tool costs.',
    px: { v: 380, asOf: '2026-Q1', p: 'E', c: 0.6, m: 'Announced system price for a High-NA EUV scanner, in $M.', s: 'Vendor disclosures and customer commentary' },
    base: { v: 180, per: 'standard 0.33-NA EUV system', p: 'R', c: 0.75, m: 'The prior-generation tool price, itself already a monopoly price — so this baseline understates the true rent.', s: 'Vendor reported ASPs' },
    ser: [{ t: '2023', v: 340 }, { t: '2024', v: 360 }, { t: '2025', v: 370 }, { t: '2026', v: 380 }],
    pool: { v: 4, p: 'I', c: 0.3, m: '(price − baseline) × units shipped per year. Unit counts are single digits, so this is small in dollars and enormous in leverage.', s: 'Derived from shipment disclosures' },
    gm: { v: 0.52, who: 'ASML', p: 'E', c: 0.7, m: 'Company gross margin. EUV specifically carries a lower margin than the corporate average at introduction and rises with volume.', s: 'FY2025 annual report' },
    conc: { top3: 1, hhi: 10000, p: 'R', c: 0.95, s: 'Sole supplier — no second source exists', sup: [{ id: 'ASML', sh: 1 }] },
    bar: ['physics', 'ip', 'export'],
    ttr: { mo: 120, p: 'E', c: 0.4, m: 'No credible second source exists on any announced timeline; the constraint is a supply chain of sole-source optics that took two decades to assemble.', s: 'Industry structure' },
    build: 'Output is rising slowly, but every unit routes through the same sole-source optics vendor, which is the actual bottleneck.',
    solve: [
      'A second optics supply chain — this is the whole problem, and it is a twenty-year industrial project, not a purchase order.',
      'Node roadmaps that extract more from existing 0.33-NA tools via multipatterning, trading cost for independence.',
    ],
    kill: [
      'High-NA proving unnecessary if multipatterning on existing EUV stays economic for another node.',
      'Leading-edge demand concentrating into so few customers that they gain pricing power back.',
    ],
    sub: ['0.33-NA EUV with multipatterning', 'Advanced packaging as a substitute for further shrink'],
    an: null,
  },
  {
    id: 'NEARLINE',
    n: 'Nearline enterprise HDD',
    cat: 'compute',
    u: '$ per TB',
    th: 'AI datasets re-priced the storage nobody was building: three suppliers spent a decade cutting HDD capacity, then demand for cold bulk capacity inverted.',
    px: { v: 26, asOf: '2026-Q2', p: 'E', c: 0.5, m: 'High-capacity nearline drive price per TB, contract.', s: 'Channel price series' },
    base: { v: 13, per: '2023 average', p: 'E', c: 0.55, m: 'Pre-shortage contract level, close to the cost curve for the marginal supplier.', s: 'Channel price series' },
    ser: [{ t: '2023', v: 13 }, { t: '2024', v: 15 }, { t: '2025', v: 21 }, { t: '2026', v: 26 }],
    pool: { v: 9, p: 'I', c: 0.3, m: '(price − baseline) × annual nearline exabytes shipped.', s: 'Derived from vendor exabyte disclosures' },
    gm: { v: 0.38, who: 'Seagate / Western Digital', p: 'E', c: 0.5, m: 'Blended company gross margin across the two pure-play suppliers.', s: 'FY2025 10-K filings' },
    conc: { top3: 1, hhi: 3600, p: 'R', c: 0.9, s: 'Three-supplier industry, publicly reported shares', sup: [{ n: 'Seagate', sh: 0.43 }, { n: 'Western Digital', sh: 0.37 }, { n: 'Toshiba', sh: 0.2 }] },
    bar: ['capex', 'capital'],
    ttr: { mo: 18, p: 'E', c: 0.5, m: 'Head and media capacity is the constraint; suppliers dismantled it over a decade and are rebuilding deliberately slowly.', s: 'Vendor capex commentary' },
    build: 'Capacity additions are explicitly demand-gated and pre-sold under long-term agreements — the suppliers are choosing price over volume.',
    solve: [
      'Rebuild head and media capacity, which requires the suppliers to believe the demand outlasts the current cycle.',
      'Close the $/TB gap to QLC flash so the substitution constraint stops binding.',
    ],
    kill: [
      'QLC flash reaching $/TB parity for cold tiers — the substitute exists and is on a faster cost curve.',
      'AI storage demand proving front-loaded rather than recurring.',
    ],
    sub: ['QLC NAND for warm tiers', 'Tape for genuinely cold archives'],
    an: 'LCD2021',
  },
  {
    id: 'XFMR',
    n: 'Large power transformers (HV/EHV)',
    cat: 'power',
    u: '$ per MVA',
    th: 'Every electrification story routes through one component nobody built capacity for, and the lead time is now longer than most projects can finance.',
    px: { v: 34, asOf: '2026-Q2', p: 'E', c: 0.5, m: 'Delivered price per MVA for large HV units, in $ thousands.', s: 'Utility procurement disclosures' },
    base: { v: 12, per: '2020 average', p: 'E', c: 0.55, m: 'Pre-shortage procurement level.', s: 'Utility procurement disclosures' },
    ser: [{ t: '2020', v: 12 }, { t: '2021', v: 14 }, { t: '2022', v: 19 }, { t: '2023', v: 25 }, { t: '2024', v: 30 }, { t: '2025', v: 33 }, { t: '2026', v: 34 }],
    pool: { v: 18, p: 'I', c: 0.3, m: '(price − baseline) × estimated annual global large-transformer MVA shipments.', s: 'Derived from industry shipment estimates' },
    gm: { v: 0.33, who: 'HITACHI', p: 'E', c: 0.45, m: 'Grid-segment margin proxy; the segment reports at group level.', s: 'FY2025 annual report' },
    conc: { top3: 0.6, hhi: 1500, p: 'E', c: 0.5, s: 'Market share estimates', sup: [{ id: 'HITACHI', sh: 0.25 }, { id: 'SIE', sh: 0.2 }, { n: 'Prysmian / others', sh: 0.15 }] },
    bar: ['capex', 'labor', 'feedstock'],
    ttr: { mo: 48, p: 'E', c: 0.55, m: 'Quoted lead times run three to five years. New plants take three years and then need winders who take years to train.', s: 'Utility lead-time disclosures' },
    build: 'Several plant expansions are underway in North America and Europe, but grain-oriented electrical steel and trained winders both gate output.',
    solve: [
      'Expand grain-oriented electrical steel supply — it is the upstream constraint behind the visible one.',
      'Standardize utility transformer specifications so units become fungible instead of bespoke per order.',
      'Fund winder apprenticeships now; the plant is three years, the workforce is longer.',
    ],
    kill: [
      'Datacenter and electrification load growth undershooting, leaving pre-ordered capacity into a soft market.',
      'Spec standardization actually landing, which would let existing plants run far higher effective throughput.',
    ],
    sub: ['Refurbished units', 'Modular/skid substations', 'Grid-enhancing technologies that defer new capacity'],
    an: null,
  },
  {
    id: 'GASTURB',
    n: 'Heavy-duty gas turbine slots',
    cat: 'power',
    u: '$ per kW installed',
    th: 'Datacenter load wants firm power this decade, and the three vendors who make large frames sold their delivery slots through the end of it.',
    px: { v: 1650, asOf: '2026-Q2', p: 'E', c: 0.45, m: 'Installed cost per kW for a new combined-cycle unit including the turbine slot premium.', s: 'Project cost disclosures' },
    base: { v: 750, per: '2021 average', p: 'E', c: 0.55, m: 'Pre-shortage installed cost per kW.', s: 'Project cost disclosures' },
    ser: [{ t: '2021', v: 750 }, { t: '2022', v: 830 }, { t: '2023', v: 980 }, { t: '2024', v: 1280 }, { t: '2025', v: 1520 }, { t: '2026', v: 1650 }],
    pool: { v: 21, p: 'I', c: 0.3, m: '(price − baseline) × estimated annual heavy-duty frame GW shipped.', s: 'Derived from vendor order books' },
    gm: { v: 0.29, who: 'GE', p: 'E', c: 0.5, m: 'Power-segment margin proxy at group level.', s: 'FY2025 10-K' },
    conc: { top3: 0.85, hhi: 2600, p: 'E', c: 0.65, s: 'Order-book share estimates', sup: [{ id: 'GE', sh: 0.35 }, { id: 'SIE', sh: 0.3 }, { n: 'Mitsubishi Power', sh: 0.2 }] },
    bar: ['capex', 'labor', 'capital'],
    ttr: { mo: 54, p: 'E', c: 0.5, m: 'Slot books are full for several years; vendors are expanding cautiously because they were burned by the last gas build-out.', s: 'Vendor order-book commentary' },
    build: 'Capacity expansions are announced but deliberately paced — the vendors remember writing down turbine capacity after the last cycle.',
    solve: [
      'Vendors adding frame capacity against firm multi-year offtake rather than spot orders.',
      'Load-side alternatives that reduce the firm-power ask: demand response, storage-plus-solar firming, nuclear uprates.',
    ],
    kill: [
      'Capital discipline breaking under the size of the order book, which is what ends every equipment rent.',
      'Datacenter load forecasts proving inflated, leaving the slots stranded.',
    ],
    sub: ['Aeroderivative and reciprocating engines', 'Battery storage for peaking', 'Nuclear uprates'],
    an: null,
  },
  {
    id: 'SWU',
    n: 'Uranium enrichment (SWU)',
    cat: 'power',
    u: '$ per separative work unit',
    th: 'Sanctioning the largest enricher removed a third of Western supply from a market with no spare centrifuge capacity and a decade-long build cycle.',
    px: { v: 178, asOf: '2026-Q2', p: 'E', c: 0.6, m: 'Spot SWU price.', s: 'Nuclear fuel market price reporting' },
    base: { v: 42, per: '2020 average', p: 'E', c: 0.65, m: 'Pre-disruption spot level, in a market that was structurally oversupplied.', s: 'Nuclear fuel market price reporting' },
    ser: [{ t: '2020', v: 42 }, { t: '2021', v: 54 }, { t: '2022', v: 96 }, { t: '2023', v: 135 }, { t: '2024', v: 168 }, { t: '2025', v: 174 }, { t: '2026', v: 178 }],
    pool: { v: 7, p: 'I', c: 0.35, m: '(price − baseline) × estimated annual Western SWU demand.', s: 'Derived from reactor fuel demand estimates' },
    gm: { v: 0.45, who: 'Urenco / Orano', p: 'I', c: 0.3, m: 'Enrichment-segment margin proxy; both are unlisted or state-linked and disclose little.', s: 'Company annual reports' },
    conc: { top3: 0.9, hhi: 2800, p: 'E', c: 0.6, s: 'Enrichment capacity estimates', sup: [{ n: 'Rosatom / TENEX', sh: 0.35 }, { n: 'Urenco', sh: 0.33 }, { n: 'Orano', sh: 0.14 }] },
    bar: ['capex', 'export', 'permit'],
    ttr: { mo: 72, p: 'E', c: 0.5, m: 'Centrifuge cascades take five to seven years from decision to output, and licensing runs in parallel rather than after.', s: 'Announced expansion schedules' },
    build: 'Western enrichers have announced expansions, and a domestic HALEU line is being stood up, but neither reaches volume this decade.',
    solve: [
      'Fund centrifuge capacity against long-term contracts — the enrichers will not build on spot signals after the last two decades.',
      'Resolve the HALEU chicken-and-egg: advanced reactors need fuel that needs reactor orders to justify.',
    ],
    kill: [
      'Sanctions easing and Russian material returning to the Western market.',
      'Announced Western capacity landing together into demand that grew slower than the reactor announcements implied.',
    ],
    sub: ['Underfeeding existing cascades', 'Reprocessed uranium', 'Extended fuel cycles'],
    an: null,
  },
  {
    id: 'DCPOWER',
    n: 'Datacenter-ready grid capacity',
    cat: 'power',
    u: '$ per MW-day, capacity auction',
    th: 'The scarce thing is not electricity but an interconnection that already exists — and the auctions that price it went vertical when datacenters started bidding.',
    px: { v: 270, asOf: '2025-Q3', p: 'R', c: 0.85, m: 'Cleared capacity price, PJM RTO, published auction result.', s: 'PJM Base Residual Auction results', url: 'https://www.pjm.com/markets-and-operations/rpm' },
    base: { v: 29, per: 'prior auction', p: 'R', c: 0.85, m: 'The immediately preceding auction clear — same market, same product, one year apart.', s: 'PJM Base Residual Auction results' },
    ser: [{ t: '2022', v: 35 }, { t: '2023', v: 29 }, { t: '2024', v: 270 }, { t: '2025', v: 270 }],
    pool: { v: 12, p: 'E', c: 0.5, m: '(price − baseline) × cleared capacity MW × 365, converted to $B/yr. Both price terms are reported, so this is unusually well-grounded.', s: 'Derived from published auction results' },
    gm: { v: 0.4, who: 'Merchant generators', p: 'I', c: 0.3, m: 'Capacity revenue is close to pure margin for an already-built plant, which is exactly why the auction result matters.', s: 'Generator earnings commentary' },
    conc: { top3: 0.35, hhi: 600, p: 'E', c: 0.5, s: 'Generation ownership within the market', sup: [{ n: 'Constellation', sh: 0.14 }, { n: 'Vistra', sh: 0.12 }, { id: 'GE', sh: 0.09 }] },
    bar: ['grid', 'permit', 'capex'],
    ttr: { mo: 60, p: 'E', c: 0.55, m: 'Interconnection queues run four to seven years in most US markets; transmission takes longer than generation.', s: 'ISO queue statistics' },
    build: 'Queue reform is in progress across several ISOs, and behind-the-meter deals are proliferating precisely because the queue is the constraint.',
    solve: [
      'Interconnection queue reform — cluster studies and deposit requirements that clear speculative projects out of the way.',
      'Price flexible load: datacenters that can curtail are worth far more than firm ones and cost nothing to build.',
      'Transmission siting reform, which is the true multi-decade constraint underneath.',
    ],
    kill: [
      'Capacity auction reform changing the price formation mechanism directly.',
      'Datacenter load growth flattening, or shifting to markets with slack interconnection.',
    ],
    sub: ['Behind-the-meter generation', 'Existing-site brownfield conversions', 'Load flexibility contracts'],
    an: 'TTF2022',
  },
  {
    id: 'COPPER',
    n: 'Copper cathode',
    cat: 'materials',
    u: '$ per tonne',
    th: 'Electrification demand meets a decade of underinvestment and falling ore grades; every new mine takes longer to permit than to build.',
    px: { v: 11200, asOf: '2026-Q2', p: 'E', c: 0.7, m: 'LME cash settlement, point-in-time quote.', s: 'LME' },
    base: { v: 6600, per: '2015-2020 average', p: 'E', c: 0.7, m: 'Long-run average through the last capex cycle, roughly the incentive price for new supply at the time.', s: 'LME historical series' },
    ser: [{ t: '2021', v: 9300 }, { t: '2022', v: 8800 }, { t: '2023', v: 8500 }, { t: '2024', v: 9200 }, { t: '2025', v: 10400 }, { t: '2026', v: 11200 }],
    pool: { v: 12, p: 'E', c: 0.45, m: '(price − baseline) × annual refined copper consumption. Well-grounded on both terms; the baseline choice is the judgment call.', s: 'Derived from ICSG consumption data' },
    gm: { v: 0.42, who: 'RIO', p: 'E', c: 0.55, m: 'Copper-segment margin proxy at group level.', s: 'FY2025 annual report' },
    conc: { top3: 0.3, hhi: 450, p: 'E', c: 0.6, s: 'Mine production share', sup: [{ n: 'Codelco', sh: 0.12 }, { n: 'Freeport', sh: 0.1 }, { id: 'BHP', sh: 0.08 }] },
    bar: ['permit', 'capex', 'feedstock'],
    ttr: { mo: 120, p: 'E', c: 0.6, m: 'Discovery to first production averages well over a decade, and permitting is the majority of it.', s: 'Industry project timelines' },
    build: 'A handful of large projects are in construction, but the pipeline is thin relative to the demand case and grades keep falling.',
    solve: [
      'Permitting reform in the jurisdictions that actually hold the ore — this is the binding constraint, not geology or capital.',
      'Scrap recovery and refining capacity, the fastest-responding supply source available.',
      'Substitution engineering: aluminium in transmission and motors where performance allows.',
    ],
    kill: [
      'Aluminium substitution accelerating in grid and motor applications.',
      'A Chinese construction downturn deep enough to offset electrification demand.',
    ],
    sub: ['Aluminium conductors', 'Recycled cathode', 'Higher-efficiency motor designs that use less copper'],
    an: 'LITHIUM2022',
  },
  {
    id: 'NDPR',
    n: 'NdPr oxide (magnet rare earths)',
    cat: 'materials',
    u: '$ per kg',
    th: 'One country refines almost all of it and has demonstrated willingness to use that as policy; every motor, turbine and actuator depends on the output.',
    px: { v: 118, asOf: '2026-Q2', p: 'E', c: 0.55, m: 'NdPr oxide price, ex-China basis where a Western price exists.', s: 'Rare earth price reporting' },
    base: { v: 55, per: 'China domestic price', p: 'E', c: 0.5, m: 'The domestic price of the same oxide — the gap is the security premium, not a production cost difference.', s: 'Rare earth price reporting' },
    ser: [{ t: '2022', v: 105 }, { t: '2023', v: 72 }, { t: '2024', v: 60 }, { t: '2025', v: 94 }, { t: '2026', v: 118 }],
    pool: { v: 3, p: 'I', c: 0.3, m: '(ex-China price − domestic price) × ex-China NdPr consumption. Small in dollars, decisive in leverage.', s: 'Derived from consumption estimates' },
    gm: { v: 0.35, who: 'Ex-China separators', p: 'I', c: 0.25, m: 'Margin at the separation step, which is where the concentration actually sits — not at the mine.', s: 'Producer disclosures' },
    conc: { top3: 0.92, hhi: 5600, p: 'E', c: 0.7, s: 'Refining capacity share', sup: [{ n: 'China Northern / China Rare Earth', sh: 0.8 }, { n: 'Lynas', sh: 0.09 }, { n: 'MP Materials', sh: 0.05 }] },
    bar: ['export', 'permit', 'feedstock'],
    ttr: { mo: 60, p: 'E', c: 0.5, m: 'Separation plants take three to five years including permitting; the chemistry is well understood, the environmental permitting is not the fast part.', s: 'Announced project schedules' },
    build: 'Several Western separation and magnet plants are in construction with government offtake support — the first credible non-Chinese chain in decades.',
    solve: [
      'Western separation capacity with guaranteed offtake — mines without separation do not solve anything.',
      'Magnet recycling from end-of-life motors, which skips the mining and separation steps entirely.',
      'Design-out: ferrite and wound-rotor motor architectures that avoid heavy rare earths.',
    ],
    kill: [
      'Export controls easing, which collapses the security premium overnight without any new supply.',
      'Motor designs that avoid rare earths reaching cost parity in volume applications.',
    ],
    sub: ['Ferrite magnets', 'Externally excited synchronous motors', 'Recycled magnet feedstock'],
    an: 'LITHIUM2022',
  },
  {
    id: 'ANTIMONY',
    n: 'Antimony',
    cat: 'materials',
    u: '$ per tonne',
    th: 'A small market nobody watched, controlled by one exporter, used in ammunition primers and flame retardants — export controls re-priced it by multiples in months.',
    px: { v: 47000, asOf: '2026-Q2', p: 'E', c: 0.55, m: 'Rotterdam antimony metal price.', s: 'Metal price reporting' },
    base: { v: 11500, per: '2023 average', p: 'E', c: 0.6, m: 'Pre-control market level.', s: 'Metal price reporting' },
    ser: [{ t: '2022', v: 12000 }, { t: '2023', v: 11500 }, { t: '2024', v: 25000 }, { t: '2025', v: 41000 }, { t: '2026', v: 47000 }],
    pool: { v: 0.5, p: 'I', c: 0.35, m: '(price − baseline) × annual Western consumption. Tiny market; the significance is that defense primers have no substitute.', s: 'Derived from USGS consumption data' },
    gm: { v: 0.5, who: 'Ex-China producers', p: 'I', c: 0.25, m: 'Producer margin at current prices against pre-control cost structures.', s: 'Producer disclosures' },
    conc: { top3: 0.85, hhi: 3200, p: 'E', c: 0.65, s: 'USGS mine production estimates', sup: [{ n: 'China', sh: 0.48 }, { n: 'Tajikistan', sh: 0.25 }, { n: 'Russia', sh: 0.12 }] },
    bar: ['export', 'feedstock', 'permit'],
    ttr: { mo: 48, p: 'E', c: 0.45, m: 'Antimony is mostly a by-product; standalone mines need four years and a price that persists long enough to finance them.', s: 'Project development timelines' },
    build: 'Two Western projects have been accelerated with defense funding, but by-product economics make the supply response structurally sluggish.',
    solve: [
      'Standalone Western mine and roaster capacity backed by defense offtake — by-product supply will not respond to price alone.',
      'Recovery from lead smelting and end-of-life flame-retardant streams.',
    ],
    kill: [
      'Export controls lifting, the single most likely outcome and the one that erases the entire premium.',
      'Flame-retardant reformulation, which is most of the volume even though defense is most of the urgency.',
    ],
    sub: ['Alternative flame retardants', 'Recovered antimony from lead recycling'],
    an: null,
  },
  {
    id: 'HELIUM',
    n: 'Grade-A helium',
    cat: 'materials',
    u: '$ per thousand cubic feet',
    th: 'A by-product of natural gas processing with no synthetic route, sold into semiconductor and MRI demand that cannot substitute at any price.',
    px: { v: 620, asOf: '2026-Q2', p: 'E', c: 0.45, m: 'Bulk liquid helium contract price.', s: 'Industrial gas market reporting' },
    base: { v: 210, per: '2018 average', p: 'E', c: 0.5, m: 'Pre-shortage contract level, when the US federal reserve was still releasing volume.', s: 'Industrial gas market reporting' },
    ser: [{ t: '2019', v: 280 }, { t: '2021', v: 340 }, { t: '2023', v: 520 }, { t: '2025', v: 590 }, { t: '2026', v: 620 }],
    pool: { v: 1.2, p: 'I', c: 0.3, m: '(price − baseline) × annual global helium consumption.', s: 'Derived from USGS consumption data' },
    gm: { v: 0.31, who: 'Linde / Air Liquide', p: 'E', c: 0.45, m: 'Industrial gas company margin; helium is not broken out.', s: 'FY2025 annual reports' },
    conc: { top3: 0.75, hhi: 2100, p: 'E', c: 0.55, s: 'Source-field production share', sup: [{ n: 'Qatar', sh: 0.32 }, { n: 'United States', sh: 0.28 }, { n: 'Algeria / Russia', sh: 0.15 }] },
    bar: ['feedstock', 'capex', 'physics'],
    ttr: { mo: 36, p: 'E', c: 0.45, m: 'New supply requires a gas field with helium content plus a dedicated separation train — three years, and only where the geology cooperates.', s: 'Project schedules' },
    build: 'New separation capacity is coming online tied to LNG projects, which is the only economic route to more helium.',
    solve: [
      'Tie helium recovery to every new LNG train where the feed gas contains it — most currently vent it.',
      'Recovery and recycling at point of use, especially MRI, where most helium is simply lost.',
    ],
    kill: [
      'New LNG-linked separation capacity landing faster than semiconductor demand grows.',
      'MRI systems moving to sealed low-helium magnets, which removes a large demand block permanently.',
    ],
    sub: ['Recycled helium at point of use', 'Nitrogen or hydrogen where the application allows'],
    an: null,
  },
  {
    id: 'FILLFINISH',
    n: 'Sterile fill-finish CDMO capacity',
    cat: 'pharma',
    u: '$ per sterile vial-equivalent',
    th: 'The last step of every injectable drug runs through a small number of qualified aseptic lines, and the GLP-1 wave consumed the slack.',
    px: { v: 5.4, asOf: '2026-Q1', p: 'I', c: 0.3, m: 'Implied contract price per sterile vial-equivalent from disclosed CDMO revenue over estimated unit throughput.', s: 'CDMO earnings disclosures' },
    base: { v: 1.9, per: '2019 average', p: 'I', c: 0.3, m: 'Pre-shortage contract pricing, when qualified lines ran below capacity.', s: 'Industry pricing commentary' },
    ser: [{ t: '2019', v: 1.9 }, { t: '2021', v: 2.6 }, { t: '2023', v: 4.1 }, { t: '2025', v: 5.1 }, { t: '2026', v: 5.4 }],
    pool: { v: 6, p: 'I', c: 0.25, m: '(price − baseline) × estimated annual outsourced sterile units. Both terms are modeled; this is one of the weakest pool estimates on the board.', s: 'Derived from CDMO revenue disclosures' },
    gm: { v: 0.34, who: 'Lonza / Catalent', p: 'E', c: 0.45, m: 'CDMO company gross margin.', s: 'FY2025 annual reports' },
    conc: { top3: 0.45, hhi: 900, p: 'E', c: 0.4, s: 'Outsourced sterile capacity estimates', sup: [{ n: 'Lonza', sh: 0.18 }, { n: 'Catalent', sh: 0.15 }, { id: 'TMO', sh: 0.12 }] },
    bar: ['capex', 'permit', 'labor'],
    ttr: { mo: 42, p: 'E', c: 0.5, m: 'An aseptic line takes about two years to build and another year or more to validate and gain regulatory approval for each product.', s: 'Facility project schedules' },
    build: 'Large capacity additions were announced through the GLP-1 build-out; validation timelines mean they arrive well after the orders that justified them.',
    solve: [
      'Regulatory pathways that let a validated line add products faster — validation, not steel, is the long pole.',
      'Prefilled syringe and autoinjector formats that raise throughput per line.',
      'Onshore capacity for sterile generics, where the economics currently do not support any investment at all.',
    ],
    kill: [
      'The announced GLP-1 capacity wave landing into demand that plateaus — the classic CDMO overbuild.',
      'Oral formulations displacing injectable volume in the largest demand block.',
    ],
    sub: ['Prefilled syringes', 'Oral small-molecule alternatives', 'Self-administered autoinjectors'],
    an: 'GLP12023',
  },
  {
    id: 'ISOTOPE',
    n: 'Ac-225 and Lu-177 medical isotopes',
    cat: 'pharma',
    u: '$ per mCi (Ac-225 basis)',
    th: 'Radioligand therapy works, and the isotopes it needs are made in a handful of reactors and accelerators worldwide with no commercial-scale alternative.',
    px: { v: 9500, asOf: '2026-Q1', p: 'I', c: 0.3, m: 'Indicative Ac-225 supply price per millicurie; the market is bilateral and thinly disclosed.', s: 'Supply agreement commentary' },
    base: { v: 2200, per: 'notional accelerator-produced cost', p: 'I', c: 0.2, m: 'Modeled cost of accelerator production at scale — a target, not an observed price, since scale production does not yet exist.', s: 'Published production cost studies' },
    ser: [{ t: '2022', v: 7800 }, { t: '2023', v: 8400 }, { t: '2024', v: 9000 }, { t: '2025', v: 9300 }, { t: '2026', v: 9500 }],
    pool: { v: 0.8, p: 'I', c: 0.2, m: '(price − baseline) × estimated annual clinical supply. Small today; the constraint is capping trial enrolment, not revenue.', s: 'Derived from clinical supply estimates' },
    gm: { v: 0.7, who: 'Isotope suppliers', p: 'I', c: 0.25, m: 'Implied margin at current supply prices against reactor operating costs.', s: 'Producer commentary' },
    conc: { top3: 0.9, hhi: 3400, p: 'E', c: 0.5, s: 'Global production capability', sup: [{ n: 'Oak Ridge / DOE', sh: 0.4 }, { n: 'ITM / European reactors', sh: 0.3 }, { n: 'Rosatom', sh: 0.2 }] },
    bar: ['physics', 'capex', 'permit'],
    ttr: { mo: 48, p: 'E', c: 0.4, m: 'Accelerator-based production is the credible route to scale; facilities are funded but multi-year, and licensing is on the critical path.', s: 'Announced facility schedules' },
    build: 'Several accelerator production facilities are funded and in construction, aimed squarely at breaking the reactor dependency.',
    solve: [
      'Accelerator production at commercial scale — this is a known engineering path that simply has not been funded to volume.',
      'Thorium-229 generator supply expansion as the bridge while accelerators are built.',
      'Regional radiopharmacy networks, since half-life makes distribution part of the constraint.',
    ],
    kill: [
      'Accelerator capacity arriving on schedule, which would collapse the price toward the modeled cost baseline.',
      'Clinical results that narrow the addressable indications.',
    ],
    sub: ['Lu-177 where efficacy allows', 'External beam radiotherapy', 'Alternative alpha emitters'],
    an: null,
  },
  {
    id: 'ATC',
    n: 'Air traffic controllers',
    cat: 'labor',
    u: '$ per fully-loaded controller-year',
    th: 'A single-employer labor market with a multi-year academy pipeline, a hard medical washout rate, and a mandatory retirement age it cannot recruit ahead of.',
    px: { v: 205, asOf: '2026-Q1', p: 'E', c: 0.55, m: 'Fully-loaded annual cost per certified controller including overtime, in $ thousands. Overtime is the visible symptom of the shortage.', s: 'Federal payroll and staffing disclosures' },
    base: { v: 148, per: '2019 fully-loaded cost', p: 'E', c: 0.6, m: 'Pre-shortage cost per controller, before sustained mandatory overtime became structural.', s: 'Federal payroll disclosures' },
    ser: [{ t: '2019', v: 148 }, { t: '2021', v: 158 }, { t: '2023', v: 178 }, { t: '2025', v: 197 }, { t: '2026', v: 205 }],
    pool: { v: 1.5, p: 'I', c: 0.3, m: '(cost − baseline) × certified controller headcount. The economic cost of the shortage — delays and capped schedules — is far larger than the wage rent.', s: 'Derived from staffing disclosures' },
    gm: { v: 0.25, who: 'Controllers (wage premium)', p: 'I', c: 0.2, m: 'The rent here accrues to labor as overtime, not to a firm as margin; this is the premium over baseline compensation.', s: 'Payroll disclosures' },
    conc: { top3: 1, hhi: 10000, p: 'R', c: 0.95, s: 'Single employer by statute', sup: [{ n: 'FAA', sh: 1 }] },
    bar: ['labor', 'permit', 'capex'],
    ttr: { mo: 60, p: 'E', c: 0.6, m: 'Academy plus facility certification runs two to four years, with high washout — and the retirement wave runs faster than the intake.', s: 'FAA training pipeline data' },
    build: 'Hiring targets have been raised repeatedly, but academy throughput and facility-level certification capacity both cap the actual output.',
    solve: [
      'Expand academy and simulator throughput — the binding constraint is training capacity, not applicants.',
      'Certify at more facilities in parallel instead of funnelling everyone through one academy.',
      'Automate the routine separation workload so certified headcount goes further.',
    ],
    kill: [
      'Sustained hiring above attrition for several consecutive years, which mechanically closes the gap.',
      'Airspace automation reducing the controller-hours required per operation.',
    ],
    sub: ['Remote and digital towers', 'Trajectory-based operations', 'Schedule caps at constrained airports'],
    an: 'NURSES2021',
  },
  {
    id: 'WELDERS',
    n: 'Nuclear-qualified and pipe welders',
    cat: 'labor',
    u: '$ per hour, fully loaded',
    th: 'Every reindustrialization plan — reactors, LNG trains, shipyards, fabs — needs the same certified welders, and the certification takes years.',
    px: { v: 145, asOf: '2026-Q2', p: 'E', c: 0.45, m: 'Fully-loaded hourly rate for code-qualified welders on nuclear and high-pressure work, including per diem and travel.', s: 'Construction labor rate surveys' },
    base: { v: 62, per: '2019 average', p: 'E', c: 0.5, m: 'Pre-boom fully-loaded rate for the same certifications.', s: 'Construction labor rate surveys' },
    ser: [{ t: '2019', v: 62 }, { t: '2021', v: 71 }, { t: '2023', v: 98 }, { t: '2025', v: 132 }, { t: '2026', v: 145 }],
    pool: { v: 2.8, p: 'I', c: 0.3, m: '(rate − baseline) × estimated code-qualified welder hours worked annually across nuclear, LNG and shipyard projects.', s: 'Derived from project labor estimates' },
    gm: { v: 0.28, who: 'Specialty contractors', p: 'I', c: 0.25, m: 'Contractor markup on scarce certified trades; the worker captures the wage, the contractor captures the scarcity of crews.', s: 'Contractor disclosures' },
    conc: { top3: 0.2, hhi: 200, p: 'I', c: 0.3, s: 'Fragmented contractor market', sup: [{ n: 'Specialty mechanical contractors', sh: 0.2 }] },
    bar: ['labor', 'capex'],
    ttr: { mo: 48, p: 'E', c: 0.5, m: 'Apprenticeship plus code qualification runs three to five years; the retiring cohort is larger than the entering one.', s: 'Trade apprenticeship data' },
    build: 'Union and employer training programs have expanded, but the intake needed to cover simultaneous nuclear, LNG and shipyard demand does not exist yet.',
    solve: [
      'Fund apprenticeships at the scale the announced project pipeline implies, not the scale current work supports.',
      'Automated orbital welding for repeatable joints, which converts a labor constraint into a capital one.',
      'Modular shop fabrication, moving field welding into controlled environments with better productivity.',
    ],
    kill: [
      'The project pipeline thinning — several megaprojects cancelling releases crews immediately.',
      'Weld automation reaching code acceptance for a wider set of joints.',
    ],
    sub: ['Orbital and automated welding', 'Shop-fabricated modules', 'Alternative joining methods where code permits'],
    an: 'NURSES2021',
  },
  {
    id: 'DCELEC',
    n: 'Datacenter electricians',
    cat: 'labor',
    u: '$ per hour, fully loaded',
    th: 'Datacenter construction is electrically dense and geographically clustered, so a national trade shortage shows up as a local bidding war.',
    px: { v: 118, asOf: '2026-Q2', p: 'E', c: 0.45, m: 'Fully-loaded hourly rate in active datacenter construction markets, including overtime and travel.', s: 'Construction labor rate surveys' },
    base: { v: 68, per: '2020 national average', p: 'E', c: 0.55, m: 'National fully-loaded journeyman electrician rate before the datacenter build-out concentrated demand.', s: 'Construction labor rate surveys' },
    ser: [{ t: '2020', v: 68 }, { t: '2022', v: 78 }, { t: '2024', v: 96 }, { t: '2025', v: 110 }, { t: '2026', v: 118 }],
    pool: { v: 3.4, p: 'I', c: 0.3, m: '(rate − baseline) × estimated electrician hours on datacenter construction annually.', s: 'Derived from construction spend estimates' },
    gm: { v: 0.22, who: 'Electrical contractors', p: 'I', c: 0.25, m: 'Contractor margin on datacenter work, elevated by crew scarcity rather than by scope.', s: 'Contractor earnings commentary' },
    conc: { top3: 0.25, hhi: 300, p: 'I', c: 0.3, s: 'Regional contractor concentration', sup: [{ n: 'National electrical contractors', sh: 0.25 }] },
    bar: ['labor', 'grid'],
    ttr: { mo: 42, p: 'E', c: 0.5, m: 'Electrical apprenticeship runs four to five years. Crews do relocate, which makes this faster to relieve than the licensed trades.', s: 'Trade apprenticeship data' },
    build: 'Apprenticeship intake is up sharply, and crews are migrating to the hot markets — the mechanism that usually ends this kind of rent.',
    solve: [
      'Apprenticeship expansion, already underway, plus reciprocity so licensed crews can cross state lines faster.',
      'Prefabricated electrical assemblies and skid-mounted power rooms that move hours into factories.',
    ],
    kill: [
      'The datacenter construction pipeline slowing, which releases crews immediately — labor rents unwind faster than capital ones.',
      'Prefabrication cutting on-site electrical hours per MW.',
    ],
    sub: ['Prefabricated power skids', 'Modular datacenter designs', 'Crews imported from cooler markets'],
    an: 'NURSES2021',
  },
  {
    id: 'NARROWBODY',
    n: 'Narrowbody aircraft delivery slots',
    cat: 'logistics',
    u: '$M premium per near-term delivery slot',
    th: 'Two manufacturers, both supply-constrained, with order books stretching a decade — so a slot in the next two years trades well above list economics.',
    px: { v: 14, asOf: '2026-Q2', p: 'I', c: 0.3, m: 'Estimated premium paid for near-term delivery positions in the secondary market, in $M per slot.', s: 'Lessor and trading commentary' },
    base: { v: 2, per: '2019 secondary market', p: 'I', c: 0.3, m: 'Typical slot premium when the backlog was long but deliveries were on schedule.', s: 'Lessor commentary' },
    ser: [{ t: '2019', v: 2 }, { t: '2021', v: 1 }, { t: '2023', v: 7 }, { t: '2025', v: 12 }, { t: '2026', v: 14 }],
    pool: { v: 8, p: 'I', c: 0.25, m: '(premium − baseline) × near-term slots traded or implicitly repriced annually.', s: 'Derived from delivery-rate estimates' },
    gm: { v: 0.16, who: 'BA', p: 'E', c: 0.5, m: 'Commercial airplanes segment margin — notably, the manufacturers are not the ones capturing this rent.', s: 'FY2025 10-K' },
    conc: { top3: 1, hhi: 5000, p: 'R', c: 0.9, s: 'Duopoly', sup: [{ id: 'BA', sh: 0.44 }, { id: 'AIR', sh: 0.56 }] },
    bar: ['capex', 'labor', 'feedstock'],
    ttr: { mo: 36, p: 'E', c: 0.5, m: 'Rate increases are gated by the slowest supplier in a tiered chain — engines, castings and structures each cap output independently.', s: 'Manufacturer rate guidance' },
    build: 'Both manufacturers are raising rates, but each increase is repeatedly deferred by a different sub-tier constraint.',
    solve: [
      'Sub-tier capacity, especially castings, forgings and engines — the airframers are not the bottleneck.',
      'Certification throughput for derivative variants sitting in the queue.',
      'MRO capacity so older aircraft can stay in service and reduce the delivery ask.',
    ],
    kill: [
      'Rate increases finally sticking at both airframers simultaneously.',
      'An air-travel demand downturn, which historically ends this rent within two quarters.',
    ],
    sub: ['Life extension of existing fleets', 'Wet leasing', 'Older-generation aircraft at higher fuel cost'],
    an: 'FREIGHT2021',
  },
  {
    id: 'ENGINEMRO',
    n: 'LEAP / GTF engine shop-visit slots',
    cat: 'logistics',
    u: '$M per shop visit',
    th: 'New-generation engines are going to the shop earlier and staying longer than planned, against an MRO network sized for the old schedule.',
    px: { v: 5.8, asOf: '2026-Q1', p: 'I', c: 0.3, m: 'Average cost per shop visit for current-generation narrowbody engines, in $M.', s: 'Operator and lessor disclosures' },
    base: { v: 2.4, per: 'prior-generation equivalent', p: 'I', c: 0.35, m: 'Shop visit cost for the engines these replaced, at comparable thrust.', s: 'MRO market reporting' },
    ser: [{ t: '2021', v: 3.1 }, { t: '2023', v: 4.4 }, { t: '2024', v: 5.1 }, { t: '2025', v: 5.6 }, { t: '2026', v: 5.8 }],
    pool: { v: 5, p: 'I', c: 0.25, m: '(cost − baseline) × annual current-generation shop visits.', s: 'Derived from fleet and visit-rate estimates' },
    gm: { v: 0.3, who: 'GE', p: 'E', c: 0.5, m: 'Aftermarket services margin, which is where engine makers earn — the engine itself is often sold near cost.', s: 'FY2025 10-K' },
    conc: { top3: 0.9, hhi: 3300, p: 'E', c: 0.65, s: 'Engine OEM and licensed MRO network share', sup: [{ id: 'GE', sh: 0.45 }, { id: 'RTX', sh: 0.35 }, { n: 'Licensed independents', sh: 0.1 }] },
    bar: ['capex', 'feedstock', 'labor'],
    ttr: { mo: 30, p: 'E', c: 0.5, m: 'MRO slots expand faster than engine production, but powder-metal castings and skilled technicians both gate turnaround time.', s: 'MRO capacity commentary' },
    build: 'OEMs and independents are both adding shop capacity, and part availability is improving from a very poor base.',
    solve: [
      'Castings and hot-section part supply — the shops are waiting on parts more than on space.',
      'Licensed independent MRO capacity to break the OEM-network chokepoint.',
      'Durability upgrade kits that lengthen the interval and reduce visit volume outright.',
    ],
    kill: [
      'Durability kits reaching the fleet, which directly reduces the number of visits required.',
      'Parts supply normalizing, which is already improving quarter over quarter.',
    ],
    sub: ['Used serviceable material', 'Green-time engine leasing', 'Prior-generation engines on older airframes'],
    an: 'FREIGHT2021',
  },
  {
    id: 'DCSHELL',
    n: 'Powered datacenter shell',
    cat: 'infra',
    u: '$ per kW of critical IT load',
    th: 'The scarce asset is a building with power already contracted; everything else about a datacenter can be bought, and this cannot.',
    px: { v: 14500, asOf: '2026-Q2', p: 'E', c: 0.4, m: 'All-in development cost per kW of critical load in constrained markets, including the power premium.', s: 'Developer cost disclosures' },
    base: { v: 7200, per: '2020 average', p: 'E', c: 0.5, m: 'Pre-boom development cost per kW in the same markets.', s: 'Developer cost disclosures' },
    ser: [{ t: '2020', v: 7200 }, { t: '2022', v: 8600 }, { t: '2023', v: 10200 }, { t: '2024', v: 12000 }, { t: '2025', v: 13600 }, { t: '2026', v: 14500 }],
    pool: { v: 24, p: 'I', c: 0.3, m: '(cost − baseline) × annual GW of new critical load delivered.', s: 'Derived from construction pipeline estimates' },
    gm: { v: 0.45, who: 'Datacenter developers', p: 'I', c: 0.3, m: 'Development margin on stabilized assets, which is where the shell premium is actually capitalized.', s: 'Developer earnings commentary' },
    conc: { top3: 0.4, hhi: 700, p: 'E', c: 0.45, s: 'Wholesale capacity share estimates', sup: [{ n: 'Equinix', sh: 0.15 }, { n: 'Digital Realty', sh: 0.14 }, { id: 'MSFT', sh: 0.11 }] },
    bar: ['grid', 'permit', 'labor'],
    ttr: { mo: 48, p: 'E', c: 0.5, m: 'Land plus interconnection plus construction runs three to five years, and the interconnection is the majority of it.', s: 'Development timelines' },
    build: 'The construction pipeline is at a record, but the fraction with firm power commitments is far smaller than the announced total.',
    solve: [
      'Interconnection reform — this is the same constraint as the grid capacity entry, seen from the real-estate side.',
      'Siting where power is stranded rather than where the fiber already is.',
      'On-site generation as a bridge, which is already how the largest deals get done.',
    ],
    kill: [
      'AI capex guidance moderating, which would reprice the entire pipeline within two quarters.',
      'Interconnection queue reform landing faster than expected.',
    ],
    sub: ['Retrofit of existing industrial sites', 'Behind-the-meter generation', 'Colocation in less constrained regions'],
    an: null,
  },
  {
    id: 'COCOA',
    n: 'Cocoa',
    cat: 'agri',
    u: '$ per tonne',
    th: 'Two countries grow most of it on aging trees hit by disease and weather, and a cocoa tree takes five years to bear — the textbook inelastic supply shock.',
    px: { v: 6800, asOf: '2026-Q2', p: 'E', c: 0.7, m: 'ICE cocoa futures front month, point-in-time quote.', s: 'ICE futures' },
    base: { v: 2450, per: '2015-2022 average', p: 'E', c: 0.75, m: 'Long-run average before the West African production collapse.', s: 'ICE historical series' },
    ser: [{ t: '2022', v: 2400 }, { t: '2023', v: 3300 }, { t: '2024', v: 9800 }, { t: '2025', v: 7600 }, { t: '2026', v: 6800 }],
    pool: { v: 2.2, p: 'E', c: 0.5, m: '(price − baseline) × annual global grind volume. Grind data is published, so this figure is better grounded than most.', s: 'Derived from ICCO grind statistics' },
    gm: { v: 0.18, who: 'Processors and traders', p: 'I', c: 0.25, m: 'Processing margin has actually been compressed by the price spike — the rent is accruing upstream, not to the grinders.', s: 'Processor earnings commentary' },
    conc: { top3: 0.7, hhi: 1800, p: 'R', c: 0.8, s: 'ICCO production statistics', sup: [{ n: "Côte d'Ivoire", sh: 0.38 }, { n: 'Ghana', sh: 0.17 }, { n: 'Ecuador', sh: 0.15 }] },
    bar: ['feedstock', 'physics', 'capital'],
    ttr: { mo: 60, p: 'E', c: 0.6, m: 'A replanted cocoa tree yields in about five years, so the supply response is biological and cannot be accelerated with capital.', s: 'Agronomic replanting data' },
    build: 'Replanting programs are underway and Ecuadorian output is expanding, which is already visible in the price coming off the 2024 peak.',
    solve: [
      'Replanting with disease-resistant varietals — funded now, harvested in five years.',
      'Farmgate pricing that lets growers actually reinvest instead of capturing the rent at the marketing board.',
      'Geographic diversification beyond the two-country concentration.',
    ],
    kill: [
      'Ecuadorian and Brazilian expansion continuing — this is already underway and the price has come off its high.',
      'Demand destruction from reformulation, which chocolate makers have been doing openly.',
    ],
    sub: ['Cocoa butter equivalents', 'Reformulated products with lower cocoa content'],
    an: 'LITHIUM2022',
  },
  {
    id: 'SHELLS155',
    n: '155 mm artillery shells',
    cat: 'defense',
    u: '$ per round',
    th: 'Peacetime procurement sized a wartime consumable, and the energetics chain behind it was allowed to shrink to a single-digit number of plants.',
    px: { v: 3900, asOf: '2026-Q1', p: 'E', c: 0.6, m: 'Contract unit cost per round in recent procurement awards.', s: 'Defense contract award data' },
    base: { v: 1650, per: '2021 procurement', p: 'E', c: 0.65, m: 'Unit cost before the demand step-change, at low-rate production.', s: 'Defense contract award data' },
    ser: [{ t: '2021', v: 1650 }, { t: '2022', v: 2100 }, { t: '2023', v: 3200 }, { t: '2024', v: 3700 }, { t: '2025', v: 3850 }, { t: '2026', v: 3900 }],
    pool: { v: 2.4, p: 'E', c: 0.45, m: '(price − baseline) × annual Western procurement volume. Procurement volumes are published, which helps.', s: 'Derived from published procurement budgets' },
    gm: { v: 0.13, who: 'GD / prime contractors', p: 'E', c: 0.45, m: 'Combat systems segment margin. Cost-plus structures mean the rent shows up as unit cost, not as contractor margin.', s: 'FY2025 10-K filings' },
    conc: { top3: 0.85, hhi: 3000, p: 'E', c: 0.6, s: 'Western production capacity', sup: [{ n: 'General Dynamics OTS', sh: 0.4 }, { n: 'Rheinmetall', sh: 0.3 }, { n: 'Nammo / others', sh: 0.15 }] },
    bar: ['capex', 'feedstock', 'permit'],
    ttr: { mo: 36, p: 'E', c: 0.55, m: 'Loading lines take two to three years; the nitrocellulose and TNT feedstock behind them takes longer and has fewer suppliers.', s: 'Announced facility schedules' },
    build: 'Substantial new loading capacity is funded and coming online in the US and Europe, with output already multiples above the 2021 rate.',
    solve: [
      'Energetics feedstock — nitrocellulose and TNT capacity is the real constraint, and it is a chemical plant problem.',
      'Multi-year procurement contracts so suppliers can finance capacity against something other than an annual appropriation.',
      'Common Western specifications so plants are fungible across national orders.',
    ],
    kill: [
      'A ceasefire, which would strand the newly funded capacity immediately.',
      'Funded capacity landing on schedule against procurement that normalizes.',
    ],
    sub: ['Precision munitions that need fewer rounds', 'Loitering munitions for some mission sets'],
    an: null,
  },
  {
    id: 'SRM',
    n: 'Solid rocket motors',
    cat: 'defense',
    u: '$ per tactical motor',
    th: 'Consolidation left two suppliers for a component every interceptor and tactical missile needs, at exactly the moment interceptor demand went vertical.',
    px: { v: 285, asOf: '2026-Q1', p: 'I', c: 0.35, m: 'Implied unit cost per tactical-class motor from program cost disclosures, in $ thousands.', s: 'Program cost disclosures' },
    base: { v: 120, per: '2020 program costs', p: 'I', c: 0.35, m: 'Unit cost at the prior production rate, before the demand step-change.', s: 'Program cost disclosures' },
    ser: [{ t: '2020', v: 120 }, { t: '2022', v: 160 }, { t: '2023', v: 215 }, { t: '2025', v: 270 }, { t: '2026', v: 285 }],
    pool: { v: 1.8, p: 'I', c: 0.3, m: '(price − baseline) × annual tactical motor deliveries.', s: 'Derived from program quantities' },
    gm: { v: 0.12, who: 'RTX', p: 'E', c: 0.45, m: 'Missiles and defense segment margin; motor supply is largely internal or dual-source, so margin understates the scarcity.', s: 'FY2025 10-K' },
    conc: { top3: 0.95, hhi: 5000, p: 'E', c: 0.7, s: 'Western SRM production capability', sup: [{ n: 'Northrop Grumman', sh: 0.5 }, { id: 'LMT', sh: 0.3 }, { n: 'Anduril / new entrants', sh: 0.1 }] },
    bar: ['capex', 'ip', 'labor'],
    ttr: { mo: 42, p: 'E', c: 0.45, m: 'Motor casting facilities are hazardous-process plants: siting, permitting and qualification all run long, and each program qualifies separately.', s: 'Facility development schedules' },
    build: 'New entrants have won qualification on several programs and are building casting capacity — the first structural change to this duopoly in decades.',
    solve: [
      'Qualify new entrants across programs rather than one at a time — qualification cost is the moat, not casting technology.',
      'Common motor designs across programs so capacity is fungible.',
      'Ammonium perchlorate feedstock capacity, which is itself effectively single-source in the US.',
    ],
    kill: [
      'New entrants reaching volume, which is genuinely underway and is the most likely near-term outcome.',
      'Interceptor demand normalizing after the current restocking cycle.',
    ],
    sub: ['Air-breathing propulsion for some mission sets', 'Directed energy for close-in defense'],
    an: null,
  },
  {
    id: 'CDR',
    n: 'Durable carbon removal',
    cat: 'regulated',
    u: '$ per tonne CO2 removed',
    th: 'Corporate and regulatory demand for permanent removal exists; permanent removal capacity barely does, so the price is set by the cost of the few plants running.',
    px: { v: 480, asOf: '2026-Q1', p: 'E', c: 0.55, m: 'Weighted average price of durable (1000-year) removal purchases.', s: 'Public CDR purchase registries' },
    base: { v: 22, per: 'avoidance-based offsets', p: 'R', c: 0.7, m: 'Price of conventional avoidance offsets — a different product, but the one buyers substitute toward, which is what makes this gap a signal.', s: 'Voluntary carbon market pricing' },
    ser: [{ t: '2022', v: 620 }, { t: '2023', v: 570 }, { t: '2024', v: 530 }, { t: '2025', v: 500 }, { t: '2026', v: 480 }],
    pool: { v: 0.4, p: 'E', c: 0.5, m: '(price − baseline) × annual durable removal tonnes contracted. Registries publish the tonnage, so this is reasonably grounded.', s: 'Derived from CDR purchase registries' },
    gm: { v: 0.1, who: 'CDR developers', p: 'I', c: 0.2, m: 'Most developers are pre-profit; the high price reflects cost, not margin — this is a cost signal, not a rent being captured.', s: 'Developer disclosures' },
    conc: { top3: 0.6, hhi: 1600, p: 'E', c: 0.5, s: 'Delivered-tonne share', sup: [{ n: 'Climeworks', sh: 0.25 }, { n: 'Charm / Heirloom', sh: 0.2 }, { n: 'Others', sh: 0.15 }] },
    bar: ['capex', 'physics', 'permit'],
    ttr: { mo: 60, p: 'E', c: 0.45, m: 'Cost declines require both plant scale-up and energy cost declines; the learning rate is real but the base is very small.', s: 'Developer cost roadmaps' },
    build: 'Several large direct-air-capture and mineralization plants are funded and under construction, aiming at costs well below current prices.',
    solve: [
      'Scale — this is a cost curve problem, and the curve only moves with deployed tonnes.',
      'Cheap clean energy at the plant, which is most of the operating cost for direct air capture.',
      'A durable-removal compliance mandate, which is what would actually create the demand to fund the scale.',
    ],
    kill: [
      'Scale-up landing on its cost roadmap — the price falling is the intended outcome here, not a risk.',
      'Buyers reverting to cheap avoidance credits if durability standards weaken.',
    ],
    sub: ['Avoidance-based offsets', 'Biochar and enhanced weathering at lower durability', 'Point-source capture'],
    an: null,
  },
  {
    id: 'SPECTRUM',
    n: 'Mid-band spectrum licenses',
    cat: 'regulated',
    u: '$ per MHz-POP',
    th: 'Supply is created by an act of government and by nothing else; when the auction pipeline stops, the secondary market prices the shortage.',
    px: { v: 1.35, asOf: '2026-Q1', p: 'E', c: 0.5, m: 'Implied secondary-market value per MHz-POP for mid-band spectrum.', s: 'Transaction disclosures' },
    base: { v: 0.42, per: '2015-2019 auction average', p: 'R', c: 0.8, m: 'Average clearing price across mid-band auctions in the prior pipeline, when supply was being released regularly.', s: 'FCC auction results' },
    ser: [{ t: '2019', v: 0.45 }, { t: '2021', v: 0.94 }, { t: '2023', v: 1.1 }, { t: '2025', v: 1.28 }, { t: '2026', v: 1.35 }],
    pool: { v: 1.1, p: 'I', c: 0.3, m: '(value − baseline) × MHz-POP transacted annually. Most of the rent is unrealized balance-sheet value rather than cash flow.', s: 'Derived from transaction volumes' },
    gm: { v: 0.6, who: 'Incumbent carriers', p: 'I', c: 0.25, m: 'Spectrum is a balance-sheet asset, so the "margin" is appreciation on holdings rather than an operating margin.', s: 'Carrier disclosures' },
    conc: { top3: 0.8, hhi: 2400, p: 'E', c: 0.7, s: 'Licensed holdings by carrier', sup: [{ n: 'Verizon', sh: 0.3 }, { n: 'AT&T', sh: 0.28 }, { n: 'T-Mobile', sh: 0.22 }] },
    bar: ['permit', 'export', 'physics'],
    ttr: { mo: 48, p: 'E', c: 0.5, m: 'Reallocating a band requires incumbent relocation, an auction, and clearing — four years is fast, and requires auction authority to exist.', s: 'Historical auction timelines' },
    build: 'Several bands are under study for reallocation, but the process depends on legislative auction authority and federal incumbent relocation.',
    solve: [
      'Restore and use auction authority — supply here is purely a policy decision.',
      'Spectrum sharing frameworks that let federal and commercial users coexist instead of relocating.',
      'Densification and higher-order MIMO, which raise capacity per MHz without new spectrum.',
    ],
    kill: [
      'A large auction actually happening, which resets the price directly.',
      'Traffic growth flattening, or offload to fixed and satellite paths.',
    ],
    sub: ['Small-cell densification', 'Unlicensed and shared bands', 'Fixed wireless offload'],
    an: 'MEDALLION2013',
  },
];

/* Reverted signals — rents that resolved. The board exists to find scarcity
   rents; this list exists so nobody mistakes one for a permanent condition.
   Every entry here was, at its peak, as compelling as anything in RENTS.  */
export const ARCHIVE = [
  {
    id: 'DRAM2018',
    n: 'DRAM, 2017–2019',
    cat: 'compute',
    u: '$ per GB',
    peak: { v: 8.6, t: '2018-Q3' },
    trough: { v: 2.4, t: '2019-Q3' },
    why: 'Three suppliers landed capex into the same server-demand pause. Nothing about the concentration changed — only the capacity did.',
    lesson: 'A rent backed by capex lag decays on the capex schedule. Price the calendar, not the shortage.',
    p: 'E', c: 0.6, s: 'DRAM contract price history',
  },
  {
    id: 'FREIGHT2021',
    n: 'Container freight, 2021–2023',
    cat: 'logistics',
    u: '$ per FEU, Asia–US West Coast',
    peak: { v: 20600, t: '2021-Q3' },
    trough: { v: 1400, t: '2023-Q2' },
    why: 'Demand normalized while ordered vessels delivered. The rent was congestion, not capacity, and congestion clears faster than anyone models.',
    lesson: 'Distinguish a congestion rent from a capacity rent. Congestion unwinds in quarters; capacity takes years.',
    p: 'E', c: 0.7, s: 'Container freight rate indices',
  },
  {
    id: 'LITHIUM2022',
    n: 'Lithium carbonate, 2021–2024',
    cat: 'materials',
    u: '$ per tonne',
    peak: { v: 78000, t: '2022-Q4' },
    trough: { v: 10500, t: '2024-Q3' },
    why: 'The price funded a global supply response in under three years — far faster than the consensus ten-year deficit models assumed.',
    lesson: 'High prices are the cure. Deficit models that hold the supply curve fixed are the most reliable way to be wrong.',
    p: 'E', c: 0.7, s: 'Lithium price reporting',
  },
  {
    id: 'NURSES2021',
    n: 'US travel nurses, 2020–2023',
    cat: 'labor',
    u: '$ per hour, contract',
    peak: { v: 145, t: '2022-Q1' },
    trough: { v: 62, t: '2023-Q4' },
    why: 'The pool responded to price within a year — nurses moved into travel contracts — and hospitals cut usage once acuity normalized.',
    lesson: 'Labor rents unwind faster than capital rents when the license already exists and only the location has to change.',
    p: 'E', c: 0.6, s: 'Staffing agency rate reporting',
  },
  {
    id: 'GLP12023',
    n: 'GLP-1 supply, 2022–2025',
    cat: 'pharma',
    u: 'shortage status',
    peak: { v: 1, t: '2023-Q3' },
    trough: { v: 0, t: '2025-Q1' },
    why: 'Manufacturers committed tens of billions to peptide API and fill-finish capacity, and the shortage designation was lifted.',
    lesson: 'When the rent-holder is also the only party who can solve it, and the product is that profitable, capacity arrives fast.',
    p: 'R', c: 0.8, s: 'FDA drug shortage database',
  },
  {
    id: 'SIC2023',
    n: 'Silicon carbide substrates, 2022–2025',
    cat: 'compute',
    u: '$ per 150 mm substrate-equivalent',
    peak: { v: 1500, t: '2022-Q4' },
    trough: { v: 420, t: '2025-Q2' },
    why: 'Every supplier expanded against an EV demand curve that flattened. Substrate capacity tripled into a market that did not.',
    lesson: 'A rent underwritten by one demand forecast dies with that forecast, however sound the supply-side analysis was.',
    p: 'E', c: 0.55, s: 'Substrate price reporting',
  },
  {
    id: 'TTF2022',
    n: 'European natural gas (TTF), 2021–2023',
    cat: 'power',
    u: '€ per MWh',
    peak: { v: 339, t: '2022-Q3' },
    trough: { v: 26, t: '2023-Q2' },
    why: 'LNG cargoes redirected, industrial demand destroyed itself, and a mild winter did the rest — within about nine months.',
    lesson: 'Demand destruction is a supply response. At extreme prices it is usually the fastest one available.',
    p: 'R', c: 0.85, s: 'TTF settlement prices',
  },
  {
    id: 'LCD2021',
    n: 'LCD panels, 2020–2022',
    cat: 'compute',
    u: '$ per 55" panel',
    peak: { v: 230, t: '2021-Q2' },
    trough: { v: 87, t: '2022-Q4' },
    why: 'A pandemic demand pull-forward met fabs that were already scheduled to add capacity. Both sides reversed at once.',
    lesson: 'Beware a rent whose demand shock and supply addition are on the same clock — they cancel, then overshoot.',
    p: 'E', c: 0.6, s: 'Panel price reporting',
  },
  {
    id: 'MEDALLION2013',
    n: 'NYC taxi medallions, 2013–2018',
    cat: 'regulated',
    u: '$ thousands per medallion',
    peak: { v: 1320, t: '2013-Q4' },
    trough: { v: 160, t: '2018-Q2' },
    why: 'The scarce asset was the licence, not the service. A substitute that did not need the licence made the licence nearly worthless.',
    lesson: 'A regulatory rent is only as durable as the regulation. It does not decay — it collapses, and usually without warning.',
    p: 'R', c: 0.85, s: 'NYC TLC transfer records',
  },
];
