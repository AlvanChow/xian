import { test, expect } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'url';
import { resolve } from 'path';
import { PERIODS } from '../src/years.js';
import { FLOW_VINTAGE } from '../src/data.js';

// Load the BUILT, self-contained repo-root index.html over file:// — this is the
// exact artifact GitHub Pages serves, so passing tests prove the deployable file
// works. Run `npm run build` before `npm test`.
//
// Anchor the URL to THIS file's location rather than process.cwd(): resolving
// against the test file means the suite finds index.html no matter what directory
// the runner is launched from.
const PAGE_URL = pathToFileURL(resolve(fileURLToPath(import.meta.url), '../../index.html')).href;

// Each test installs page-level error capture in beforeEach and asserts the
// collected list is empty in afterEach. We key the arrays by the page object so
// the serial worker can't cross-contaminate between tests.
const errorsByPage = new WeakMap();

test.beforeEach(async ({ page }) => {
  // Capture anything that would indicate the app is unhealthy: uncaught page
  // exceptions and console.error output. afterEach asserts this stayed empty.
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  errorsByPage.set(page, errors);

  await page.goto(PAGE_URL);

  // The app boots a render loop immediately and auto-selects NVDA at +400ms,
  // populating the inspector header. Wait for that observable state instead of a
  // blind sleep so the page is fully booted before any test acts.
  await page.waitForFunction(() => !!document.querySelector('#inspector .ihead'));
});

test.afterEach(async ({ page }) => {
  // No test should have produced an uncaught error or a console.error.
  const errors = errorsByPage.get(page) || [];
  expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('canvas renders actual pixels', async ({ page }) => {
  const canvas = page.locator('#map');
  await expect(canvas).toBeVisible();

  // Canvas has real backing-store dimensions.
  const dims = await canvas.evaluate((c) => ({ w: c.width, h: c.height }));
  expect(dims.w).toBeGreaterThan(0);
  expect(dims.h).toBeGreaterThan(0);

  // And it actually drew something (some non-transparent pixels exist).
  const painted = await canvas.evaluate((c) => {
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });
  expect(painted).toBe(true);
});

test('clicking the map re-selects a node', async ({ page }) => {
  // Boot auto-selects NVDA, so the inspector is already populated. To prove the
  // click -> pick() -> selectNode() path actually works (and isn't a false pass
  // off the boot selection), first CLEAR the selection via #zfit, confirm the
  // empty state, then click a pin and confirm a node got freshly selected.
  await page.locator('#zfit').click();
  await expect(page.locator('#inspector .ins-empty')).toBeVisible();

  // #zfit also resets zoom to 1.0×. Wait for the eased view to settle at the fit
  // view so pins are at their final on-screen positions before we click.
  await expect(page.locator('#ctlTop')).toContainText('zoom 1.0×');

  // Find a point that actually sits over a pin and click it through the real
  // pointer pipeline (pointerdown -> pointerup with no drag -> pick ->
  // selectNode). findPin scans a grid rather than assuming a pin is at
  // dead-center: at the fit view the entity cluster does not land at the canvas
  // midpoint, so a hardcoded center click would hit empty ocean.
  const hit = await findPin(page);
  expect(hit, 'expected to find a pin somewhere on the fit-view map').not.toBeNull();
  await page.mouse.click(hit.x, hit.y);

  // A node is now freshly selected: the inspector header name is visible and
  // non-empty (it was .ins-empty a moment ago, so this proves the click acted).
  const nm = page.locator('#inspector .ihead .nm');
  await expect(nm).toBeVisible();
  await expect(nm).not.toHaveText('');
});

test('drill-down modal opens and closes', async ({ page }) => {
  // A node is selected from boot, so the drill-down trigger is present.
  await expect(page.locator('#openDD')).toBeVisible();

  // Open, then close via Escape.
  await page.locator('#openDD').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);
  await expect(page.locator('#dd')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/show/);

  // Re-open and close via the × button.
  await page.locator('#openDD').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);
  await page.locator('#ddClose').click();
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
});

test('search returns results and selecting one updates the inspector', async ({ page }) => {
  await page.fill('#srch', 'Apple');
  const rows = page.locator('#reslist .resrow');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText('Apple');

  // Clicking a result selects it in the inspector.
  await rows.first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');
});

test('hovering the map throws nothing and #tip exists', async ({ page }) => {
  // Regression guard: a missing #tip element once broke all mouse handling.
  await expect(page.locator('#tip')).toHaveCount(1);

  const box = await page.locator('#map').boundingBox();
  // Sweep the pointer across several points, including over dense clusters.
  for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.45, 0.55], [0.6, 0.35]]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(40); // short settling between moves; not a state gate
  }
  // The "throws nothing" assertion is enforced by the afterEach error check.
});

