/* Single source of truth for the dataset's year axis.
   Imported by src/app.js, scripts/fetch-data.mjs, and the unit tests so the
   range can never again drift apart across the pipeline, the UI, and CI.
   MAX_YEAR is pinned (not derived from the clock) so the shipped static
   bundle never grows an empty year on Jan 1 — the annual bump is forced by
   the calendar-tripwire unit test in tests/unit/data.test.mjs. */
export const MIN_YEAR = 2019;
export const MAX_YEAR = 2025;
export const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);
export const PERIODS = YEARS.map(String);
