import { defineConfig, devices } from "@playwright/test";

const useWebpack = process.env.PLAYWRIGHT_WEBPACK === "1";
const devBundlerFlag = useWebpack ? "--webpack" : "--turbo";

/**
 * Real model Playwright config.
 * - Starts Next dev server with mock chat disabled.
 * - Requires `.env.local` to include `OPENAI_API_KEY` (and optional `OPENAI_MODEL`).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /real-model\.e2e\.ts/,
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run dev -- --port 3000 ${devBundlerFlag}`,
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PLAYWRIGHT: "1",
      PLAYWRIGHT_REAL_AI: "1",
      MOCK_CHAT: "",
      DB_PATH: "test-results/playwright.sqlite",
      WORKBOOK_PATH: "test-results/workbook.xlsx",
    },
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
