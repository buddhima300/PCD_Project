// Reuse the original design's domain rules on the server, with PostgreSQL as authority.
import { db, exportSequences, importSequences } from '../../../../src/services/mock/db';
import { setAuthContext, mockConfig } from '../../../../src/services/mock/core';
import { demoUsers } from '../../../../src/data/reference';
import { platformApi } from '../../../../src/services/mock/platformHandlers';
import { platformSetupApi } from '../../../../src/services/mock/platformSetupHandlers';
import { workforceApi } from '../../../../src/services/mock/workforceHandlers';
import { schedulingApi } from '../../../../src/services/mock/schedulingHandlers';
import { replacementApi } from '../../../../src/services/mock/replacementHandlers';
import { resourceApi } from '../../../../src/services/mock/resourceHandlers';
import { systemApi } from '../../../../src/services/mock/systemHandlers';
import { reportApi } from '../../../../src/services/mock/reportHandlers';
import { placementApi } from '../../../../src/services/mock/placementHandlers';
import { disciplinaryApi, exportDisciplinaryState, importDisciplinaryState } from '../../../../src/services/mock/disciplinaryHandlers';
import { attendanceApi, useExplicitEquipmentScheduling } from '../../../../src/services/mock/attendanceHandlers';
import { profileApi } from '../../../../src/services/mock/profileHandlers';
import { mockBreakApi, exportBreakState, importBreakState } from '../../../../src/features/break-management/mock';

mockConfig.latencyMs = 0;
useExplicitEquipmentScheduling();
const { login: _login, ...system } = systemApi;
export const methods = { ...platformApi, ...platformSetupApi, ...workforceApi, ...schedulingApi, ...replacementApi, ...resourceApi, ...system, ...reportApi, ...placementApi, ...disciplinaryApi, ...attendanceApi, ...profileApi };
export const breaks = mockBreakApi;
export { setAuthContext };
export { setOperationalClock } from '../../../../src/utils/clock';
export { evaluateCandidates as evaluateReplacementCandidates } from '../../../../src/services/mock/rules';
export function snapshot() {
  const { seq, ...records } = db;
  return { ...records, sequences: exportSequences(), disciplinary: exportDisciplinaryState(), breaks: exportBreakState(), profile: JSON.parse(localStorage.getItem('relay-profile-v1') ?? '{"photos":{},"events":[]}') };
}
export function hydrate(data: ReturnType<typeof snapshot>, supervisors: typeof demoUsers) {
  const { disciplinary, breaks, profile, sequences, ...records } = data;
  // Preserve module references used by shared allocation and audit helpers.
  for (const [key, value] of Object.entries(records)) {
    const target = (db as unknown as Record<string, unknown>)[key];
    if (Array.isArray(target) && Array.isArray(value)) target.splice(0, target.length, ...value);
    else if (target && typeof target === 'object') { for (const entry of Object.keys(target)) delete (target as Record<string, unknown>)[entry]; Object.assign(target, value); }
  }
  importSequences(sequences);
  importDisciplinaryState(disciplinary);
  importBreakState(breaks);
  localStorage.setItem('relay-profile-v1', JSON.stringify(profile));
  demoUsers.splice(0, demoUsers.length, ...supervisors);
}