// --- helper: find a CSS-px point that sits over a pin at the fit view ------
// Sweeps the pointer across a grid; pick() sets cursor:'pointer' on the canvas
// only when the pointer is over a pin, so the first 'pointer' hit is our point.
async function findPin(page) {
  const map = page.locator('#map');
  const box = await map.boundingBox();
  for (let gy = 0.2; gy <= 0.8; gy += 0.1) {
    for (let gx = 0.1; gx <= 0.9; gx += 0.05) {
      const x = box.x + box.width * gx;
      const y = box.y + box.height * gy;
      await page.mouse.move(x, y);
      const overPin = await map.evaluate((el) => getComputedStyle(el).cursor === 'pointer');
      if (overPin) return { x, y };
    }
  }
  return null;
}

test('selection writes the URL hash and deep links restore state', async ({ page }) => {
  // Selecting a node puts it in the hash (shareable link).
  await page.fill('#srch', 'Apple');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('node=AAPL');

  // A fresh load with a deep link restores node and period (and skips the
  // NVDA demo auto-select).
  await page.goto(PAGE_URL + '#node=MSFT&t=2020');
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Microsoft');
  await expect(page.locator('#period')).toHaveText('2020');
});

test('search ranks ticker matches first and supports keyboard selection', async ({ page }) => {
  // 'v' is a substring of many names, but the ticker V (Visa) must rank first.
  await page.fill('#srch', 'v');
  await expect(page.locator('#reslist .resrow').first()).toContainText('Visa');

  // ArrowDown + Enter selects from the keyboard without leaving the input.
  await page.locator('#srch').press('ArrowDown');
  await page.locator('#srch').press('Enter');
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Visa');
});

test('About-the-data modal opens and closes', async ({ page }) => {
  await page.locator('#aboutBtn').click();
  await expect(page.locator('#aboutModal')).toHaveClass(/show/);
  await expect(page.locator('#aboutModal')).toContainText('provenance model');
  await page.keyboard.press('Escape');
  await expect(page.locator('#aboutModal')).not.toHaveClass(/show/);

  // Escape closed the modal, NOT the selection underneath it.
  await expect(page.locator('#inspector .ihead')).toBeVisible();

  // Re-open via the close button path.
  await page.locator('#aboutBtn').click();
  await page.locator('#abClose').click();
  await expect(page.locator('#aboutModal')).not.toHaveClass(/show/);
});

