import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest runs the frontend unit/integration suite in a DOM (jsdom) environment.
// No production dev server is started — tests are pure, in-process render/assert.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror the `@/* -> ./src/*` alias from tsconfig so tests can import
      // components/libs the same way app code does.
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Deterministic: grep for concurrency/randomness hazards.
    threads: false,
  },
});