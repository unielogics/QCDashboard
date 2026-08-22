import { defineConfig } from "@playwright/test";

const baseURL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    channel: "chrome",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-1600", use: { viewport: { width: 1600, height: 1000 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "compact-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
});