test('Escape clears the selection', async ({ page }) => {
  // Boot auto-selects NVDA, so the inspector starts populated.
  await expect(page.locator('#inspector .ihead')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector .ins-empty')).toBeVisible();
});

test('keyboard zooms the focused map and 0 resets it', async ({ page }) => {
  const ctlTop = page.locator('#ctlTop');
  await page.locator('#zfit').click();
  await expect(ctlTop).toContainText('zoom 1.0×');

  // Focus the canvas (it's tabbable) and zoom in one step (×1.6).
  await page.locator('#map').focus();
  await page.keyboard.press('+');
  await expect.poll(() => ctlTop.evaluate((el) => el.innerHTML))
    .toMatch(/zoom <b>(1\.[6-9]|2)/);

  // '0' fits the view back to 1.0× and clears the selection.
  await page.keyboard.press('0');
  await expect(ctlTop).toContainText('zoom 1.0×');
  await expect(page.locator('#inspector .ins-empty')).toBeVisible();
});

test.describe('touch input', () => {
  test.use({ hasTouch: true });

  test('tapping a pin selects it', async ({ page }) => {
    // Clear the boot selection and let the view settle at the 1.0× fit.
    await page.locator('#zfit').click();
    await expect(page.locator('#inspector .ins-empty')).toBeVisible();
    await expect(page.locator('#ctlTop')).toContainText('zoom 1.0×');

    // Locate a pin with the mouse sweep, then tap it through the real touch
    // pipeline (pointerdown/up with pointerType 'touch' -> pick -> selectNode).
    const hit = await findPin(page);
    expect(hit, 'expected to find a pin somewhere on the fit-view map').not.toBeNull();
    await page.touchscreen.tap(hit.x, hit.y);

    const nm = page.locator('#inspector .ihead .nm');
    await expect(nm).toBeVisible();
    await expect(nm).not.toHaveText('');
  });
});

// --- helper: read the REVENUE stat value text from the inspector ----------
// The REVENUE stat is the .stat whose key (.k) starts with "REVENUE"; its value
// lives in the sibling .v. getByText + filter keeps this robust to ordering.
function revenueStatValue(page) {
  return page
    .locator('#inspector .stat')
    .filter({ has: page.getByText(/^REVENUE/) })
    .locator('.v');
}

test('time scrubber changes the period and revenue figure', async ({ page }) => {
  // Select a known node so the inspector stats are deterministic.
  await page.fill('#srch', 'Apple');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');

  // Capture the revenue value at the default period (the latest year).
  const revBefore = (await revenueStatValue(page).innerText()).trim();

  // Scrub back to index 1 -> 2020. Set the value and fire the input event.
  await page.locator('#scrub').fill('1');
  await expect(page.locator('#period')).toHaveText('2020');

  // The revenue figure is time-multiplied, so it must have changed.
  await expect(revenueStatValue(page)).not.toHaveText(revBefore);
});

test('Escape and the fit button clear the selection back to the full network', async ({ page }) => {
  // Boot auto-selects NVDA; deselection must be reachable so the user can
  // see the whole flow network, not just one ego-network.
  await expect(page.locator('#inspector .ihead .nm')).toContainText('NVIDIA');
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector .ins-empty')).toBeVisible();
  // Re-select, then the fit control must also clear.
  await page.fill('#srch', 'Apple');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');
  await page.locator('#zfit').click();
  await expect(page.locator('#inspector .ins-empty')).toBeVisible();
});

test('year axis defaults to the latest period and labels flow vintage honestly', async ({ page }) => {
  const latest = PERIODS[PERIODS.length - 1];
  // Default period is the last entry of the shared year axis, and boot code
  // (not the static HTML fallback) drives the scrubber range.
  await expect(page.locator('#period')).toHaveText(latest);
  await expect(page.locator('#scrub')).toHaveAttribute('max', String(PERIODS.length - 1));
  await expect(page.locator('#scrub')).toHaveValue(String(PERIODS.length - 1));

  // Off the flow-vintage year the header must disclose that flows are scaled
  // vintage figures; on it, the plain "modeled" honesty note returns.
  const ctl = page.locator('#ctlTop');
  if (latest !== FLOW_VINTAGE) {
    await expect(ctl).toContainText(`flows = ${FLOW_VINTAGE} figures`);
  }
  await page.locator('#scrub').fill(String(PERIODS.indexOf(FLOW_VINTAGE)));
  await expect(page.locator('#period')).toHaveText(FLOW_VINTAGE);
  await expect(ctl).toContainText('flows modeled (E/I)');
});

test('sector toggle drops entities and clears the chip', async ({ page }) => {
  const hN = page.locator('#hN');
  const before = (await hN.innerText()).trim();

  const techChip = page.locator('[data-s="tech"]');
  await expect(techChip).toHaveClass(/\bon\b/); // starts enabled
  await techChip.click();

  // Toggling tech off removes its class and lowers the visible entity count.
  await expect(techChip).not.toHaveClass(/\bon\b/);
  await expect(hN).not.toHaveText(before);
});

test('data-layer toggle changes the provenance mix', async ({ page }) => {
  // The Inferred row in the provenance mix shows a percentage we expect to move
  // to 0% once the Inferred layer is switched off.
  const inferredRow = page
    .locator('#provmix .mixrow')
    .filter({ hasText: 'Inferred' });
  const before = (await inferredRow.innerText()).trim();

  const inferredLayer = page.locator('[data-l="I"]');
  await inferredLayer.click();

  // Toggling the layer off marks it .off and recomputes the mix percentages.
  await expect(inferredLayer).toHaveClass(/\boff\b/);
  await expect(inferredRow).not.toHaveText(before);
});

test('clicking a flow row shows its methodology', async ({ page }) => {
  // Select Apple so we have seeded flows to inspect.
  await page.fill('#srch', 'Apple');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');

  // Click the first flow row; the methodology block should fill in.
  await page.locator('#inspector .flowsec .flow').first().click();
  const meth = page.locator('#methblock');
  await expect(meth).toContainText('Method.');
  await expect(meth).toContainText('Source quality');
});

test('household regional breakdown collapses, expands, and explains itself', async ({ page }) => {
  // US Households carries the largest breakdown: 51 rows, top 10 collapsed.
  await page.fill('#srch', 'US Households');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('US Households');

  const stateRows = page.locator('#inspector .flow[data-st]');
  await expect(stateRows).toHaveCount(10);

  // Expand to all 51, then a state row click fills the methodology block.
  await page.locator('#sbToggle').click();
  await expect(stateRows).toHaveCount(51);
  await page.locator('#inspector .flow[data-st="TX"]').click();
  const meth = page.locator('#methblock');
  await expect(meth).toContainText('Texas');
  await expect(meth).toContainText('Share of household total');

  // Collapse back to the top 10.
  await page.locator('#sbToggle').click();
  await expect(stateRows).toHaveCount(10);

  // Non-household nodes must not grow a breakdown section.
  await page.fill('#srch', 'Apple');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#inspector .ihead .nm')).toContainText('Apple');
  await expect(page.locator('#inspector .flow[data-st]')).toHaveCount(0);
});

test('zoom in raises the zoom level and fit resets it', async ({ page }) => {
  const ctlTop = page.locator('#ctlTop');

  // Boot auto-selects NVDA, which leaves the view easing toward 2.2×. Reset to a
  // known 1.0× baseline first so the single #zin step (×1.6 -> 1.6×) is a real,
  // observable increase rather than a no-op on top of the boot zoom.
  await page.locator('#zfit').click();
  // toContainText normalizes whitespace — #ctlTop is display:flex, so innerText
  // injects newlines between flex items ("zoom\n1.0×") and a raw toContain fails.
  await expect(ctlTop).toContainText('zoom 1.0×');

  // Zoom in once; the view eases toward 1.6×. Poll the (animated) header until it
  // reports a zoom in the high-1.x / 2x range (1.0 -> 1.6 settles in this band).
  await page.locator('#zin').click();
  await expect.poll(() => ctlTop.evaluate((el) => el.innerHTML))
    .toMatch(/zoom <b>(1\.[6-9]|2)/);

  // Fit resets the view back to 1.0×.
  await page.locator('#zfit').click();
  // toContainText normalizes whitespace — #ctlTop is display:flex, so innerText
  // injects newlines between flex items ("zoom\n1.0×") and a raw toContain fails.
  await expect(ctlTop).toContainText('zoom 1.0×');
});

test('play advances the period then stops cleanly when paused', async ({ page }) => {
  const period = page.locator('#period');
  const playBtn = page.locator('#play');

  const start = (await period.innerText()).trim();

  // Start playback: the button label flips to the pause glyph.
  await playBtn.click();
  await expect(playBtn).toHaveText('⏸');

  // The period should advance at least once (interval is 1100ms). Allow generous
  // headroom over the 1100ms tick for poll overhead / headless timer jitter.
  await expect.poll(() => period.innerText(), { timeout: 3000 })
    .not.toBe(start);

  // Regression for the interval-leak fix: rapidly toggling play several more
  // times must NOT spawn multiple concurrent intervals. Each click toggles the
  // state, so an odd number of extra clicks lands back on PLAYING; we then add a
  // final click only if needed so we deterministically END ON PAUSED (▶).
  for (let i = 0; i < 4; i++) await playBtn.click();
  if ((await playBtn.innerText()).trim() !== '▶') await playBtn.click();
  await expect(playBtn).toHaveText('▶'); // ended paused

  // Let any leaked interval reveal itself, then confirm the period is stable
  // across two reads 800ms apart (no runaway advancement).
  await page.waitForTimeout(1500);
  const a = (await period.innerText()).trim();
  await page.waitForTimeout(800);
  const b = (await period.innerText()).trim();
  expect(b).toBe(a);
});

/* ---- scarcity board (second tab) ---- */

// Switching to the board and back exercises the whole view-swap: the map RAF
// loop stops, the board renders, and the header stats swap with it.
test('the Scarcity tab swaps the view and the map loop stops', async ({ page }) => {
  const mapCanvas = page.locator('#map');
  await expect(mapCanvas).toBeVisible();

  await page.locator('#viewTab button[data-v="rents"]').click();

  await expect(page.locator('#app')).toHaveAttribute('data-view', 'rents');
  await expect(mapCanvas).toBeHidden();
  await expect(page.locator('#centerRents')).toBeVisible();
  await expect(page.locator('#viewTab button[data-v="rents"]')).toHaveAttribute('aria-selected', 'true');
  // Board header stats replace the map's entity/flow counts.
  await expect(page.locator('#hRN')).not.toHaveText('—');

  // The map render loop must actually be suspended, not merely hidden: sample
  // the canvas status readout, which only changes while frames are running.
  const stopped = await page.evaluate(async () => {
    const before = document.getElementById('map').width;
    // Force a resize the loop would normally pick up on its next frame.
    const el = document.getElementById('map');
    el.width = 7;
    await new Promise((r) => setTimeout(r, 300));
    return { before, after: el.width };
  });
  expect(stopped.after, 'map canvas was reallocated, so the RAF loop is still running').toBe(7);

  await page.locator('#viewTab button[data-v="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');
  await expect(mapCanvas).toBeVisible();
});

test('the board ranks every signal and rank 1 leads', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const rows = page.locator('#rlist .trow');

  const expected = await page.evaluate(() => Number(document.getElementById('hRN').textContent));
  await expect(rows).toHaveCount(expected);
  expect(expected).toBeGreaterThan(0);

  // Default sort is the rank score, so the first row is rank 1 and ranks ascend.
  await expect(rows.first().locator('.rk')).toHaveText('1');
  const ranks = await rows.locator('.rk').allInnerTexts();
  const nums = ranks.map((r) => Number(r.trim()));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));

  // Every row shows a rent multiple above 1x — that is what makes it a signal.
  const mults = await rows.locator('.rmult').allInnerTexts();
  for (const m of mults) expect(parseFloat(m)).toBeGreaterThan(1);
});

