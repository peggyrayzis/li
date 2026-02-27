import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NO_COLOR: '1',
      LI_RECIPIENT_CACHE_PATH: path.join(os.tmpdir(), `li-recipient-cache-vitest-${process.pid}.json`),
    },
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
