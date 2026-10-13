import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { platformSetupApi as setup } from '../../services/mock/platformSetupHandlers';
import { platformApi } from '../../services/mock/platformHandlers';
import { placementApi } from '../../services/mock/placementHandlers';
import { db } from '../../services/mock/db';
import { mockConfig, setAuthContext } from '../../services/mock/core';

const category = { code: 'TEST', name: 'Test category', description: 'Test operations' };
const snapshot = structuredClone({ categories: db.categories, platforms: db.platforms, employees: db.employees, freelancers: db.freelancers, trainingAssignments: db.trainingAssignments, candidates: db.candidates, audit: db.audit });
const create = () => setup.createPlatform({ categoryCode: '', category, code: 'TEST-1', name: 'Test platform', description: '' });
const capacity = (seats = 2) => ({ departments: { DP: seats }, staffingTargets: { DP: { MORNING: 1, NIGHT: 0 } } });
const evaluation = { platformKnowledge: 5, departmentKnowledge: 5, processAccuracy: 5, systemUsage: 5, qualityStandards: 5, result: 'PASSED' as const, feedback: 'Qualified' };

beforeEach(() => {
  mockConfig.latencyMs = 0;
  setAuthContext({ role: 'SUPERVISOR', userId: 'USR-SUP-001', name: 'Supervisor' });
  db.candidates.push({ id: 'CND-TEST', name: 'Test trainee', email: 'trainee@example.com', phone: '', interviewDate: '2026-10-13', interviewResult: 'SELECTED', employmentType: 'PERMANENT', dept: 'DP', position: 'Agent', notes: '', status: 'SELECTED', createdAt: '2026-10-13' });
});
afterEach(() => {
  for (const key of Object.keys(snapshot) as (keyof typeof snapshot)[]) {
    const array = db[key] as unknown[]; array.splice(0, array.length, ...structuredClone(snapshot[key]));
  }
  mockConfig.latencyMs = 320; setAuthContext(null);
});

