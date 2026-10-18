import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// The tests import the built packages, like an app would, so run `pnpm build` (core and svelte) first
export default defineConfig({
  plugins: [svelte()],
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
