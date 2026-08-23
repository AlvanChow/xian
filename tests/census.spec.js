// Smoke tests for the Humans census view.
//
// Unlike the map and board specs, these run against a SERVED build rather than
// file://. The census fetches its 557 records on first open instead of inlining
// them — that is what keeps index.html at ~450KB for everyone who never opens
// this tab — and file:// forbids that fetch. `vite preview` (started by
// playwright.config.js) serves dist/, where index.html and humans-data.json sit
// side by side exactly as they do on GitHub Pages.
import { test, expect } from '@playwright/test';

const PAGE = 'http://localhost:4173/';

test('the census tab loads its data and fills the table', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.locator('#viewTab button[data-v="humans"]').click();
  // the row count arrives only after the fetch resolves
  await expect(page.locator('.hrow').first()).toBeVisible({ timeout: 15_000 });
  const rows = await page.locator('.hrow').count();
  expect(rows).toBeGreaterThan(100);
  await expect(page.locator('#hHN')).toHaveText(String(rows));
  expect(errors).toEqual([]);
});

test('the map and board still work after the census has loaded', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#viewTab button[data-v="humans"]').click();
  await expect(page.locator('.hrow').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#viewTab button[data-v="map"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'map');
  await page.locator('#viewTab button[data-v="rents"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'rents');
});

test('selecting a person opens a dossier and deep-links to them', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#viewTab button[data-v="humans"]').click();
  await expect(page.locator('.hrow').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('.hrow').first().click();
  await expect(page.locator('#hinspector h2')).toBeVisible();
  await expect(page).toHaveURL(/#view=humans&h=[A-Z0-9_]+/);
});

test('a cold deep link into a person loads that dossier', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${PAGE}#view=humans&h=PALMER_LUCKEY`);
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'humans');
  await expect(page.locator('#hinspector h2')).toHaveText('Palmer Luckey', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('every census sub-tab renders', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#viewTab button[data-v="humans"]').click();
  await expect(page.locator('.hrow').first()).toBeVisible({ timeout: 15_000 });
  for (const pane of ['age', 'time', 'geo', 'find']) {
    await page.locator(`#hTabs button[data-p="${pane}"]`).click();
    await expect(page.locator(`#hp-${pane}`)).toBeVisible();
    expect(await page.locator(`#hp-${pane} svg, #hp-${pane} .finding`).count()).toBeGreaterThan(0);
  }
});

// The map and the board must not pay for the census. If this fails, the records
// have been inlined back into the single file.
test('index.html stays small — the records are not inlined', async ({ request }) => {
  const html = await (await request.get(PAGE)).text();
  expect(html.length).toBeLessThan(700_000);
  expect(html).not.toContain('PALMER_LUCKEY');
  const data = await request.get(`${PAGE}humans-data.json`);
  expect(data.ok()).toBe(true);
});
