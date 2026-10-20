// Explicit fixture facade for isolated legacy component tests only.
// The application entrypoint and real HTTP adapter never import this module.
import { ApiError } from './core';
import { platformApi } from './platformHandlers';
import { platformSetupApi } from './platformSetupHandlers';
import { resourceApi } from './resourceHandlers';
import { attendanceApi } from './attendanceHandlers';
import { systemApi } from './systemHandlers';
export const api = { ...platformApi, ...platformSetupApi, ...resourceApi, ...attendanceApi, ...systemApi };
export { ApiError };
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
