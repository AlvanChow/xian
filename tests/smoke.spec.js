import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

// Load the BUILT, self-contained repo-root index.html over file:// — this is the
// exact artifact GitHub Pages serves, so passing tests prove the deployable file
// works. Run `npm run build` before `npm test`.
const PAGE_URL = pathToFileURL(resolve('index.html')).href;

// Collect any uncaught page error during a test so we can assert "nothing threw".
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE_URL);
  // App boots a render loop immediately and auto-selects NVDA at +400ms.
  await page.waitForTimeout(700);
});

test('canvas renders actual pixels', async ({ page }) => {
  const errors = trackErrors(page);
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
  expect(errors).toHaveLength(0);
});

test('clicking a node opens the inspector', async ({ page }) => {
  // After boot the view auto-centers on NVDA at the canvas center, so a click at
  // the canvas center lands on a node and drives the click -> selectNode path.
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#inspector .ihead')).toBeVisible();
  await expect(page.locator('#inspector .ihead .nm')).not.toHaveText('');
  // Inspector shows flow breakdown sections.
  await expect(page.locator('#inspector .flowsec').first()).toBeVisible();
});

test('drill-down modal opens and closes', async ({ page }) => {
  // Ensure a node is selected (inspector present), then open the relationship graph.
  await expect(page.locator('#openDD')).toBeVisible();
  await page.locator('#openDD').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);
  await expect(page.locator('#dd')).toBeVisible();

  // Close via Escape.
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/show/);

  // Re-open and close via the × button.
  await page.locator('#openDD').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);
  await page.locator('#ddClose').click();
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
});

test('search returns results', async ({ page }) => {
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

  const errors = trackErrors(page);
  const box = await page.locator('#map').boundingBox();
  // Sweep the pointer across several points, including over dense clusters.
  for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.45, 0.55], [0.6, 0.35]]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(40);
  }
  expect(errors).toHaveLength(0);
});
