import { defineConfig } from 'vitest/config'
import path from 'path'

import fs from 'fs'

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: "./vitest.setup.js",
    root: __dirname,
    exclude: ['tests/e2e/**', 'node_modules/**'], 
    coverage: {
      provider: 'v8', 
      // all: true,
      include: ['src/**/*.js'], 
      exclude: ['src/config.js', 'src/dokieli.js', 'node_modules/**', 'tests/**'], 
      reporter: ['text', 'lcov', 'html'], 
      reportsDirectory: path.resolve(__dirname, 'tests/coverage'),
      reportOnFailure: true,
    },
  },
})