describe('platform setup business workflow', () => {
  it('creates a category and a setup platform atomically and appears in summaries', async () => {
    const p = await create(); expect(p.lifecycle).toBe('SETUP'); expect(p.status).toBe('INACTIVE'); expect(p.opStatus).toBe('SETUP');
    expect((await platformApi.listCategories()).find(c => c.code === 'TEST')?.platformCount).toBe(1);
    expect((await platformApi.listPlatforms({ opStatus: 'SETUP' })).some(p => p.code === 'TEST-1')).toBe(true);
  });
  it('does not save a new category if platform validation fails', async () => {
    await expect(setup.createPlatform({ categoryCode: '', category, code: 'WRONG-1', name: 'Test', description: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(db.categories.some(c => c.code === 'TEST')).toBe(false);
  });
  it('rejects duplicate category names and platform codes', async () => {
    await create(); await expect(setup.createPlatformCategory({ ...category, code: 'OTHER' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    await expect(setup.createPlatform({ categoryCode: 'TEST', code: 'TEST-1', name: 'Other', description: '' })).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
  it('requires seats before activation but does not require staffing', async () => {
    await create(); await expect(setup.activatePlatform('TEST-1')).rejects.toMatchObject({ code: 'VALIDATION' });
    const laptops = db.laptops.length;
    await setup.configurePlatformCapacity('TEST-1', capacity());
    const p = await setup.activatePlatform('TEST-1'); expect(p.status).toBe('ACTIVE'); expect(p.lifecycle).toBe('OPERATIONAL'); expect(p.requiredWorkforce).toBe(1); expect(p.morningWorkforce).toBe(0); expect(db.laptops.length).toBe(laptops);
  });
  it('validates targets before changing capacity and rejects legacy activation bypass', async () => {
    await create(); await expect(setup.configurePlatformCapacity('TEST-1', { departments: { DP: 1 }, staffingTargets: { DP: { MORNING: 2, NIGHT: 0 } } })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(db.platforms.find(p => p.code === 'TEST-1')?.departments).toEqual({});
    await expect(platformApi.updatePlatformConfig('TEST-1', { departments: { DP: 2 }, status: 'ACTIVE', reason: 'Activate it' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('counts training seats separately and blocks duplicate placement and capacity reduction', async () => {
    await create(); await setup.configurePlatformCapacity('TEST-1', capacity(1));
    const p = await setup.assignPlatformWorker('TEST-1', { workerId: 'CND-TEST', kind: 'TRAINING', dept: 'DP', shift: 'MORNING', trainingDays: 1 });
    expect(p.morningWorkforce).toBe(0); expect(p.requiredWorkforce).toBe(1); expect(db.trainingAssignments[0].completedTrainingDays).toBe(0);
    await expect(setup.assignPlatformWorker('TEST-1', { workerId: 'CND-TEST', kind: 'TRAINING', dept: 'DP', shift: 'NIGHT' })).rejects.toMatchObject({ code: 'ASSIGNMENT_CONFLICT' });
    await expect(setup.configurePlatformCapacity('TEST-1', { departments: { WD: 1 }, staffingTargets: { WD: { MORNING: 0, NIGHT: 0 } } })).rejects.toMatchObject({ code: 'CAPACITY_CONFLICT' });
  });
  it('requires completed training and separate promotion on an active platform', async () => {
    await create(); await setup.configurePlatformCapacity('TEST-1', capacity()); await setup.assignPlatformWorker('TEST-1', { workerId: 'CND-TEST', kind: 'TRAINING', dept: 'DP', shift: 'MORNING', trainingDays: 1 });
    const t = db.trainingAssignments[0];
    await expect(placementApi.evaluateTraining(t.id, evaluation)).rejects.toMatchObject({ code: 'VALIDATION' });
    await placementApi.logTrainingProgress(t.id, 1);
    await expect(placementApi.logTrainingProgress(t.id, 1)).rejects.toMatchObject({ code: 'VALIDATION' });
    await placementApi.evaluateTraining(t.id, evaluation);
    expect((await platformApi.getPlatform('TEST-1')).platform.morningWorkforce).toBe(0);
    await expect(setup.promotePlatformTrainee(t.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await setup.activatePlatform('TEST-1'); await setup.promotePlatformTrainee(t.id);
    expect((await platformApi.getPlatform('TEST-1')).platform.morningWorkforce).toBe(1);
    await expect(setup.promotePlatformTrainee(t.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await placementApi.listPlatformDemands()).find(d => d.platformCode === 'TEST-1')?.vacancy).toBe(0);
  });
  it('extends training with new scheduled days and preserves state on invalid extension', async () => {
    await create(); await setup.configurePlatformCapacity('TEST-1', capacity()); await setup.assignPlatformWorker('TEST-1', { workerId: 'CND-TEST', kind: 'TRAINING', dept: 'DP', shift: 'MORNING', trainingDays: 1 });
    const t = db.trainingAssignments[0];
    await expect(placementApi.evaluateTraining(t.id, { ...evaluation, result: 'EXTEND', extensionDays: -1 })).rejects.toMatchObject({ code: 'VALIDATION' }); expect(t.evaluation).toBeNull();
    await placementApi.logTrainingProgress(t.id, 1); await placementApi.evaluateTraining(t.id, { ...evaluation, result: 'EXTEND', extensionDays: 2 }); expect(t.dailyLogs).toHaveLength(3); await placementApi.logTrainingProgress(t.id, 2); expect(t.completedTrainingDays).toBe(2);
  });
  it('restricts creation and configuration to supervisors', async () => {
    await create(); setAuthContext({ role: 'EMPLOYEE', userId: 'EMP-TEST', name: 'Employee' });
    await expect(setup.createPlatformCategory({ ...category, code: 'OTHER' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setup.configurePlatformCapacity('TEST-1', capacity())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
