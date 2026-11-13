import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    name: 'node',
    environment: 'node',
    include: ['test/**/*.spec.{ts,tsx}'],
  },
})
