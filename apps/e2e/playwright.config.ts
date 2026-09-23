import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the real K-ssenger web app through every user journey.
 *
 * Target with E2E_BASE_URL (defaults to production). For a local run:
 *   cd apps/mobile && EXPO_PUBLIC_* ... npx expo start --web --port 8081
 *   cd apps/e2e && E2E_BASE_URL=http://localhost:8081 npm test
 */
const baseURL = process.env.E2E_BASE_URL ?? 'https://k-ssenger.expo.app';

const common = {
  baseURL,
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
  video: 'retain-on-failure' as const,
  actionTimeout: 15_000,
  permissions: ['geolocation', 'microphone'],
  geolocation: { latitude: 43.6045, longitude: 1.4442 },
  locale: 'fr-FR',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  // A fake mic input (silent sine-free noise source) lets voice-note tests
  // actually drive getUserMedia()/MediaRecorder headlessly, without touching
  // the OS audio stack or any other spec (nothing else in this suite records audio).
  use: {
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'], ...common } },
    {
      // The auth-loop spec drives sign-in/out itself — no stored session.
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...common },
      dependencies: ['setup'],
    },
    {
      name: 'journeys',
      testIgnore: [/auth\.spec\.ts/, /auth\.setup\.ts/],
      use: { ...devices['Desktop Chrome'], ...common, storageState: '.auth/kenams.json' },
      dependencies: ['setup'],
    },
  ],
});
