import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "bun run src/index.ts",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
