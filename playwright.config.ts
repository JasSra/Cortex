import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
  command: 'sh -c "cd frontend && NEXT_PUBLIC_BYPASS_AUTH=1 NEXT_PUBLIC_TEST=1 npm run build && NEXT_PUBLIC_BYPASS_AUTH=1 NEXT_PUBLIC_TEST=1 npm run start -p 3000"',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
  command: 'cd backend && dotnet run',
  port: 8081,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
