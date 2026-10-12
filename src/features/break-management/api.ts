import type { BreakApi } from './contracts';
import { snapshotSchema, monitoringSchema, sessionSchema, requestSchema, exportSchema, commandSchema } from './contracts';
import { breakConfig } from './config';
import { BreakError } from './utils';
import { mockBreakApi } from './mock';

// No endpoint paths are invented. A verified transport must be registered by the integration host.
let transport: BreakApi | undefined;
export function registerRealBreakApi(api: BreakApi) { transport = api; }
export function selectBreakApi(): BreakApi {
  if (!breakConfig.enabled) throw new BreakError('DISABLED', 'Break Management is disabled.');
  if (breakConfig.adapter === 'mock' && !breakConfig.production) return mockBreakApi;
  if (breakConfig.adapter !== 'real' || !transport) throw new BreakError('INTEGRATION_REQUIRED', 'Break Management is unavailable until a verified backend adapter and permissions are integrated.');
  return transport;
}
export const breakApi: BreakApi = {
  snapshot: async signal => snapshotSchema.parse(await selectBreakApi().snapshot(signal)),
  monitor: async (filters, signal) => monitoringSchema.parse(await selectBreakApi().monitor(filters, signal)),
  session: async id => sessionSchema.parse(await selectBreakApi().session(id)),
  request: async id => requestSchema.parse(await selectBreakApi().request(id)),
  history: async (page, pageSize) => { const result = await selectBreakApi().history(page, pageSize); if (!Number.isInteger(result.total) || result.total < 0 || !Array.isArray(result.sessions)) throw new BreakError('INVALID_RESPONSE', 'Invalid history response.'); return { sessions: result.sessions.map(s => sessionSchema.parse(s)), total: result.total }; },
  execute: async (command, key) => { const result = await selectBreakApi().execute(commandSchema.parse(command), key); if (result?.confirmed !== true) throw new BreakError('UNCERTAIN', 'The operation was not confirmed. Refresh before another action.', 0, true); return result; },
  export: async (filters, format, key) => exportSchema.parse(await selectBreakApi().export(filters, format, key)),
  exportStatus: async id => exportSchema.parse(await selectBreakApi().exportStatus(id)),
};
