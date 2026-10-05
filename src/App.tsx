import React, { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { RequireRole } from './components/layout/RequireRole';
import { Login } from './pages/Login';
import type { Role } from './types/domain';

const named = <K extends string,>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardHome = named(() => import('./pages/dashboard/DashboardHome'), 'DashboardHome');
const PlatformOperations = named(() => import('./pages/platforms/PlatformOperations'), 'PlatformOperations');
const PlatformCapacity = named(() => import('./pages/platforms/PlatformCapacity'), 'PlatformCapacity');
const PlatformCategories = named(() => import('./pages/platforms/PlatformCategories'), 'PlatformCategories');
const CategoryDetail = named(() => import('./pages/platforms/CategoryDetail'), 'CategoryDetail');
const Platforms = named(() => import('./pages/platforms/Platforms'), 'Platforms');
const PlatformDetail = named(() => import('./pages/platforms/PlatformDetail'), 'PlatformDetail');
const PlatformConfig = named(() => import('./pages/platforms/PlatformConfig'), 'PlatformConfig');
const Departments = named(() => import('./pages/platforms/Departments'), 'Departments');
const WorkforceOverview = named(() => import('./pages/workforce/WorkforceOverview'), 'WorkforceOverview');
const Employees = named(() => import('./pages/workforce/Employees'), 'Employees');
const EmployeeDetail = named(() => import('./pages/workforce/EmployeeDetail'), 'EmployeeDetail');
const Freelancers = named(() => import('./pages/workforce/Freelancers'), 'Freelancers');
const FreelancerDetail = named(() => import('./pages/workforce/FreelancerDetail'), 'FreelancerDetail');
const Shifts = named(() => import('./pages/scheduling/Shifts'), 'Shifts');
const Rotation = named(() => import('./pages/scheduling/Rotation'), 'Rotation');
const Roster = named(() => import('./pages/scheduling/Roster'), 'Roster');
const OffDays = named(() => import('./pages/scheduling/OffDays'), 'OffDays');
const MyOffDays = named(() => import('./pages/scheduling/MyOffDays'), 'MyOffDays');
const MySchedule = named(() => import('./pages/scheduling/MySchedule'), 'MySchedule');
const MyAvailability = named(() => import('./pages/scheduling/MyAvailability'), 'MyAvailability');
const ReplacementCenter = named(() => import('./pages/replacements/ReplacementCenter'), 'ReplacementCenter');
const ReplacementDetail = named(() => import('./pages/replacements/ReplacementDetail'), 'ReplacementDetail');
const MyAssignments = named(() => import('./pages/replacements/MyAssignments'), 'MyAssignments');
const WorkstationPools = named(() => import('./pages/resources/WorkstationPools'), 'WorkstationPools');
const PoolDetail = named(() => import('./pages/resources/PoolDetail'), 'PoolDetail');
const Laptops = named(() => import('./pages/resources/Laptops'), 'Laptops');
const LaptopDetail = named(() => import('./pages/resources/LaptopDetail'), 'LaptopDetail');
const Handover = named(() => import('./pages/resources/Handover'), 'Handover');
const Incidents = named(() => import('./pages/resources/Incidents'), 'Incidents');
const ReportIssue = named(() => import('./pages/resources/ReportIssue'), 'ReportIssue');
const MyWorkstation = named(() => import('./pages/resources/MyWorkstation'), 'MyWorkstation');
const MyPlatform = named(() => import('./pages/resources/MyPlatform'), 'MyPlatform');
const Notifications = named(() => import('./pages/system/Notifications'), 'Notifications');
const Reports = named(() => import('./pages/system/Reports'), 'Reports');
const AuditLog = named(() => import('./pages/system/AuditLog'), 'AuditLog');
const Settings = named(() => import('./pages/system/Settings'), 'Settings');
const Profile = named(() => import('./pages/system/Profile'), 'Profile');
const NotFound = named(() => import('./pages/system/NotFound'), 'NotFound');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, err) => count < 1 && (err as {status?: number;}).status === 0, refetchOnWindowFocus: false }
  }
});

const OPS: Role[] = ['ADMIN', 'MANAGER'];
const ADMIN: Role[] = ['ADMIN'];
const STAFF: Role[] = ['EMPLOYEE', 'FREELANCER'];
const g = (roles: Role[], el: React.ReactNode) => <RequireRole roles={roles}>{el}</RequireRole>;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardHome />} />
            <Route path="operations" element={g(OPS, <PlatformOperations />)} />
            <Route path="capacity" element={g(OPS, <PlatformCapacity />)} />
            <Route path="categories" element={g(ADMIN, <PlatformCategories />)} />
            <Route path="categories/:code" element={g(ADMIN, <CategoryDetail />)} />
            <Route path="platforms" element={g(OPS, <Platforms />)} />
            <Route path="platforms/:code" element={g(OPS, <PlatformDetail />)} />
            <Route path="platform-config" element={g(ADMIN, <PlatformConfig />)} />
            <Route path="platform-config/:code" element={g(ADMIN, <PlatformConfig />)} />
            <Route path="departments" element={g(ADMIN, <Departments />)} />
            <Route path="positions" element={<Navigate to="/departments?tab=positions" replace />} />
            <Route path="workforce" element={g(ADMIN, <WorkforceOverview />)} />
            <Route path="employees" element={g(OPS, <Employees />)} />
            <Route path="employees/:id" element={g(OPS, <EmployeeDetail />)} />
            <Route path="freelancers" element={g(OPS, <Freelancers />)} />
            <Route path="freelancers/:id" element={g(OPS, <FreelancerDetail />)} />
            <Route path="shifts" element={g(ADMIN, <Shifts />)} />
            <Route path="rotation" element={g(OPS, <Rotation />)} />
            <Route path="roster" element={g(OPS, <Roster />)} />
            <Route path="off-days" element={g(OPS, <OffDays />)} />
            <Route path="replacements" element={g(OPS, <ReplacementCenter />)} />
            <Route path="replacements/:id" element={g(['ADMIN', 'MANAGER', 'FREELANCER'], <ReplacementDetail />)} />
            <Route path="pools" element={g(OPS, <WorkstationPools />)} />
            <Route path="pools/:id" element={g(OPS, <PoolDetail />)} />
            <Route path="laptops" element={g(OPS, <Laptops />)} />
            <Route path="laptops/:assetId" element={g(OPS, <LaptopDetail />)} />
            <Route path="incidents" element={g(OPS, <Incidents />)} />
            <Route path="reports" element={g(OPS, <Reports />)} />
            <Route path="audit" element={g(ADMIN, <AuditLog />)} />
            <Route path="settings" element={g(ADMIN, <Settings />)} />
            <Route path="my/platform" element={g(STAFF, <MyPlatform />)} />
            <Route path="my/schedule" element={g(['EMPLOYEE'], <MySchedule />)} />
            <Route path="my/off-days" element={g(['EMPLOYEE'], <MyOffDays />)} />
            <Route path="my/availability" element={g(['FREELANCER'], <MyAvailability />)} />
            <Route path="my/assignments" element={g(['FREELANCER'], <MyAssignments />)} />
            <Route path="my/workstation" element={g(STAFF, <MyWorkstation />)} />
            <Route path="handover" element={g(STAFF, <Handover />)} />
            <Route path="report-issue" element={g(STAFF, <ReportIssue />)} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'Inter, sans-serif' } }} />
    </QueryClientProvider>);

}