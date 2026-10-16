// Preserve the original screen contracts while executing every workflow on the backend.
import { ApiError } from './errors';
import { login as serverLogin, request } from './http';

import type { platformApi } from './mock/platformHandlers';
import type { platformSetupApi } from './mock/platformSetupHandlers';
import type { replacementApi } from './mock/replacementHandlers';
import type { reportApi } from './mock/reportHandlers';
import type { resourceApi } from './mock/resourceHandlers';
import type { schedulingApi } from './mock/schedulingHandlers';
import type { systemApi } from './mock/systemHandlers';
import type { workforceApi } from './mock/workforceHandlers';
import type { placementApi } from './mock/placementHandlers';
import type { disciplinaryApi } from './mock/disciplinaryHandlers';
import type { attendanceApi } from './mock/attendanceHandlers';
import type { profileApi } from './mock/profileHandlers';

// Type-only legacy contracts keep existing pages compiling without loading mock handlers.
export type Api = typeof platformApi & typeof platformSetupApi & typeof workforceApi & typeof schedulingApi & typeof replacementApi & typeof resourceApi & typeof systemApi & typeof reportApi & typeof placementApi & typeof disciplinaryApi & typeof attendanceApi & typeof profileApi;
const implemented: Partial<Api> = {
  login: async (email, password) => (await serverLogin(email, password)).user,
};
export const api: Api = new Proxy(implemented as Api, {
  get(target, key: string) {
    if (Object.prototype.hasOwnProperty.call(target, key)) return target[key as keyof Api];
    return (...args: unknown[]) => request(`/operations/workflows/${encodeURIComponent(key)}`, { method: 'POST', body: { args } });
  },
});
export { ApiError };

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'The operations API returned an unexpected response.';
}

export type { PlatformQuery } from './mock/platformHandlers';
export type { EmployeeQuery, FreelancerQuery, EmployeeDetail, FreelancerDetail } from './mock/workforceHandlers';
export type { RosterQuery } from './mock/schedulingHandlers';
export type { ReplacementQuery, ReplacementDetail } from './mock/replacementHandlers';
export type { PoolQuery, LaptopQuery, LaptopHistoryEntry } from './mock/resourceHandlers';
export type { DashboardFilters, OpsDashboard, MyWork } from './mock/systemHandlers';
export type { ReportFilters, ReportResult } from './mock/reportHandlers';
