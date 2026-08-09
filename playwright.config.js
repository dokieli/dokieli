import { devices } from "@playwright/test";
import { config as envConfig } from 'dotenv';

envConfig();

const config = {
  workers: process.env.CI ? 2 : '75%',
  testDir: "./tests/e2e/browser",
  // A real OIDC round trip against the IDP takes ~40s under recording, and the
  // worker's login is charged to the first test that triggers it.
  timeout: 120000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  retries: 0,
  reporter: "html",
  webServer: [
    {
      command: "npx serve",
      port: 3000,
      reuseExistingServer: true,
    },
    {
      command: "node tests/utils/ws-server.js",
      port: 4000,
      reuseExistingServer: true,
      env: { PORT: "4000" },
    },
  ],
  use: {
    actionTimeout: 10000,
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    // {
    //   name: "firefox",
    //   use: {
    //     ...devices["Desktop Firefox"],
    //   },
    // },

    // {
    //   name: "webkit",
    //   use: {
    //     ...devices["Desktop Safari"],
    //   },
    // },
    // {
    //   name: "Mobile Chrome",
    //   use: {
    //     ...devices["Pixel 5"],
    //   },
    // },
    // {
    //   name: "Mobile Safari",
    //   use: {
    //     ...devices["iPhone 12"],
    //   },
    // },
    // {
    //   name: "Microsoft Edge",
    //   use: {
    //     channel: "msedge",
    //   },
    // },
    // {
    //   name: "Google Chrome",
    //   use: {
    //     channel: "chrome",
    //   },
    // },
  ],
  outputDir: "test-results/",
};

export default config;
