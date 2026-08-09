/* Within reach — the small-scale half of the scarcity board.

   The industrial board (src/rents.js) tracks rents nobody can act on alone: a
   fab, an enrichment cascade, a transformer plant. This file tracks the same
   phenomenon at a size a person or a small team can actually enter. The
   economics are identical — price sits far above what supply-responsive cost
   would be, and supply cannot respond — but the barrier is a certification, a
   skill, a piece of kit or an approved-vendor listing rather than $10B of capex.

   The extra thing every entry here has to answer, which the industrial board
   never asks: what would it cost YOU to start, how long until the first
   invoice, and what could one to five people realistically bill in a year.

   Per-entry schema (px/base/ser/pool-style fields mirror rents.js so the same
   provenance machinery renders them):
     id     stable key (deep-link: #view=rents&scale=micro&r=<id>)
     n      technical name
     pn     plain-language name — the board headline
     cat    MCATS key
     u      unit the price is quoted in
     th     one-line thesis
     px     what buyers pay now            {v, p, c, m, s}
     base   what it would cost if supply responded {v, per, p, c, m, s}
     ser    price series [{t, v}]          — the row chart
     mkt    total annual spend on the niche {v ($M/yr), p, c, m, s}
     take   realistic annual billing for 1-5 people {v ($K/yr), p, c, m, s}
     entry  capital to start               {v ($K), p, c, m, s}
     ramp   months to first invoice        {mo, p, c, m, s}
     need   what you actually need, in order of difficulty
     who    who buys it
     bar    MBARS keys, most-binding first
     kill   what would end the premium
     sub    adjacent plays if this one closes

   NOTHING here is a published price. Small-niche work is quoted bilaterally and
   never printed, so every figure is tagged E or I and the board says so. These
   are modelled from job-board rates, tender documents, trade-press ranges and
   accreditation-body registries — good enough to rank, not good enough to
   underwrite. Do your own diligence before spending money.                    */

export const MICRO_ASOF = '2026-08';

/* Category enum for the micro board. */
export const MCATS = {
  electronics: 'Electronics & parts',
  industrial: 'Industrial services',
  lab: 'Lab & measurement',
  regulated: 'Regulated trades',
  digital: 'Digital & language',
  materials: 'Materials & salvage',
};

/* Colours reuse the map's sector palette so the two boards read as one app. */
export const MCAT = {
  electronics: '#5b8cff',
  industrial: '#a78bfa',
  lab: '#3fd68a',
  regulated: '#f472b6',
  digital: '#00d9ff',
  materials: '#ed8f00',
};

/* Why the price stays high at small scale. Deliberately NOT the industrial
   barrier list — at this size the binding constraint is almost never capex. */
export const MBARS = {
  cert: 'Certification or accreditation',
  tacit: 'Tacit skill, learned on the job',
  knowledge: 'Obsolete or undocumented knowledge',
  kit: 'Specialised equipment',
  vendor: 'Approved-vendor listing',
  inventory: 'Hard-to-source inventory',
  liability: 'Insurance and liability exposure',
  scale: 'Too small for incumbents to bother',
};

export const MBARWHY = {
  cert: 'A body has to accredit you, on their timetable. That queue is the moat — it cannot be bought, only waited out.',
  tacit: 'The skill is transferred by working beside someone who has it. No course compresses it, so the pool grows only as fast as apprenticeships.',
  knowledge: 'The people who understood the original design are retiring or gone, and the documentation was never written down.',
  kit: 'One machine stands between you and the work. Used units exist, but they need commissioning and a calibration history.',
  vendor: 'The buyer can only purchase from a list, and getting onto that list takes audits and time rather than a lower price.',
  inventory: 'The value is in holding stock nobody else can find. Sourcing is the business; the margin is the reward for the search.',
  liability: 'If you get it wrong the claim is larger than the job. Insurance prices that in, and it thins the field.',
  scale: 'The contract is too small for a firm with overheads to chase, and too specialised for the buyer to do in-house.',
};

/* Weights for the opportunity score. Different question from the industrial
   board: not "how big is the rent" but "how good is this for a small team".
   Payback carries the most weight — a 12x multiple behind a $400K machine and
   a two-year ramp is not within anyone's reach. */
