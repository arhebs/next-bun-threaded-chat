import { defineConfig, devices } from "@playwright/test";

const useRealAi = process.env.PLAYWRIGHT_REAL_AI === "1";
const useWebpack = process.env.PLAYWRIGHT_WEBPACK === "1";
const devBundlerFlag = useWebpack ? "--webpack" : "--turbo";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  timeout: useRealAi ? 120_000 : 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run dev -- --port 3000 ${devBundlerFlag}`,
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI && !useRealAi,
    env: {
      ...process.env,
      PLAYWRIGHT: "1",
      MOCK_CHAT: useRealAi ? "" : "1",
      DB_PATH: "test-results/playwright.sqlite",
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
