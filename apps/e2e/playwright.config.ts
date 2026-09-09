import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the real K-ssenger web app through every user journey.
 *
 * Target with E2E_BASE_URL (defaults to production). For a local run:
 *   cd apps/mobile && EXPO_PUBLIC_* ... npx expo start --web --port 8081
 *   cd apps/e2e && E2E_BASE_URL=http://localhost:8081 npm test
 */
const baseURL = process.env.E2E_BASE_URL ?? 'https://k-ssenger.expo.app';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    // The buddy-list realtime layer needs geolocation for K-Map tests.
    permissions: ['geolocation'],
    geolocation: { latitude: 43.6045, longitude: 1.4442 },
    locale: 'fr-FR',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
