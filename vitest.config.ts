import { configDefaults, defineConfig } from 'vitest/config'

// e2e/ is Playwright's (npm run e2e), not vitest's.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, 'e2e/**'] } })