test('the click-in carries the whole record, with no second view to open', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  await page.locator('#rlist .trow').first().click();
  const ins = page.locator('#rinspector');

  await expect(ins.locator('.ihead .nm')).not.toHaveText('');
  await expect(ins.locator('.stats .stat')).toHaveCount(6);

  // The five columns the table shows must all be answerable here too.
  for (const k of ['Gap', 'Excess every year', 'Volume', 'Media', 'Policy']) {
    await expect(ins).toContainText(k);
  }
  // ...along with everything the dossier modal used to hold on its own.
  for (const k of ['What is going on', 'Who collects it', 'Who pays it',
    'Why nobody can just make more', 'Already being built', 'What solving it requires',
    'What would kill it', 'Substitutes and adjacent routes', 'Every figure, and where it came from']) {
    await expect(ins).toContainText(k);
  }
  // Per-figure provenance, including buyers and attention, and the score formula.
  await expect(ins.locator('.dtab tr')).toHaveCount(8);
  await expect(ins.locator('.meth').last()).toContainText('30% gap + 28% excess');

  // There is no longer a second thing to open.
  await expect(page.locator('#openDossier')).toHaveCount(0);
  await expect(page.locator('#rentModal')).toHaveCount(0);
});

test('entity ids resolve to names everywhere they are rendered', async ({ page }) => {
  // gm.who and conc.sup[].id are COMPANIES keys. They resolved in the stat
  // block and leaked in the provenance table underneath it — same value, two
  // call sites, one of them missed. This checks the rendered panel instead of
  // the call sites, so a third render path cannot reintroduce it.
  await page.locator('#viewTab button[data-v="rents"]').click();
  for (const id of ['HBM', 'DDR5', 'COWOS', 'NEARLINE', 'XFMR', 'COPPER']) {
    await page.locator(`#rlist .trow[data-r="${id}"]`).click();
    const txt = await page.locator('#rinspector').textContent();
    const leaked = await page.evaluate((t) => {
      // Strip every resolved display name first, longest first — "BHP Group"
      // contains "BHP", so hunting for bare ids without this flags correct
      // output as a leak.
      const ids = window.__ids || [];
      let rest = t;
      for (const c of [...ids].sort((a, b) => b.name.length - a.name.length)) {
        rest = rest.split(c.name).join(' ');
      }
      return ids.filter((c) => new RegExp(`\\b${c.id}\\b`).test(rest));
    }, txt);
    expect(leaked.map((c) => c.id), `${id} renders a raw entity id`).toEqual([]);
  }
});

