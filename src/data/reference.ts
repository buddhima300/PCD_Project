import type { Department, DeptCapacity, DeptCode, EntityStatus, PlatformCategory, SessionUser, ShiftDefinition } from '../types/domain';

export const categorySeeds: PlatformCategory[] = [
{ id: 'CAT-KANE', code: 'KANE', name: 'KANE', description: 'Primary sportsbook back-office platforms serving APAC brands.', status: 'ACTIVE', createdAt: '2023-02-14', updatedAt: '2026-08-30' },
{ id: 'CAT-JAX', code: 'JAX', name: 'JAX', description: 'Casino payments and player-account operations.', status: 'ACTIVE', createdAt: '2023-06-02', updatedAt: '2026-09-12' },
{ id: 'CAT-REX', code: 'REX', name: 'REX', description: 'Live-casino cashier and risk operations.', status: 'ACTIVE', createdAt: '2024-01-18', updatedAt: '2026-07-21' },
{ id: 'CAT-IRIS', code: 'IRIS', name: 'IRIS', description: 'Lottery and instant-win back-office platforms.', status: 'ACTIVE', createdAt: '2024-05-09', updatedAt: '2026-09-03' },
{ id: 'CAT-ZANE', code: 'ZANE', name: 'ZANE', description: 'Emerging-market pilot platforms.', status: 'ACTIVE', createdAt: '2025-03-27', updatedAt: '2026-09-19' }];


export interface PlatformSeed {
  code: string;
  categoryCode: string;
  status: EntityStatus;
  departments: DeptCapacity;
  updatedAt: string;
}

export const platformSeeds: PlatformSeed[] = [
{ code: 'KANE-1', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 4, WD: 4 }, updatedAt: '2026-06-11' },
{ code: 'KANE-2', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 3, SAFETY: 1 }, updatedAt: '2026-07-02' },
{ code: 'KANE-7', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 6, WD: 5, SAFETY: 2 }, updatedAt: '2026-08-19' },
{ code: 'KANE-13', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 5, WD: 5 }, updatedAt: '2026-09-08' },
{ code: 'KANE-14', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 3 }, updatedAt: '2026-05-30' },
{ code: 'KANE-20', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 2, DP: 6, WD: 6, SAFETY: 1 }, updatedAt: '2026-09-15' },
{ code: 'KANE-25', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 2, WD: 2 }, updatedAt: '2026-04-22' },
{ code: 'KANE-30', categoryCode: 'KANE', status: 'ACTIVE', departments: { GS: 1, DP: 4, WD: 3 }, updatedAt: '2026-08-01' },
{ code: 'JAX-1', categoryCode: 'JAX', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 2 }, updatedAt: '2026-03-14' },
{ code: 'JAX-4', categoryCode: 'JAX', status: 'ACTIVE', departments: { GS: 1, DP: 4, WD: 2 }, updatedAt: '2026-09-12' },
{ code: 'JAX-7', categoryCode: 'JAX', status: 'ACTIVE', departments: { GS: 1, DP: 5, WD: 4, SAFETY: 1 }, updatedAt: '2026-07-28' },
{ code: 'JAX-10', categoryCode: 'JAX', status: 'ACTIVE', departments: { GS: 1, DP: 2, WD: 2 }, updatedAt: '2026-06-05' },
{ code: 'JAX-15', categoryCode: 'JAX', status: 'INACTIVE', departments: { GS: 1, DP: 3, WD: 3 }, updatedAt: '2026-08-26' },
{ code: 'REX-1', categoryCode: 'REX', status: 'ACTIVE', departments: { GS: 1, DP: 4, WD: 4, SAFETY: 1 }, updatedAt: '2026-07-21' },
{ code: 'REX-3', categoryCode: 'REX', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 2 }, updatedAt: '2026-05-17' },
{ code: 'REX-6', categoryCode: 'REX', status: 'ACTIVE', departments: { DP: 3, WD: 3 }, updatedAt: '2026-06-30' },
{ code: 'REX-12', categoryCode: 'REX', status: 'ACTIVE', departments: { GS: 1, DP: 2, WD: 2 }, updatedAt: '2026-09-01' },
{ code: 'IRIS-1', categoryCode: 'IRIS', status: 'ACTIVE', departments: { GS: 2, DP: 5, WD: 5, SAFETY: 2 }, updatedAt: '2026-09-03' },
{ code: 'IRIS-2', categoryCode: 'IRIS', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 3 }, updatedAt: '2026-04-09' },
{ code: 'IRIS-5', categoryCode: 'IRIS', status: 'ACTIVE', departments: { GS: 1, DP: 4, WD: 3 }, updatedAt: '2026-08-14' },
{ code: 'IRIS-9', categoryCode: 'IRIS', status: 'ACTIVE', departments: { GS: 1, DP: 2, WD: 1 }, updatedAt: '2026-07-07' },
{ code: 'ZANE-1', categoryCode: 'ZANE', status: 'ACTIVE', departments: { GS: 1, DP: 3, WD: 2 }, updatedAt: '2026-09-19' },
{ code: 'ZANE-2', categoryCode: 'ZANE', status: 'ACTIVE', departments: { GS: 1, DP: 2, WD: 2 }, updatedAt: '2026-08-08' },
{ code: 'ZANE-4', categoryCode: 'ZANE', status: 'INACTIVE', departments: { GS: 1, DP: 2, WD: 1 }, updatedAt: '2026-09-10' }];


