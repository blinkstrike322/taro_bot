import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount React trees between tests so DOM asserts never leak across cases.
// (RTL auto-cleans only when globals are registered; we register explicitly.)
afterEach(() => {
  cleanup();
});