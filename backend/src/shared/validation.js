import { z } from 'zod';

export const roles = z.enum(['SUPERVISOR', 'EMPLOYEE', 'FREELANCER']);
export const permission = z.enum(['accounts.manage','audit.read','disciplinary.approve','breaks.policy','breaks.review','reports.export','attendance.correct']);
export const password = z.string().min(12).max(128);
export const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
export const uuid = z.string().uuid();
export const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const text = z.string().trim().min(1).max(200);
