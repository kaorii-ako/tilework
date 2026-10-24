import { defineConfig } from '@playwright/test'

// Drives the built app (out/) through Playwright's Electron support. `npm run e2e` builds first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list'
})
