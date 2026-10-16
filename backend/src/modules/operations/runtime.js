import { build } from 'esbuild';
import { Script, createContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

let compiled;
export async function createDomain() {
  compiled ??= build({ entryPoints: [fileURLToPath(new URL('./domain-entry.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' }).then(result => new Script(result.outputFiles[0].text, { filename: 'operations-domain.cjs' }));
  const storage = new Map();
  const context = createContext({ exports: {}, module: { exports: {} }, console, setTimeout, clearTimeout, structuredClone, crypto: webcrypto, TextEncoder, TextDecoder, URL, Blob, DOMException, btoa, atob,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  (await compiled).runInContext(context, { timeout: 10000 });
  return context.module.exports;
}
