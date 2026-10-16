import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'jsdom',
  include: ['src/services/tests/**/*.test.{ts,tsx}'],
  setupFiles: ['src/features/break-management/tests/setup.ts'],
  env: { VITE_API_BASE_URL: '/api/v1', VITE_BREAK_ENABLED: 'false', VITE_BREAK_ADAPTER: 'real' },
} });
