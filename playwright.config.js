import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: "npx @11ty/eleventy --serve --port 8091",
    url: "http://localhost:8091",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: { baseURL: "http://localhost:8091" },
  projects: [
    { name: "phone", use: { browserName: "chromium", viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true } },
    { name: "tablet", use: { browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
  ],
});