export const MW = { payback: 0.30, mult: 0.24, ramp: 0.20, take: 0.16, moat: 0.10 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const mMult = (e) => e.px.v / e.base.v;
/* Months of billing to repay the start-up capital. take is $K/yr, entry is $K. */
export const mPayback = (e) => (e.entry.v / e.take.v) * 12;

export function microScore(e) {
  return 100 * (
    MW.payback * clamp01(1 - mPayback(e) / 36) +
    MW.mult * clamp01(Math.log(mMult(e)) / Math.log(8)) +
    MW.ramp * clamp01(1 - e.ramp.mo / 24) +
    MW.take * clamp01(Math.log10(e.take.v + 1) / Math.log10(601)) +
    MW.moat * clamp01(e.bar.length / 4));
}

/* Units bought a year across the whole niche: total spend over unit price.
   mkt is $M/yr, px is dollars per unit. */
export const mVolume = (e) => (e.mkt.v * 1e6) / e.px.v;

export const microFields = (e) => [e.px, e.base, e.mkt, e.take, e.entry, e.ramp];
export const microProv = (e) => {
  const t = microFields(e).map((f) => f.p);
  return t.includes('I') ? 'I' : t.includes('E') ? 'E' : 'R';
};
export const microConf = (e) => {
  const f = microFields(e);
  return f.reduce((a, x) => a + x.c, 0) / f.length;
};

/* Attention. Two dimensions the price series cannot see: how much this is being
   written about, and how much it is being legislated about. Both matter for
   whether a rent persists — press attention pulls in entrants, policy attention
   pulls in subsidy, tariff or mandate.

   These are 0-100 EDITORIAL JUDGEMENTS, reviewed at each snapshot. They are
   deliberately NOT presented as counts: no honest article-count or bill-mention
   tally exists across these categories, and inventing one would dress a guess up
   as a measurement. Tagged I everywhere, and excluded from the rank score for
   the same reason provenance is — an entry should rank on its economics, not on
   how loud it is. */
const ATT_M = 'Editorial judgement on a 0-100 scale, not a measured count. No consistent article or bill-mention tally spans these categories, so this is a reviewed opinion about salience and is tagged Inferred throughout.';
const att = (media, policy) => ({ media, policy, p: 'I', c: 0.25, m: ATT_M, s: 'Editorial judgement, reviewed at each snapshot' });

export const MICRO = [
  {
    id: 'LEGACYIC',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Rochester Electronics" }, { n: "Lansdale Semiconductor" }, { n: "Independent brokers and stockists" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Medical device manufacturers" }, { n: "Industrial automation OEMs" }, { n: "Defence sustainment primes" }] },
    att: att(28, 30),
    n: 'End-of-life and obsolete semiconductor parts',
    pn: 'Chips nobody makes any more',
    cat: 'electronics',
    u: '$ per unit, obsolete part',
    th: 'A $3 part that went end-of-life still sits in a design that ships for another decade, and the buyer has no legal way to redesign quickly.',
    px: { v: 42, p: 'E', c: 0.5, m: 'Median broker ask across obsolete logic and analog lines, weighted toward industrial and medical grades where redesign needs recertification.', s: 'Broker listing aggregates; distributor obsolescence notices' },
    base: { v: 3.5, per: 'last active catalogue price', p: 'E', c: 0.55, m: 'Final published distributor price before the end-of-life notice — what the same part cost while a fab still ran it.', s: 'Archived distributor catalogues' },
    ser: [{ t: '2022', v: 9 }, { t: '2023', v: 17 }, { t: '2024', v: 28 }, { t: '2025', v: 38 }, { t: '2026', v: 42 }],
    mkt: { v: 2400, p: 'I', c: 0.3, m: 'Independent-distribution revenue attributable to obsolete and allocated parts. The category is not reported separately anywhere; this is a share estimate.', s: 'Independent distribution trade estimates' },
    take: { v: 180, p: 'I', c: 0.35, m: 'One or two people running sourcing and incoming test, turning inventory three to four times a year on a modest float.', s: 'Modelled from typical broker gross margin' },
    entry: { v: 35, p: 'E', c: 0.5, m: 'Working capital for first inventory, a decapsulation-free authenticity screen (X-ray plus electrical), and ESD-safe storage.', s: 'Used test equipment listings' },
    ramp: { mo: 4, p: 'E', c: 0.45, m: 'Time to first resale once sourcing channels and a counterfeit-screening routine are in place.', s: 'Modelled' },
    need: [
      'Patience for sourcing — the business is finding stock, not selling it.',
      'A counterfeit screen you trust. Selling a re-marked part into a medical or aerospace build ends the business, not just the order.',
      'Working capital you can leave parked in inventory for two or three quarters.',
    ],
    who: ['Industrial equipment makers with long-life SKUs', 'Medical device manufacturers facing recertification costs', 'Defence sustainment programmes'],
    bar: ['inventory', 'knowledge', 'liability'],
    kill: [
      'A buyer finally funding the redesign — one engineering cycle removes the part from the bill of materials forever.',
      'Authorised remanufacture: some fabs now re-run legacy geometries under licence, which collapses the ask overnight for that line.',
    ],
    sub: ['Authorised aftermarket remanufacture', 'Drop-in replacement modules', 'FPGA emulation of discontinued logic'],
  },
  {
    id: 'CALIB',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Trescal" }, { n: "Transcat" }, { n: "Instrument makers' own service arms" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Contract manufacturers under ISO 9001" }, { n: "Pharma and medical device QC labs" }, { n: "Utilities and energy metering" }] },
    att: att(12, 20),
    n: 'ISO 17025 accredited instrument calibration',
    pn: 'Calibrating other people’s instruments',
    cat: 'lab',
    u: '$ per instrument, accredited calibration',
    th: 'Accreditation is a queue, not a purchase — the backlog at established labs is the whole opportunity, and every regulated buyer needs the certificate annually.',
    px: { v: 380, p: 'E', c: 0.5, m: 'Blended per-instrument accredited rate across pressure, temperature and electrical, excluding on-site surcharges.', s: 'Published lab rate cards; procurement tenders' },
    base: { v: 140, p: 'E', c: 0.5, m: 'Cost-plus rate for the same work in a lab with spare capacity and a paid-off standards set.', s: 'Modelled from labour and standards amortisation' },
    ser: [{ t: '2022', v: 210 }, { t: '2023', v: 245 }, { t: '2024', v: 300 }, { t: '2025', v: 350 }, { t: '2026', v: 380 }],
    mkt: { v: 6800, p: 'I', c: 0.35, m: 'Third-party calibration spend across manufacturing, pharma and energy. Split between accredited and non-accredited work is estimated.', s: 'Testing-services market estimates' },
    take: { v: 220, p: 'I', c: 0.35, m: 'Two people running a bench through roughly 1,100 instruments a year once the accreditation scope is live.', s: 'Modelled from throughput per bench' },
    entry: { v: 120, p: 'E', c: 0.5, m: 'Reference standards with traceable history, a controlled environment, and the accreditation assessment itself.', s: 'Accreditation body fee schedules; standards pricing' },
    ramp: { mo: 14, p: 'E', c: 0.5, m: 'Document the quality system, run the scope, then wait for the assessment. The wait is the barrier and it cannot be shortened with money.', s: 'Accreditation body published timelines' },
    need: [
      'A quality system you actually run, not a binder. The assessor audits practice.',
      'Traceable standards with unbroken calibration history — buying used without the paperwork is buying scrap.',
      'The willingness to spend a year earning revenue from nothing.',
    ],
    who: ['Contract manufacturers under ISO 9001', 'Pharma and medical device QC labs', 'Utilities and energy metering'],
    bar: ['cert', 'kit', 'liability', 'scale'],
    kill: [
      'Accreditation bodies clearing their assessment backlog, which turns a 14-month queue into a 4-month one.',
      'Instrument makers bundling lifetime calibration into the purchase price, which removes the third-party job entirely.',
    ],
    sub: ['Non-accredited in-house calibration support', 'On-site calibration for immovable process instruments', 'Measurement-system analysis consulting'],
  },
  {
    id: 'ELEVPART',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Independent board-repair shops" }, { n: "Otis and TK Elevator service arms" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Building managers with pre-2005 installations" }, { n: "Independent lift service companies" }, { n: "Hospital and social-housing estates" }] },
    att: att(10, 18),
    n: 'Control boards for discontinued elevator models',
    pn: 'Spare parts for lifts nobody supports',
    cat: 'electronics',
    u: '$ per control board',
    th: 'A building cannot replace a lift for a failed board, the maker discontinued support two decades ago, and the schematic was never published.',
    px: { v: 2800, p: 'I', c: 0.35, m: 'Typical independent quote for a repaired or reverse-engineered board on a discontinued controller, including exchange.', s: 'Independent service company quotes' },
    base: { v: 380, p: 'I', c: 0.35, m: 'Build cost of an equivalent board with published documentation and available parts.', s: 'Modelled from component and assembly cost' },
    ser: [{ t: '2022', v: 1300 }, { t: '2023', v: 1700 }, { t: '2024', v: 2100 }, { t: '2025', v: 2500 }, { t: '2026', v: 2800 }],
    mkt: { v: 900, p: 'I', c: 0.25, m: 'Independent lift-repair spend on obsolete control electronics. No trade body publishes this; the figure is a rough share of total independent maintenance revenue.', s: 'Modelled from lift maintenance market' },
    take: { v: 320, p: 'I', c: 0.3, m: 'One experienced technician plus a part-time assistant, repairing and exchanging roughly ten boards a month.', s: 'Modelled from throughput' },
    entry: { v: 55, p: 'E', c: 0.45, m: 'Rework station, a curve tracer, a modest donor-board stock, and liability cover appropriate to lifting equipment.', s: 'Used equipment listings; insurance quotes' },
    ramp: { mo: 7, p: 'I', c: 0.35, m: 'Time to reverse-engineer a first family of boards and get onto building managers’ call lists.', s: 'Modelled' },
    need: [
      'Board-level diagnostic skill on undocumented hardware — this is the actual scarce thing.',
      'Liability cover. Lifts carry people, and the claim exposure is what keeps hobbyists out.',
      'A donor stock of scrapped controllers, which is where the sourcing edge lives.',
    ],
    who: ['Building managers with pre-2005 lift installations', 'Independent lift service companies', 'Social housing and hospital estates'],
    bar: ['knowledge', 'liability', 'tacit', 'inventory'],
    kill: [
      'A modernisation grant cycle: replace the controller and the board is worthless, and public buildings replace in waves.',
      'An open-source drop-in controller reaching safety certification for common discontinued models.',
    ],
    sub: ['Full controller modernisation retrofits', 'Obsolete industrial drive repair', 'Legacy building-management system support'],
  },
  {
    id: 'COBOL',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ id: 'IBM' }, { id: 'TCS' }, { id: 'INFY' }, { n: "Independent contractors" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Retail and clearing banks" }, { n: "Insurers with legacy policy systems" }, { n: "Tax and benefits agencies" }] },
    att: att(55, 40),
    n: 'Mainframe and COBOL maintenance contracting',
    pn: 'Maintaining code older than most developers',
    cat: 'digital',
    u: '$ per hour, contract',
    th: 'The systems still clear the payments, the people who wrote them are retiring faster than replacements arrive, and rewriting is a decade-long board-level risk.',
    px: { v: 185, p: 'E', c: 0.5, m: 'Median contract rate for experienced COBOL and JCL work at financial and government institutions.', s: 'Contract job-board rate aggregates' },
    base: { v: 70, p: 'E', c: 0.5, m: 'General enterprise back-end contract rate at equivalent seniority where the talent pool is not shrinking.', s: 'Contract rate aggregates' },
    ser: [{ t: '2022', v: 110 }, { t: '2023', v: 128 }, { t: '2024', v: 150 }, { t: '2025', v: 172 }, { t: '2026', v: 185 }],
    mkt: { v: 5200, p: 'I', c: 0.3, m: 'Global spend on mainframe application maintenance contracting. Vendors do not break this out; estimated from installed base and staffing ratios.', s: 'Modelled from mainframe installed base' },
    take: { v: 250, p: 'E', c: 0.45, m: 'One contractor at roughly 1,400 billable hours, allowing for the security clearance gaps between engagements.', s: 'Modelled from rate and utilisation' },
    entry: { v: 2, p: 'E', c: 0.55, m: 'A mainframe development sandbox subscription and time. Effectively the lowest entry cost on this board.', s: 'Published emulator and cloud mainframe pricing' },
    ramp: { mo: 2, p: 'E', c: 0.45, m: 'For someone who already has the skill. Acquiring the skill from scratch is a different and much longer project.', s: 'Modelled' },
    need: [
      'The actual language and, more importantly, the operational conventions around it — JCL, batch windows, and how a change gets promoted.',
      'Tolerance for institutions that move slowly and audit everything.',
      'In many engagements, a security clearance or the ability to pass one.',
    ],
    who: ['Retail and clearing banks', 'Insurers with legacy policy systems', 'Government tax and benefits agencies'],
    bar: ['tacit', 'knowledge', 'scale'],
    kill: [
      'A migration wave that actually completes. Most stall, but the ones that finish remove their demand permanently.',
      'Code-translation tooling getting good enough that a general developer can supervise it without knowing the platform.',
    ],
    sub: ['Legacy AS/400 and RPG work', 'Mainframe migration assurance and testing', 'Batch-window performance tuning'],
  },
  {
    id: 'AS9100',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Regional AS9100 job shops" }, { n: "Prime in-house machining" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Tier-one aerostructure suppliers" }, { id: 'BA' }, { id: 'AIR' }, { n: "Business aviation MRO" }] },
    att: att(22, 35),
    n: 'Small-batch aerospace-qualified machining',
    pn: 'Machining parts for aircraft in small runs',
    cat: 'industrial',
    u: '$ per part, qualified small batch',
    th: 'Primes need forty parts, not forty thousand, and the approved-vendor list is short because qualification costs more than the work is worth to a large shop.',
    px: { v: 240, p: 'E', c: 0.45, m: 'Representative unit price on qualified small-lot machined components, medium complexity, first-article included over the batch.', s: 'Tender documents; supplier quotes' },
    base: { v: 85, p: 'E', c: 0.5, m: 'Same geometry from a general commercial shop without the qualification and paperwork burden.', s: 'Commercial machining quote comparisons' },
    ser: [{ t: '2022', v: 130 }, { t: '2023', v: 155 }, { t: '2024', v: 190 }, { t: '2025', v: 220 }, { t: '2026', v: 240 }],
    mkt: { v: 3100, p: 'I', c: 0.3, m: 'Small-lot qualified machining spend across aerospace and defence supply chains. Estimated from programme spares budgets.', s: 'Modelled from sustainment budgets' },
    take: { v: 400, p: 'I', c: 0.35, m: 'A two- or three-person shop running one modern machining centre at high utilisation on qualified work.', s: 'Modelled from machine hours' },
    entry: { v: 260, p: 'E', c: 0.5, m: 'A used but capable machining centre, metrology to prove conformance, and the AS9100 certification process itself.', s: 'Used machine tool listings; certification body fees' },
    ramp: { mo: 12, p: 'E', c: 0.45, m: 'Certification plus first-article approval with a first customer. Both must happen before meaningful revenue.', s: 'Certification body timelines' },
    need: [
      'AS9100 certification and the discipline to keep records the way it demands.',
      'Metrology good enough to prove conformance, not just achieve it.',
      'One prime or tier-one willing to sponsor you through first-article approval.',
    ],
    who: ['Tier-one aerostructure suppliers', 'Defence sustainment programmes', 'Business aviation MRO'],
    bar: ['cert', 'vendor', 'kit', 'scale'],
    kill: [
      'Additive manufacturing reaching qualification for the same part families, which removes the batch-size penalty entirely.',
      'A prime consolidating its approved-vendor list and buying the batch volume it does not need to reduce supplier count.',
    ],
    sub: ['Tooling and fixture manufacture', 'Qualified inspection and first-article services', 'Legacy part reverse-engineering for sustainment'],
  },
  {
    id: 'CLINCOUR',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "World Courier (Cencora)" }, { n: "Marken (UPS)" }, { n: "Regional validated couriers" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Contract research organisations" }, { id: 'TMO' }, { n: "Hospital trial sites and biobanks" }, { n: "Small biotechs" }] },
    att: att(18, 25),
    n: 'Clinical trial sample cold-chain courier',
    pn: 'Moving trial samples that must stay cold',
    cat: 'regulated',
    u: '$ per validated shipment',
    th: 'A sample that breaches temperature is an unusable data point in a trial that costs millions a day, so the buyer is not shopping on price.',
    px: { v: 410, p: 'E', c: 0.45, m: 'Typical validated same-country clinical shipment with continuous monitoring and documented chain of custody.', s: 'Logistics tender documents' },
    base: { v: 95, p: 'E', c: 0.5, m: 'Equivalent expedited courier movement without validation, monitoring or the documentation package.', s: 'Published courier tariffs' },
    ser: [{ t: '2022', v: 240 }, { t: '2023', v: 285 }, { t: '2024', v: 340 }, { t: '2025', v: 385 }, { t: '2026', v: 410 }],
    mkt: { v: 4300, p: 'I', c: 0.3, m: 'Clinical logistics spend attributable to temperature-controlled sample movement. Estimated from trial volumes.', s: 'Modelled from clinical trial activity' },
    take: { v: 260, p: 'I', c: 0.35, m: 'A two- or three-person operation covering one metropolitan region and its trial sites.', s: 'Modelled from shipment volume' },
    entry: { v: 45, p: 'E', c: 0.5, m: 'Validated shippers, calibrated data loggers, a vehicle, and the qualification documentation package.', s: 'Equipment pricing; validation consultancy rates' },
    ramp: { mo: 5, p: 'E', c: 0.45, m: 'Qualification with a first sponsor or contract research organisation, which is the gate to everything after.', s: 'Modelled' },
    need: [
      'Validation documentation that survives an audit — the paperwork is the product.',
      'Genuine 24-hour responsiveness. Trial sites do not schedule around your week.',
      'A first sponsor willing to qualify a new courier, which is the hardest part.',
    ],
    who: ['Contract research organisations', 'Hospital trial sites and biobanks', 'Small biotechs running their own studies'],
    bar: ['cert', 'liability', 'vendor', 'scale'],
    kill: [
      'The large clinical logistics networks pushing into secondary regions and pricing to fill trucks.',
      'Decentralised trial designs that ship kits to patients and cut the site-to-lab leg out.',
    ],
    sub: ['Biobank sample transfers', 'Cell and gene therapy chain-of-identity courier work', 'Diagnostic lab overflow logistics'],
  },
  {
    id: 'RARELANG',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Appen" }, { n: "TransPerfect" }, { n: "In-country annotator cooperatives" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Model developers filling coverage gaps" }, { n: "Government and NGO translation programmes" }, { n: "Speech and OCR vendors" }] },
    att: att(48, 30),
    n: 'Low-resource language annotation and localisation',
    pn: 'Annotating languages the big datasets skipped',
    cat: 'digital',
    u: '$ per word, annotated',
    th: 'Model builders exhausted the well-covered languages, and the remaining ones have small fluent populations with almost no annotation workforce.',
    px: { v: 0.42, p: 'E', c: 0.45, m: 'Blended per-word rate for annotation and quality review in languages outside the top forty by corpus size.', s: 'Vendor rate cards; freelance marketplace data' },
    base: { v: 0.09, p: 'E', c: 0.5, m: 'Equivalent per-word rate in a well-covered language with deep annotator supply.', s: 'Marketplace rate aggregates' },
    ser: [{ t: '2022', v: 0.12 }, { t: '2023', v: 0.19 }, { t: '2024', v: 0.29 }, { t: '2025', v: 0.38 }, { t: '2026', v: 0.42 }],
    mkt: { v: 1800, p: 'I', c: 0.25, m: 'Data annotation spend attributable to low-resource languages. Buyers treat this as confidential; the figure is a modelled share.', s: 'Modelled from annotation market estimates' },
    take: { v: 150, p: 'I', c: 0.35, m: 'A coordinator plus a small vetted annotator pool, taking a margin on managed throughput rather than billing personally.', s: 'Modelled from managed-pool economics' },
    entry: { v: 6, p: 'E', c: 0.5, m: 'Tooling subscriptions, a payments rail that reaches your annotators, and the cost of recruiting and testing the first pool.', s: 'Published tooling pricing' },
    ramp: { mo: 2, p: 'E', c: 0.45, m: 'Fast by the standards of this board — the constraint is finding annotators, not qualifying yourself.', s: 'Modelled' },
    need: [
      'Genuine access to a fluent community. This is a relationship business wearing a data-work costume.',
      'A quality process buyers can inspect — inter-annotator agreement, not vibes.',
      'A way to pay people reliably in the country where they live.',
    ],
    who: ['Model developers filling coverage gaps', 'Government and NGO translation programmes', 'Speech and OCR vendors entering new markets'],
    bar: ['tacit', 'scale', 'vendor'],
    kill: [
      'Synthetic data and cross-lingual transfer reaching adequate quality without native annotation, which is the direction of travel.',
      'One buyer funding a permanent in-country team and taking the work in-house.',
    ],
    sub: ['Speech collection in the same languages', 'Evaluation and red-teaming in-language', 'Terminology and glossary maintenance'],
  },
  {
    id: 'FAILANA',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Eurofins EAG Laboratories" }, { n: "SGS" }, { n: "Independent analysis labs" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Medical device and automotive quality teams" }, { n: "Insurers and litigators" }, { n: "Fabless companies without in-house labs" }] },
    att: att(20, 22),
    n: 'Semiconductor failure analysis lab time',
    pn: 'Finding out why a chip failed',
    cat: 'lab',
    u: '$ per sample, full analysis',
    th: 'Every field failure in a regulated product needs a root cause on paper, and the labs that can decapsulate and image a modern package are booked out.',
    px: { v: 1400, p: 'E', c: 0.45, m: 'Typical full-workflow price: decapsulation, electrical fault isolation, imaging and a written root-cause report.', s: 'Independent lab rate cards' },
    base: { v: 420, p: 'E', c: 0.45, m: 'Marginal cost of the same workflow on a paid-off tool set with an unbooked queue.', s: 'Modelled from tool time and labour' },
    ser: [{ t: '2022', v: 700 }, { t: '2023', v: 850 }, { t: '2024', v: 1050 }, { t: '2025', v: 1280 }, { t: '2026', v: 1400 }],
    mkt: { v: 1500, p: 'I', c: 0.25, m: 'Third-party failure analysis spend. Almost entirely bilateral; estimated from lab counts and typical throughput.', s: 'Modelled from independent lab capacity' },
    take: { v: 300, p: 'I', c: 0.3, m: 'One analyst plus a part-time technician working roughly 250 samples a year at mixed complexity.', s: 'Modelled from throughput' },
    entry: { v: 180, p: 'E', c: 0.45, m: 'A used scanning electron microscope with a service history, a decapsulation setup, and curve-tracing electronics.', s: 'Used scientific instrument listings' },
    ramp: { mo: 9, p: 'E', c: 0.4, m: 'Commissioning a used SEM and building a reference workflow before the first paid report goes out.', s: 'Modelled' },
    need: [
      'The analytical instinct to know which technique to reach for. The tools are buyable; the sequencing is not.',
      'A used SEM with a credible service history — this is where the money goes and where it gets lost.',
      'Report writing a customer’s quality department will accept as evidence.',
    ],
    who: ['Medical device and automotive quality teams', 'Insurers and litigators in product disputes', 'Fabless companies without in-house labs'],
    bar: ['kit', 'tacit', 'scale'],
    kill: [
      'Tool vendors bundling analysis with supply agreements, which absorbs the independent job.',
      'A wave of second-hand instruments hitting the market at once and pulling entry cost — and therefore price — down together.',
    ],
    sub: ['Materials analysis for non-semiconductor clients', 'Counterfeit component screening', 'Reliability and qualification testing'],
  },
  {
    id: 'SEMIREFURB',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Independent refurbishers" }, { n: "Original tool vendors' refurb programmes" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Mature-node and specialty fabs" }, { n: "Equipment resellers and asset managers" }, { n: "Research and pilot lines" }] },
    att: att(26, 34),
    n: 'Semiconductor tool subsystem refurbishment',
    pn: 'Rebuilding parts for chip-making machines',
    cat: 'industrial',
    u: '$ per refurbished module',
    th: 'Fabs run tools long past vendor support, a stopped tool costs six figures a day, and the vendor would rather sell a new machine than a rebuilt module.',
    px: { v: 14000, p: 'I', c: 0.35, m: 'Representative exchange price on a refurbished subsystem for a mature-node tool, warranty included.', s: 'Independent refurbisher quotes' },
    base: { v: 3200, p: 'I', c: 0.35, m: 'Materials, labour and test to rebuild the same module where documentation and spares are freely available.', s: 'Modelled from rebuild cost' },
    ser: [{ t: '2022', v: 6500 }, { t: '2023', v: 8200 }, { t: '2024', v: 10500 }, { t: '2025', v: 12800 }, { t: '2026', v: 14000 }],
    mkt: { v: 2800, p: 'I', c: 0.25, m: 'Independent refurbishment and spares revenue on out-of-support semiconductor equipment. Not separately reported anywhere.', s: 'Modelled from installed tool base' },
    take: { v: 450, p: 'I', c: 0.3, m: 'A three-person shop rebuilding roughly forty modules a year with a genuine warranty behind them.', s: 'Modelled from throughput' },
    entry: { v: 150, p: 'E', c: 0.4, m: 'Clean workspace, vacuum and leak test capability, and a donor-tool purchase to learn on and harvest from.', s: 'Used equipment listings' },
    ramp: { mo: 10, p: 'I', c: 0.35, m: 'Learning a module family well enough to warrant it, then getting a fab to trust a new supplier with a tool it depends on.', s: 'Modelled' },
    need: [
      'A donor tool. You cannot learn this from documents, and the documents do not exist.',
      'The nerve to offer a real warranty — that is what separates you from a parts reseller.',
      'One fab maintenance manager who will take a first chance on you.',
    ],
    who: ['Mature-node and specialty fabs', 'Equipment resellers and asset managers', 'Research and pilot lines'],
    bar: ['knowledge', 'kit', 'vendor', 'inventory'],
    kill: [
      'The original vendor reopening support for mature platforms, which they periodically do when new-tool demand softens.',
      'A fab retiring the tool generation entirely, which removes a whole module family from demand at once.',
    ],
    sub: ['Vacuum component rebuild for other industries', 'Tool relocation and requalification', 'Spare-part harvesting and brokerage'],
  },
  {
    id: 'GASCYL',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Regional requalification shops" }, { n: "Distributor in-house test bays" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Industrial gas distributors" }, { n: "Fire equipment servicing companies" }, { n: "Beverage and hospitality gas suppliers" }] },
    att: att(8, 24),
    n: 'Compressed gas cylinder requalification',
    pn: 'Recertifying gas cylinders',
    cat: 'regulated',
    u: '$ per cylinder, requalified',
    th: 'Every cylinder in circulation must be retested on a legal clock, the test sites are thinning out, and a cylinder cannot legally be filled without the stamp.',
    px: { v: 38, p: 'E', c: 0.5, m: 'Per-cylinder hydrostatic requalification including visual inspection and valve service, industrial sizes.', s: 'Published requalifier rate cards' },
    base: { v: 14, p: 'E', c: 0.5, m: 'Marginal cost of the same test at a facility running near capacity with equipment long since paid off.', s: 'Modelled from throughput economics' },
    ser: [{ t: '2022', v: 22 }, { t: '2023', v: 25 }, { t: '2024', v: 30 }, { t: '2025', v: 35 }, { t: '2026', v: 38 }],
    mkt: { v: 1100, p: 'I', c: 0.3, m: 'Requalification spend across industrial, medical and beverage gas fleets. Estimated from cylinder populations and test intervals.', s: 'Modelled from cylinder fleet size' },
    take: { v: 210, p: 'I', c: 0.35, m: 'Two people running a test bay through roughly 7,000 cylinders a year, mixed sizes.', s: 'Modelled from bay throughput' },
    entry: { v: 95, p: 'E', c: 0.45, m: 'Hydrostatic test jacket and pump, valve tooling, premises with the right drainage, and the regulatory registration.', s: 'Equipment pricing; registration fees' },
    ramp: { mo: 8, p: 'E', c: 0.45, m: 'Facility fit-out and inspection before the registration to stamp cylinders is granted.', s: 'Regulator published process' },
    need: [
      'Premises that meet the physical requirements — this is the constraint that stops most people, not the skill.',
      'Regulatory registration, without which the work is not merely unqualified but illegal.',
      'A relationship with gas distributors, who own the fleets and decide where they go.',
    ],
    who: ['Industrial gas distributors', 'Fire equipment servicing companies', 'Beverage and hospitality gas suppliers'],
    bar: ['cert', 'kit', 'liability', 'scale'],
    kill: [
      'Composite cylinders with longer or lifetime test intervals displacing steel fleets as they age out.',
      'A distributor consolidating testing in-house once regional volume justifies its own bay.',
    ],
    sub: ['Fire extinguisher servicing', 'Valve refurbishment', 'Cylinder refinishing and remarking'],
  },
  {
    id: 'HERITAGE',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Reclamation yards" }, { n: "Demolition contractors selling direct" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Conservation architects and their contractors" }, { n: "Listed-property owners" }, { n: "Film and heritage set builders" }] },
    att: att(24, 38),
    n: 'Reclaimed heritage building materials',
    pn: 'Salvaged materials for listed buildings',
    cat: 'materials',
    u: '$ per unit, matched reclaim',
    th: 'A conservation consent can require materials that are no longer manufactured, so the only lawful supply is what came off another building of the same period.',
    px: { v: 2.9, p: 'E', c: 0.45, m: 'Per-unit price for matched period brick and equivalent reclaimed units at conservation-grade consistency.', s: 'Reclamation yard price lists' },
    base: { v: 0.55, p: 'E', c: 0.5, m: 'Modern equivalent unit of comparable dimension and performance, newly manufactured.', s: 'Builders merchant pricing' },
    ser: [{ t: '2022', v: 1.4 }, { t: '2023', v: 1.8 }, { t: '2024', v: 2.2 }, { t: '2025', v: 2.7 }, { t: '2026', v: 2.9 }],
    mkt: { v: 1600, p: 'I', c: 0.25, m: 'Reclaimed and conservation-grade material spend on heritage and listed-property work. Highly fragmented and unreported.', s: 'Modelled from conservation construction spend' },
    take: { v: 240, p: 'I', c: 0.3, m: 'Two people running sourcing, cleaning and sorting with a yard, turning stock two to three times a year.', s: 'Modelled from yard economics' },
    entry: { v: 70, p: 'E', c: 0.45, m: 'Yard space with access, a telehandler, transport, and the first stock purchase from a demolition.', s: 'Plant hire and land rental rates' },
    ramp: { mo: 6, p: 'E', c: 0.4, m: 'Time to secure a first demolition supply relationship and get onto conservation architects’ lists.', s: 'Modelled' },
    need: [
      'The eye to match period, colour and weathering. Buyers reject on appearance and there is no spec sheet.',
      'Demolition contacts, which are the whole supply side of this business.',
      'Somewhere to put it. Stock is bulky and slow, and the yard is the real capital cost.',
    ],
    who: ['Conservation architects and their contractors', 'Listed-property owners under consent conditions', 'Film and heritage set builders'],
    bar: ['inventory', 'tacit', 'scale'],
    kill: [
      'Convincing manufactured replicas gaining conservation-officer acceptance, which is slowly happening in some regions.',
      'A demolition boom flooding the reclaim market and collapsing the scarcity that holds the price up.',
    ],
    sub: ['Architectural salvage of fittings and ironmongery', 'Lime mortar and traditional finishes supply', 'Deconstruction contracting'],
  },
  {
    id: 'WIREHARN',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Regional harness shops" }, { n: "Prime in-house assembly" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ id: 'LMT' }, { id: 'RTX' }, { n: "Rail and heavy vehicle builders" }] },
    att: att(14, 32),
    n: 'Low-volume defence wire harness assembly',
    pn: 'Hand-building cable looms to spec',
    cat: 'industrial',
    u: '$ per harness, qualified',
    th: 'Harnesses are hand-built, unautomatable at low volume, and the qualification burden means primes will pay several times commercial rates for a compliant supplier.',
    px: { v: 620, p: 'E', c: 0.45, m: 'Representative price for a qualified medium-complexity harness with full material traceability.', s: 'Tender documents; supplier quotes' },
    base: { v: 210, p: 'E', c: 0.5, m: 'Same harness built commercially without traceability, workmanship certification or documentation.', s: 'Commercial assembly quotes' },
    ser: [{ t: '2022', v: 330 }, { t: '2023', v: 390 }, { t: '2024', v: 480 }, { t: '2025', v: 570 }, { t: '2026', v: 620 }],
    mkt: { v: 2200, p: 'I', c: 0.28, m: 'Low-volume qualified harness spend across defence and aerospace programmes. Estimated from platform counts.', s: 'Modelled from programme spend' },
    take: { v: 280, p: 'I', c: 0.32, m: 'Three or four assemblers with one certified inspector, at typical build hours per harness.', s: 'Modelled from labour hours' },
    entry: { v: 40, p: 'E', c: 0.5, m: 'Crimp tooling with calibration, a build board setup, workmanship certification for staff, and ESD control.', s: 'Tooling pricing; certification course fees' },
    ramp: { mo: 10, p: 'E', c: 0.45, m: 'Workmanship certification, then first-article approval with a prime. The certification is quick; the approval is not.', s: 'Modelled' },
    need: [
      'Certified workmanship standards on staff, which is a course and an exam rather than a career.',
      'Material traceability discipline — every wire and contact tracked to a lot.',
      'A prime willing to onboard a new supplier, which is the actual gate.',
    ],
    who: ['Defence primes and tier-ones', 'Rail and heavy vehicle builders', 'Test rig and ground support equipment makers'],
    bar: ['vendor', 'cert', 'tacit', 'scale'],
    kill: [
      'Automated cut-and-crimp reaching economic viability at low volume, which has been ten years away for thirty years.',
      'A prime moving harness work to a lower-cost country as a programme matures out of prototype.',
    ],
    sub: ['Test cable and rig harness work', 'Rework and repair of installed looms', 'Connector potting and environmental sealing'],
  },
  {
    id: 'ANALOGIC',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Independent design contractors" }, { n: "Design-services firms" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Fabless startups without an analog team" }, { id: 'TXN' }, { n: "Design-services houses subcontracting overflow" }] },
    att: att(34, 26),
    n: 'Analog and mixed-signal IC design contracting',
    pn: 'Designing the analog parts of chips',
    cat: 'electronics',
    u: '$ per hour, contract',
    th: 'Analog design resists automation and is learned over years beside someone who can already do it, so the supply of capable people grows very slowly.',
    px: { v: 215, p: 'E', c: 0.5, m: 'Median contract rate for experienced analog and mixed-signal design work at established process nodes.', s: 'Contract rate aggregates; recruiter data' },
    base: { v: 95, p: 'E', c: 0.5, m: 'Digital design contract rate at equivalent seniority, where tooling automates far more of the work.', s: 'Contract rate aggregates' },
    ser: [{ t: '2022', v: 140 }, { t: '2023', v: 160 }, { t: '2024', v: 185 }, { t: '2025', v: 205 }, { t: '2026', v: 215 }],
    mkt: { v: 3400, p: 'I', c: 0.3, m: 'Contract and design-services spend on analog and mixed-signal blocks. Estimated from design-services revenue splits.', s: 'Modelled from design services market' },
    take: { v: 330, p: 'E', c: 0.42, m: 'One contractor at roughly 1,550 billable hours, allowing for gaps between tape-out cycles.', s: 'Modelled from rate and utilisation' },
    entry: { v: 18, p: 'E', c: 0.45, m: 'Tool access and process design kit arrangements, usually through the client rather than bought outright.', s: 'EDA and foundry programme pricing' },
    ramp: { mo: 3, p: 'E', c: 0.45, m: 'For someone who already has tape-outs behind them. Without that record, this niche is closed rather than slow.', s: 'Modelled' },
    need: [
      'Silicon that worked. A portfolio of shipped parts is the entire credential here.',
      'Tool and PDK access, which almost always comes through the client’s licences.',
      'Comfort with the fact that a mistake costs a mask set, and everyone knows it.',
    ],
    who: ['Fabless startups without an analog team', 'Industrial and automotive semiconductor firms', 'Design-services houses subcontracting overflow'],
    bar: ['tacit', 'scale'],
    kill: [
      'Analog synthesis tooling finally working, which would be the largest change in this field in decades.',
      'A hiring downturn at the fabless firms that generate the overflow, which arrives with every cycle.',
    ],
    sub: ['Layout and physical verification contracting', 'Silicon bring-up and characterisation', 'Failure and yield debug support'],
  },
  {
    id: 'NDT',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Applus+" }, { n: "Mistras Group" }, { n: "Bureau Veritas" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Refineries and petrochemical plants" }, { n: "Power generators during outage windows" }, { n: "Pipeline operators" }] },
    att: att(16, 30),
    n: 'Certified non-destructive testing inspection',
    pn: 'Inspecting welds without cutting them open',
    cat: 'regulated',
    u: '$ per hour, certified inspection',
    th: 'Certification takes years of logged hours, the existing inspectors are ageing out, and no plant, pipeline or pressure vessel restarts without a signature.',
    px: { v: 155, p: 'E', c: 0.5, m: 'Blended certified inspector rate across ultrasonic and radiographic methods, excluding outage premium rates.', s: 'Service company rate cards; tender documents' },
    base: { v: 62, p: 'E', c: 0.5, m: 'General industrial inspection labour at equivalent seniority without method certification.', s: 'Industrial labour rate aggregates' },
    ser: [{ t: '2022', v: 92 }, { t: '2023', v: 105 }, { t: '2024', v: 125 }, { t: '2025', v: 145 }, { t: '2026', v: 155 }],
    mkt: { v: 5900, p: 'I', c: 0.3, m: 'Third-party NDT services spend across energy, power and heavy industry. Estimated from asset base and inspection intervals.', s: 'Modelled from inspection service market' },
    take: { v: 230, p: 'E', c: 0.42, m: 'One certified inspector working outage seasons hard and shoulder periods lightly.', s: 'Modelled from utilisation' },
    entry: { v: 48, p: 'E', c: 0.45, m: 'Method certifications, an ultrasonic flaw detector with probes, radiation monitoring where applicable, and liability cover.', s: 'Certification body fees; instrument pricing' },
    ramp: { mo: 16, p: 'E', c: 0.5, m: 'Logged experience hours are a requirement, not a formality. This is the longest ramp on the board and cannot be bought.', s: 'Certification scheme requirements' },
    need: [
      'Certified hours under supervision before you can sign anything yourself.',
      'The willingness to work outages, which is when the demand actually exists.',
      'Liability cover, because a missed indication is a catastrophic claim.',
    ],
    who: ['Refineries and petrochemical plants', 'Power generation during outage windows', 'Pipeline operators and pressure vessel owners'],
    bar: ['cert', 'liability', 'tacit', 'kit'],
    kill: [
      'Automated and robotic inspection covering routine geometries, which is advancing steadily on straightforward welds.',
      'A capital-spending downturn thinning outage schedules, which cuts demand faster than supply can leave.',
    ],
    sub: ['Rope-access inspection', 'Corrosion-under-insulation surveys', 'Welding procedure qualification support'],
  },
  {
    id: 'DRONESURV',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Regional Part 107 operators" }, { n: "Asset-owner in-house flight teams" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Telecom tower owners" }, { n: "Wind and solar operations teams" }, { n: "Insurers and roofing surveyors" }] },
    att: att(40, 44),
    n: 'Industrial asset inspection by drone',
    pn: 'Inspecting towers and roofs by drone',
    cat: 'industrial',
    u: '$ per asset inspection',
    th: 'Sending a person up a tower costs a permit, a crew and a shutdown, so the price to avoid all three has very little to do with what the flight costs.',
    px: { v: 2400, p: 'E', c: 0.45, m: 'Typical per-asset price for a thermal and photogrammetric inspection with a processed defect report.', s: 'Service provider quotes; tender documents' },
    base: { v: 850, p: 'E', c: 0.45, m: 'Cost-plus rate for the same flight and processing where operators are plentiful and reports are templated.', s: 'Modelled from operator day rates' },
    ser: [{ t: '2022', v: 1500 }, { t: '2023', v: 1750 }, { t: '2024', v: 2000 }, { t: '2025', v: 2250 }, { t: '2026', v: 2400 }],
    mkt: { v: 2600, p: 'I', c: 0.28, m: 'Drone-based industrial inspection spend across telecom, energy and utilities. Estimated from asset counts and inspection frequency.', s: 'Modelled from asset inspection cycles' },
    take: { v: 190, p: 'I', c: 0.35, m: 'One or two operators covering a region, allowing generously for weather days.', s: 'Modelled from inspections per year' },
    entry: { v: 32, p: 'E', c: 0.5, m: 'Thermal-capable airframe, certification and operational authorisations, insurance, and processing software.', s: 'Equipment and software pricing; regulator fees' },
    ramp: { mo: 4, p: 'E', c: 0.45, m: 'Authorisations and insurance, then the first asset owner willing to accept your report format.', s: 'Regulator published timelines' },
    need: [
      'The report, not the flight. Anyone can fly; almost nobody delivers findings an engineer will act on.',
      'Operational authorisations for the airspace and proximity you actually need.',
      'Insurance that satisfies asset owners, which is stricter than the legal minimum.',
    ],
    who: ['Telecom tower owners', 'Wind and solar operations teams', 'Insurers and roofing surveyors'],
    bar: ['cert', 'liability', 'vendor'],
    kill: [
      'Asset owners bringing flights in-house once volume justifies staff, which is already happening at the largest ones.',
      'Automated docked drones flying scheduled routes with no operator on site.',
    ],
    sub: ['Thermal building envelope surveys', 'Volumetric stockpile measurement', 'Post-event insurance assessment'],
  },
  {
    id: 'OPTICS',
    sup: { p: 'I', c: 0.3, m: 'The firms already doing this work at small scale. Named from public registries, accreditation listings and trade press; the long tail is fragmented and unlisted.', s: 'Accreditation registries; company listings; trade press', top: [{ n: "Optimax" }, { n: "Independent polishing shops" }] },
    buy: { p: 'I', c: 0.3, m: 'Ranked by estimated share of purchases, not by contract value — buyer-side splits are almost never disclosed for these markets.', s: 'Tender records; trade press; practitioner accounts', top: [{ n: "Scientific instrument builders" }, { n: "Defence and aerospace sensor programmes" }, { n: "Semiconductor metrology equipment makers" }] },
    att: att(18, 24),
    n: 'Precision optical component fabrication',
    pn: 'Grinding custom lenses and mirrors',
    cat: 'lab',
    u: '$ per optical element',
    th: 'Custom optics are made in ones and tens by people who learned by hand, and the instrument builders who need them cannot buy the part anywhere else.',
    px: { v: 1900, p: 'I', c: 0.35, m: 'Representative price for a custom precision element at research-grade surface figure, single-piece or very low quantity.', s: 'Optical shop quotes' },
    base: { v: 520, p: 'I', c: 0.35, m: 'Equivalent element from a catalogue or production run where tooling is amortised over volume.', s: 'Catalogue optics pricing' },
    ser: [{ t: '2022', v: 1050 }, { t: '2023', v: 1250 }, { t: '2024', v: 1500 }, { t: '2025', v: 1750 }, { t: '2026', v: 1900 }],
    mkt: { v: 1900, p: 'I', c: 0.25, m: 'Custom and low-volume precision optics spend across instrument, defence and research buyers. Fragmented and unreported.', s: 'Modelled from instrument market' },
    take: { v: 340, p: 'I', c: 0.3, m: 'Two people running polishing and metrology through roughly 200 elements a year at mixed specification.', s: 'Modelled from throughput' },
    entry: { v: 210, p: 'E', c: 0.42, m: 'Polishing and grinding machines, an interferometer for verification, and a temperature-stable space to work in.', s: 'Used optical equipment listings' },
    ramp: { mo: 14, p: 'I', c: 0.35, m: 'Building the hand skill to hit surface figure repeatably is most of this, and it cannot be shortcut with better machines.', s: 'Modelled' },
    need: [
      'Hand skill developed over time. The machines assist; they do not decide.',
      'An interferometer, because you cannot sell a surface figure you cannot prove.',
      'Thermal stability in the workspace, which is a building problem before it is an optics problem.',
    ],
    who: ['Scientific instrument builders', 'Defence and aerospace sensor programmes', 'Semiconductor metrology equipment makers'],
    bar: ['tacit', 'kit', 'scale'],
    kill: [
      'Deterministic polishing and magnetorheological finishing spreading down to small shops, which removes the hand-skill premium.',
      'Precision moulding covering more of the specification range as tolerances improve.',
    ],
    sub: ['Optical coating services', 'Instrument alignment and assembly', 'Optical metrology as a standalone service'],
  },
];
