import { defineConfig } from '@playwright/test';

// Smoke tests load the built, self-contained repo-root index.html over file://
// (so they validate the actual deployable artifact). Run `npm run build` first.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
