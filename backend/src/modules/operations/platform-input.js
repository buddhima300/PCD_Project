import { z } from 'zod';

const code = z.string().trim().min(1).max(40);
const description = z.string().trim().max(1000);
const category = z.object({ code:z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,11}$/), name:z.string().trim().min(1).max(120), description }).strict();
const department = z.enum(['GS','DP','WD','SAFETY']);
const shift = z.enum(['MORNING','NIGHT']);
const count = z.number().int().min(0).max(10000);
const departments = z.object({ GS:count.optional(), DP:count.optional(), WD:count.optional(), SAFETY:count.optional() }).strict();
const target = z.object({ MORNING:count.default(0), NIGHT:count.default(0) }).strict();
const targets = z.object({ GS:target.optional(), DP:target.optional(), WD:target.optional(), SAFETY:target.optional() }).strict();
const schemas = {
  createPlatformCategory:z.tuple([category]),
  createPlatform:z.tuple([z.object({ categoryCode:code.or(z.literal('')), code, name:z.string().trim().min(1).max(120), description, category:category.optional() }).strict()]),
  configurePlatformCapacity:z.tuple([code,z.object({ departments, staffingTargets:targets, expectedRevision:z.number().int().positive().optional() }).strict()]),
  updatePlatformConfig:z.tuple([code,z.object({ departments, status:z.enum(['ACTIVE','INACTIVE']), reason:z.string().trim().min(5).max(2000), expectedRevision:z.number().int().positive().optional() }).strict()]),
  assignPlatformWorker:z.tuple([code,z.object({ workerId:z.string().min(1).max(100), kind:z.enum(['PRODUCTION','TRAINING']), dept:department, shift, trainingDays:z.number().int().min(1).max(90).optional(),trainingNotes:z.string().trim().max(2000).optional() }).strict()]),
  activatePlatform:z.tuple([code]), promotePlatformTrainee:z.tuple([z.string().min(1).max(100)]),
  listPlatformAssignmentOptions:z.tuple([code,department]),
};
export const platformCommands = new Set(['createPlatformCategory','createPlatform','configurePlatformCapacity','updatePlatformConfig','assignPlatformWorker','activatePlatform','promotePlatformTrainee']);
export function validatePlatformArguments(method, args) { return schemas[method] ? schemas[method].parse(args) : args; }
