import { defineConfig } from '@playwright/test';

// Smoke tests load the built, self-contained repo-root index.html over file://
// (so they validate the actual deployable artifact). Run `npm run build` first.
//
// This is a small (5–11 test) smoke suite that drives a shared, animated canvas
// app and mutates global state (selection, zoom, time index, play loop). Running
// in parallel would let those mutations race across workers and produce flaky,
// non-deterministic results, so we force a single serial worker.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