test('a supplier chip returns to the map with that entity selected', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  // HBM's suppliers are all memory makers that exist as map nodes.
  await page.locator('#rlist .trow[data-r="HBM"]').click();

  const link = page.locator('#rinspector .cplink').first();
  const wantId = await link.getAttribute('data-go');
  await link.click();

  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');
  await expect(page.locator('#inspector .ihead .tk')).toHaveText(wantId);
});

test('board filters narrow the list and the hash deep-links a signal', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const rows = page.locator('#rlist .trow');
  const all = await rows.count();

  // Turning a category off must drop exactly that category's entries.
  await page.locator('#rcats button[data-rc="compute"]').click();
  const fewer = await rows.count();
  expect(fewer).toBeLessThan(all);
  await expect(page).toHaveURL(/rcat=compute/);

  // Search narrows further, then clears back.
  await page.locator('#rcats button[data-rc="compute"]').click();
  await page.locator('#rsrch').fill('uranium');
  await expect(rows).toHaveCount(1);
  await page.locator('#rsrch').fill('');
  await expect(rows).toHaveCount(all);

  // Selection is addressable.
  await page.locator('#rlist .trow[data-r="COCOA"]').click();
  await expect(page).toHaveURL(/view=rents/);
  await expect(page).toHaveURL(/r=COCOA/);
});

test('the barrier fold stays shut until asked for, then filters and says so', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const bars = page.locator('#rbars button[data-rb="capex"]');
  const cv = page.locator('#rbarcv');

  // Collapsed by default — the chips exist but are not on screen, and the
  // summary reads as the neutral count rather than a filter.
  await expect(bars).toBeHidden();
  await expect(cv).toHaveText(/^\d+$/);

  await page.locator('#leftRents .fold:has(#rbars) > summary').click();
  await expect(bars).toBeVisible();

  // Turning one off is announced on the summary and in the hash, so a board
  // narrowed from inside a shut fold still explains itself.
  await bars.click();
  await expect(cv).toHaveText('1 off');
  await expect(page).toHaveURL(/rbar=capex/);

  // The filter is ANY-match, so one barrier off drops nothing on its own — an
  // entry survives while any of its other barriers is still selected. Clearing
  // the whole set is what empties the board, and proves the chips inside the
  // fold are really wired to the list.
  const rows = page.locator('#rlist .trow');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const k of ['physics', 'permit', 'labor', 'export', 'ip', 'feedstock', 'grid', 'capital']) {
    await page.locator(`#rbars button[data-rb="${k}"]`).click();
  }
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#rlist .rempty')).toBeVisible();
  await expect(cv).toHaveText('9 off');
});

