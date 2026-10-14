// API client facade. UI code talks only to `api`. Swap the mock handlers for an HTTP implementation
// with the same method signatures to connect the production REST API — no UI changes required.
import { ApiError, setAuthContext } from './mock/core';
import { platformApi } from './mock/platformHandlers';
import { platformSetupApi } from './mock/platformSetupHandlers';
import { replacementApi } from './mock/replacementHandlers';
import { reportApi } from './mock/reportHandlers';
import { resourceApi } from './mock/resourceHandlers';
import { schedulingApi } from './mock/schedulingHandlers';
import { systemApi } from './mock/systemHandlers';
import { workforceApi } from './mock/workforceHandlers';
import { placementApi } from './mock/placementHandlers';
import { disciplinaryApi } from './mock/disciplinaryHandlers';
import { attendanceApi } from './mock/attendanceHandlers';
import { profileApi } from './mock/profileHandlers';

export const api = {
  ...platformApi,
  ...platformSetupApi,
  ...workforceApi,
  ...schedulingApi,
  ...replacementApi,
  ...resourceApi,
  ...systemApi,
  ...reportApi,
  ...placementApi,
  ...disciplinaryApi,
  ...attendanceApi,
  ...profileApi
};

export type Api = typeof api;
export { ApiError };
export const setApiAuth = setAuthContext;

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
