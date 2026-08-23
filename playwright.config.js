import { defineConfig } from '@playwright/test';

// Smoke tests load the built, self-contained repo-root index.html over file://
// (so they validate the actual deployable artifact). Run `npm run build` first.
//
// This is a small (~dozen-test) smoke suite that drives a shared, animated canvas
// app and mutates global state (selection, zoom, time index, play loop). Running
// in parallel would let those mutations race across workers and produce flaky,
// non-deterministic results, so we force a single serial worker.
export default defineConfig({
  testDir: './tests',
  // The map and board specs load the built file over file://. The census fetches
  // its records, which file:// forbids, so it is tested against a served build —
  // `vite preview` serves dist/, where index.html and humans-data.json sit side
  // by side exactly as they do on Pages.
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  // Only pick up Playwright specs; tests/unit/*.test.mjs run under node:test.
  testMatch: '**/*.spec.js',
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