test('a deep link boots straight into the board with the signal selected', async ({ page }) => {
  await page.goto(`${PAGE_URL}#view=rents&r=HBM`);
  await page.waitForFunction(() => !!document.querySelector('#rinspector .ihead'));

  await expect(page.locator('#app')).toHaveAttribute('data-view', 'rents');
  await expect(page.locator('#rinspector .ihead .nm')).toContainText('HBM');
  await expect(page.locator('#rlist .trow[data-r="HBM"]')).toHaveClass(/on/);

  // The map's demo auto-select must not fire and rewrite the hash out from under
  // a deep link into the board.
  await page.waitForTimeout(700);
  await expect(page).toHaveURL(/view=rents/);
  await expect(page).toHaveURL(/r=HBM/);
});

test('a row is a compact table line, not a card', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const rows = page.locator('#rlist .trow');

  // The whole point of the rewrite: a ranked board you can actually see ranked.
  // Cards ran ~280px and fitted three; this must stay in table territory.
  const h = await rows.first().evaluate((n) => n.getBoundingClientRect().height);
  expect(h).toBeLessThan(48);
  const onScreen = await rows.evaluateAll((ns) => ns.filter((n) => n.getBoundingClientRect().bottom < 900).length);
  expect(onScreen).toBeGreaterThan(12);

  // Header and rows are laid out from one column definition, so their grids
  // must be identical — a header that can drift from its own body is the bug
  // this shares-one-template design exists to prevent.
  const headGrid = await page.locator('#rlist .thead').evaluate((n) => getComputedStyle(n).gridTemplateColumns);
  const rowGrid = await rows.first().evaluate((n) => getComputedStyle(n).gridTemplateColumns);
  expect(rowGrid).toBe(headGrid);

  // Every column fits without a sideways scrollbar once the pane is wide enough.
  // Below that the table scrolls rather than dropping columns — hiding a column
  // would remove its sort, and the sorts are the point of the table.
  await page.setViewportSize({ width: 1500, height: 900 });
  await expect
    .poll(() => page.locator('#rlist').evaluate((n) => n.scrollWidth > n.clientWidth))
    .toBe(false);
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(() => page.locator('#rlist').evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true);
  expect(await page.locator('#rlist').evaluate((n) => getComputedStyle(n).overflowX)).toBe('auto');
  // No column is lost at the narrow width, only pushed off-screen.
  await expect(page.locator('#rlist .thead .th')).toHaveCount(9);
});

test('every visible column sorts, both ways, and says which way', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const heads = page.locator('#rlist .thead .th');
  expect(await heads.allTextContents()).toEqual(
    ['#▾', 'Signal', '$', 'Gap', 'Excess / yr', 'Volume', 'Media', 'Policy', '5 yr']);

  const val = (k) => page.locator(`#rlist .trow`).first().locator(`.td`).nth(k).textContent();

  // Gap: first click gives descending, second ascending, and the header says so.
  await page.locator('.th[data-sc-col="gap"]').click();
  await expect(page.locator('.th[data-sc-col="gap"]')).toHaveAttribute('aria-sort', 'descending');
  const hi = parseFloat(await val(3));
  await page.locator('.th[data-sc-col="gap"]').click();
  await expect(page.locator('.th[data-sc-col="gap"]')).toHaveAttribute('aria-sort', 'ascending');
  const lo = parseFloat(await val(3));
  expect(hi).toBeGreaterThan(lo);

  // The ordering is actually monotone, not just the endpoints.
  const gaps = (await page.locator('#rlist .trow .td:nth-child(4)').allTextContents()).map(parseFloat);
  expect(gaps).toEqual([...gaps].sort((x, y) => x - y));

  // Sorting is shareable.
  await expect(page).toHaveURL(/rsort=gap/);
  await expect(page).toHaveURL(/rdir=asc/);

  // The two attention columns sort too — they are the reason they exist.
  await page.locator('.th[data-sc-col="policy"]').click();
  await expect(page.locator('.th[data-sc-col="policy"]')).toHaveAttribute('aria-sort', 'descending');
  const meters = await page.locator('#rlist .trow .meter').evaluateAll(
    (ns) => ns.filter((_, i) => i % 2 === 1).map((n) => parseFloat(n.firstElementChild.style.width)));
  expect(meters).toEqual([...meters].sort((x, y) => y - x));
});

test('one back press returns from a supplier jump to the board', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  await page.locator('#rlist .trow[data-r="HBM"]').click();
  await expect(page).toHaveURL(/r=HBM/);

  await page.locator('#rinspector .cplink').first().click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');

  // The tab switch must not have cost its own history entry.
  await page.goBack();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'rents');
  await expect(page.locator('#rinspector .ihead .nm')).toContainText('HBM');
});

