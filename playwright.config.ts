import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ko-KR',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'mobile-chrome', use: devices['Pixel 7'] }],
});
