import { test, expect } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'url';
import { resolve } from 'path';

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

  // Capture the revenue value at the default period (2024).
  const revBefore = (await revenueStatValue(page).innerText()).trim();

  // Scrub back to index 1 -> 2020. Set the value and fire the input event.
  await page.locator('#scrub').fill('1');
  await expect(page.locator('#period')).toHaveText('2020');

  // The revenue figure is time-multiplied, so it must have changed.
  await expect(revenueStatValue(page)).not.toHaveText(revBefore);
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
  await expect(meth).toContainText('Confidence');
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