test('the row chart draws the price against its baseline', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const top = page.locator('#rlist .trow').first();

  // Inline SVG, one per row — the trace, the shaded gap, and the dashed baseline
  // that makes the gap mean something.
  const svg = top.locator('.td.ch svg.spk');
  await expect(svg).toHaveCount(1);
  await expect(svg.locator('path')).toHaveCount(2);
  await expect(svg.locator('line[stroke-dasharray]')).toHaveCount(1);
  await expect(page.locator('#rlist svg.spk')).toHaveCount(await page.locator('#rlist .trow').count());

});

test('the within-reach board is a separate set with its own columns and sorts', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  const rows = page.locator('#rlist .trow');
  const industrial = await rows.count();

  await page.locator('#rScaleTab button[data-sc="micro"]').click();
  await expect(page.locator('#rttl')).toHaveText('The Small-Operator Board');
  expect(await rows.count()).not.toBe(industrial);

  // Its columns answer the question the industrial ones do not: could you do it.
  expect(await page.locator('#rlist .thead .th').allTextContents()).toEqual(
    ['#▾', 'Niche', '$', 'Gap', 'To start', 'Payback', 'Take / yr', 'Media', 'Policy', '5 yr']);

  // Its own categories — the two enums both contain "materials" and
  // "regulated", so a shared filter map would cross-wire them.
  await expect(page.locator('#rcats .fr').first()).toContainText('Electronics & parts');

  // The scale is in the hash, and a deep link boots straight into it.
  await rows.first().click();
  await expect(page).toHaveURL(/scale=micro/);
  const id = await rows.first().getAttribute('data-r');
  await page.goto(PAGE_URL + `#view=rents&scale=micro&r=${id}`);
  await expect(page.locator('#rttl')).toHaveText('The Small-Operator Board');
  // The switch has to agree with the board it is sitting above.
  await expect(page.locator('#rScaleTab button[data-sc="micro"]')).toHaveClass(/on/);
  await expect(page.locator('#rScaleTab button[data-sc="big"]')).not.toHaveClass(/on/);
  await expect(page.locator(`#rlist .trow[data-r="${id}"]`)).toHaveClass(/on/);
  await expect(page.locator('#rinspector')).toContainText('Cost to start');
  await expect(page.locator('#rinspector')).toContainText('Pays itself back in');
});

test('the small-operator click-in answers what it costs and what would end it', async ({ page }) => {
  await page.goto(PAGE_URL + '#view=rents&scale=micro');
  await page.locator('#rlist .trow').first().click();
  const ins = page.locator('#rinspector');
  for (const k of ['Cost to start', 'Until the first invoice', 'Pays itself back in', 'Gap',
    'Whole niche', 'Media', 'Policy', 'What you actually need', 'Who does this now',
    'Who pays for it', 'Buyer types', 'Why it stays expensive', 'What would end it',
    'Every figure, and where it came from']) {
    await expect(ins).toContainText(k);
  }
  // The board never claims a published price, and the click-in says so twice:
  // once as a verdict and once in the scoring footnote.
  await expect(ins.locator('.verdict')).toContainText('Nothing on this board is a published price');
  await expect(ins.locator('.meth').last()).toContainText('check every number yourself');
  await expect(page.locator('#openDossier')).toHaveCount(0);
});

