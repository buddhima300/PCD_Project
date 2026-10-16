import { queryString, request } from './http';
import type { Role } from '../types/domain';

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface WorkerRecord { id: string; worker_number: string; user_id: string | null; name: string; email: string; phone: string; worker_type: 'EMPLOYEE' | 'FREELANCER'; department_code: string; position: string; status: string; lifecycle: string; joined_at: string; revision: number }
export interface CategoryRecord { id: string; code: string; name: string; description: string; status: string }
export interface PlatformRecord { id: string; code: string; category_id: string; category_code: string; name: string; description: string; lifecycle: string; status: string; revision: number }
export interface NotificationRecord { id: string; type: string; title: string; body: string; read_at: string | null; created_at: string }
export interface AuditRecord { id: string; actor_id: string; action: string; entity: string; entity_id: string; details: Record<string, unknown>; created_at: string }
export interface AccountRecord { id: string; name: string; email: string; role: Role; status: string }
export const backend = {
  registerStaff: (body: { name:string; email:string; password:string; phone:string; dept:string; employmentType:'PERMANENT'|'FREELANCER'; position:string; interviewResult:string; notes:string }) => request<{ user: {id:string; name:string; email:string; role:string}; workerId:string; candidate:{id:string;name:string} }>('/staff/register', {method:'POST',body}),
  accountLinks: () => request<{ accounts: { id: string; name: string; email: string; role: string; worker_id: string | null }[]; workers: { id: string; name: string; role: string }[] }>('/operations/links'),
  linkAccount: (userId: string, workerId: string) => request<void>(`/operations/links/${userId}`, { method: 'PUT', body: { workerId } }),
  workers: (page = 1, workerType?: string, unlinked = false) => request<Page<WorkerRecord>>(`/workers${queryString({ page, pageSize: 25, workerType, unlinked })}`),
  createWorker: (body: { workerNumber: string; name: string; email: string; workerType: string; departmentCode: string; joinedAt: string }) => request<WorkerRecord>('/workers', { method: 'POST', body }),
  workerStatus: (worker: WorkerRecord, status: string, reason: string) => request<WorkerRecord>(`/workers/${worker.id}/status`, { method: 'PATCH', body: { status, reason, revision: worker.revision } }),
  categories: (page = 1) => request<Page<CategoryRecord>>(`/platform-categories${queryString({ page, pageSize: 100 })}`),
  createCategory: (body: { code: string; name: string; description: string }) => request<CategoryRecord>('/platform-categories', { method: 'POST', body }),
  platforms: (page = 1) => request<Page<PlatformRecord>>(`/platforms${queryString({ page, pageSize: 25 })}`),
  createPlatform: (body: { code: string; name: string; description: string; categoryId: string }) => request<PlatformRecord>('/platforms', { method: 'POST', body }),
  capacity: (platform: PlatformRecord, departmentCode: string, seats: number, morningTarget: number, nightTarget: number) => request<PlatformRecord>(`/platforms/${platform.id}/capacity`, { method: 'PUT', body: { revision: platform.revision, departments: [{ departmentCode, seats, morningTarget, nightTarget }] } }),
  activate: (platform: PlatformRecord) => request<PlatformRecord>(`/platforms/${platform.id}/activate`, { method: 'POST', body: { revision: platform.revision } }),
  notifications: (page = 1, unreadOnly = false) => request<Page<NotificationRecord>>(`/notifications${queryString({ page, pageSize: 25, unreadOnly })}`),
  read: (id: string) => request<NotificationRecord>(`/notifications/${id}/read`, { method: 'PATCH', body: {} }),
  audit: (page = 1) => request<Page<AuditRecord>>(`/audit${queryString({ page, pageSize: 25 })}`),
  accounts: (page = 1) => request<Page<AccountRecord>>(`/accounts${queryString({ page, pageSize: 25 })}`),
  createAccount: (body: { email: string; password: string; name: string; role: string; workerId?: string; permissions?: string[]; worker?: { workerNumber: string; name: string; email: string; workerType: string; departmentCode: string; joinedAt: string } }) => request<AccountRecord>('/accounts', { method: 'POST', body }),
  access: (id: string, status: string, permissions?: string[]) => request<AccountRecord>(`/accounts/${id}/access`, { method: 'PATCH', body: { status, ...(permissions ? { permissions } : {}) } }),
  departments: () => request<{ items: { code: string; name: string }[] }>('/departments'),
  password: (currentPassword: string, newPassword: string) => request<void>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};
