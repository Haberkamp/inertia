import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// The tests import the built packages, like an app would, so run `pnpm build` (core and vue3) first
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