export const departmentSeeds: Department[] = [
{ code: 'GS', name: 'Accounts', description: 'Player account verification, KYC checks and account servicing.' },
{ code: 'DP', name: 'Deposits', description: 'Deposit processing, payment matching and top-up exceptions.' },
{ code: 'WD', name: 'Withdrawals', description: 'Withdrawal approval, payout processing and limits review.' },
{ code: 'SAFETY', name: 'Safety', description: 'Fraud screening, responsible-gaming and risk monitoring.' }];


export const positionsByDept: Record<DeptCode, [string, string]> = {
  GS: ['Accounts Officer', 'Senior Accounts Officer'],
  DP: ['Deposit Agent', 'Senior Deposit Agent'],
  WD: ['Withdrawal Agent', 'Senior Withdrawal Agent'],
  SAFETY: ['Safety Analyst', 'Senior Safety Analyst']
};

export const shiftDefinitions: ShiftDefinition[] = [
{ code: 'MORNING', label: 'Morning', start: '07:30', end: '19:30', crossesMidnight: false },
{ code: 'NIGHT', label: 'Night', start: '19:30', end: '07:30', crossesMidnight: true }];


export const demoUsers: SessionUser[] = [
{ id: 'USR-ADM-001', role: 'ADMIN', name: 'Leila Haddad', title: 'System Administrator', email: 'leila.haddad@relayops.com' },
{ id: 'USR-MGR-014', role: 'MANAGER', name: 'Daniel Mwangi', title: 'Shift Manager', email: 'daniel.mwangi@relayops.com' },
{ id: 'EMP-00421', role: 'EMPLOYEE', name: 'Arjun Mehta', title: 'Deposit Agent', email: 'arjun.mehta@relayops.com' },
{ id: 'FL-00124', role: 'FREELANCER', name: 'Sofia Reyes', title: 'Freelancer · Deposits', email: 'sofia.reyes@relayops.com' }];


export const firstNames = [
'Maria', 'Jose', 'Angelica', 'Mark', 'Kristine', 'John', 'Rhea', 'Paolo', 'Janelle', 'Carlo', 'Bea', 'Miguel', 'Trisha', 'Nathan', 'Camille',
'Rafael', 'Lea', 'Andrei', 'Joy', 'Kevin', 'Aira', 'Vincent', 'Nicole', 'Ramon', 'Ella', 'Samuel', 'Grace', 'Adrian', 'Mae', 'Daniel',
'Hana', 'Tomas', 'Iris', 'Leo', 'Nina', 'Oscar', 'Pia', 'Ruben', 'Sara', 'Victor', 'Wen', 'Yusuf', 'Zara', 'Ian', 'Lara'];


export const lastNames = [
'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Navarro',
'Domingo', 'Flores', 'Gonzales', 'Lim', 'Tan', 'Chua', 'Nguyen', 'Pham', 'Sok', 'Chan', 'Lopez', 'Rivera', 'Dizon', 'Salazar', 'Pascual',
'Soriano', 'Valdez', 'Manalo', 'Perez', 'Morales', 'Aguilar', 'Del Rosario'];


export const laptopModels = ['Lenovo ThinkPad T14 Gen 4', 'Dell Latitude 5440', 'HP EliteBook 840 G10'];

export const incidentCategories = ['Screen damage', 'Keyboard fault', 'Battery / power', 'Network adapter', 'Physical damage', 'Missing peripheral', 'Software / OS'];