test('map state stays out of board URLs, and survives the round trip', async ({ page }) => {
  // The map auto-selects NVDA on boot. That selection used to ride along in
  // every board URL, so a link to a scarcity signal arrived carrying node=NVDA.
  const params = async () => new URLSearchParams(
    (await page.evaluate(() => location.hash)).replace(/^#/, ''));

  await expect.poll(async () => (await params()).get('node')).toBe('NVDA');
  await page.locator('#scrub').fill('2');
  await expect.poll(async () => (await params()).get('t')).toBeTruthy();
  const mapHash = await page.evaluate(() => location.hash);

  await page.locator('#viewTab button[data-v="rents"]').click();
  await page.locator('#rlist .trow[data-r="COCOA"]').click();
  let q = await params();
  for (const k of ['node', 't', 'hide', 'layers', 'size']) {
    expect(q.get(k), `${k} leaked into a board URL`).toBeNull();
  }
  // The board's own state is still there — this is a split, not a purge.
  expect(q.get('view')).toBe('rents');
  expect(q.get('r')).toBe('COCOA');

  // Returning to the map restores it from memory; the hash never had to carry it.
  await page.locator('#viewTab button[data-v="map"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(mapHash);
  await expect(page.locator('#inspector .ihead .nm')).toContainText('NVIDIA');
});

test('a board link opened cold carries no map selection', async ({ page }) => {
  await page.goto(PAGE_URL + '#view=rents&r=HBM');
  await expect(page.locator('#rlist .trow[data-r="HBM"]')).toHaveClass(/on/);
  // The boot demo must not fire behind the board and repopulate the hash.
  await page.waitForTimeout(700);
  const q = new URLSearchParams((await page.evaluate(() => location.hash)).replace(/^#/, ''));
  expect(q.get('node')).toBeNull();
});

test('the board table is a grid, and its bars are not silent', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  // role=listbox with row children was invalid once the list became a table.
  await expect(page.locator('#rlist')).toHaveAttribute('role', 'grid');
  expect(await page.locator('#rlist > *').evaluateAll((ns) => ns.map((n) => n.getAttribute('role'))))
    .toEqual(['rowgroup', 'rowgroup']);
  // A meter with no text announces as an empty cell.
  const row = page.locator('#rlist .trow').first();
  await expect(row.locator('.td').nth(6)).toHaveAttribute('aria-label', 'Media');
  await expect(row.locator('.meter').first()).toHaveAttribute('aria-label', /^\d+ out of 100$/);
});

// A section of the click-in, addressed by its heading. Filtering on section
// text alone is ambiguous: the provenance table at the bottom repeats every
// heading as a row label, so "Who does this now" matches twice.
const section = (page, name) => page.locator('#rinspector .flowsec')
  .filter({ has: page.locator('.lbl', { hasText: name }) });

test('both boards name their buyers and suppliers, and the names click through', async ({ page }) => {
  await page.locator('#viewTab button[data-v="rents"]').click();
  await page.locator('#rlist .trow[data-r="HBM"]').click();

  // Who collects it, and — new — who pays for it, by name rather than by category.
  const collects = section(page, 'Who collects it');
  const pays = section(page, 'Who pays it');
  await expect(collects).toContainText('SK Hynix');
  await expect(pays).toContainText('NVIDIA');
  await expect(pays).toContainText('AMD');
  // Suppliers carry a share; buyers do not, and a shared renderer that assumed
  // one printed "NaN%" beside every buyer. Nothing on the panel may read NaN.
  await expect(collects).toContainText('50%');
  await expect(pays).not.toContainText('NaN');
  await expect(page.locator('#rinspector')).not.toContainText('NaN');

  // A named buyer that exists on the map is a link to it, same as a supplier.
  await pays.locator('.cplink').first().click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');
  await expect(page.locator('#inspector .ihead .nm')).toContainText('NVIDIA');
});

test('the small-operator board names who does the work and who pays for it', async ({ page }) => {
  await page.goto(PAGE_URL + '#view=rents&scale=micro&r=CALIB');
  await expect(section(page, 'Who does this now')).toContainText('Trescal');
  await expect(section(page, 'Who pays for it')).toContainText('Pharma');

  // COBOL's incumbents are on the map, so they click through from here too.
  await page.goto(PAGE_URL + '#view=rents&scale=micro&r=COBOL');
  const now = section(page, 'Who does this now');
  await expect(now).toContainText('Tata Consultancy');
  await now.locator('.cplink').first().click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');
  await expect(page.locator('#inspector .ihead .nm')).not.toHaveText('');
});

test('no panel on either board ever renders NaN or undefined', async ({ page }) => {
  for (const url of ['#view=rents&r=HBM', '#view=rents&r=SPECTRUM', '#view=rents&r=ATC',
    '#view=rents&scale=micro&r=CALIB', '#view=rents&scale=micro&r=COBOL', '#view=rents&scale=micro&r=OPTICS']) {
    await page.goto(PAGE_URL + url);
    const txt = await page.locator('#rinspector').textContent();
    expect(txt, `${url} renders a broken value`).not.toMatch(/NaN|undefined|\[object/);
  }
});

test('the map draws a ranked budget of flows and nodes, not the whole graph', async ({ page }) => {
  // The hairball: ~510 arcs and 164 pins at once, every one of them faint, with
  // an animated dot on every arc. What is drawn is now a ranked slice, and the
  // status line says so.
  await page.locator('#zfit').click();
  await expect(page.locator('#ctlTop')).toContainText(/\d+ of 164 entities/);
  await expect(page.locator('#ctlTop')).toContainText(/120 of \d+ flows/);

  // The control reflects what is drawn, rather than being stamped into markup.
  await expect(page.locator('#flowTop button[data-ft="120"]')).toHaveClass(/on/);
  await page.locator('#flowTop button[data-ft="20"]').click();
  await expect(page.locator('#ctlTop')).toContainText(/20 of \d+ flows/);
  await expect(page.locator('#flowTop button[data-ft="20"]')).toHaveClass(/on/);
  await expect(page.locator('#flowTop button[data-ft="120"]')).not.toHaveClass(/on/);

  // Selecting a node shows its own flows in full, however tight the budget is.
  await page.locator('#srch').fill('NVIDIA');
  await page.locator('#reslist .resrow').first().click();
  await expect(page.locator('#ctlTop')).toContainText(/\d+ flows here/);
});
