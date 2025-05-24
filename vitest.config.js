import { defineConfig } from 'vitest/config'
import path from 'path'

import fs from 'fs'
console.log('Check dom.js exists:', fs.existsSync(path.resolve(__dirname, 'src/editor/utils/dom.js')))
console.log(path.resolve(__dirname, './src'))

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    root: __dirname,
    // setupFiles: './tests/setup.js',
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