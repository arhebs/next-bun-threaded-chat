import { defineConfig, devices } from "@playwright/test";

/**
 * Real model Playwright config - NO mock chat.
 * Start server manually before running:
 *   PLAYWRIGHT=1 DB_PATH=test-results/playwright.sqlite bun run dev
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /real-model\.e2e\.ts/,
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
