import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// Node 25 exposes an incomplete native localStorage without --localstorage-file.
// Supply browser-equivalent storage before Zustand's persist middleware loads.
const values = new Map<string, string>();
const storage: Storage = { get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, String(value)); } };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
afterEach(cleanup);
