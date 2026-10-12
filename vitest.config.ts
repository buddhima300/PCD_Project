import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['src/features/break-management/tests/**/*.test.{ts,tsx}'], setupFiles: ['src/features/break-management/tests/setup.ts'], env: { VITE_BREAK_ADAPTER: 'mock', VITE_BREAK_ENABLED: 'true' } } });
