import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShiftClock } from '../../components/layout/ShiftClock';
import { SwitchWorkerButton } from '../../components/resources/SwitchWorkerButton';
import { MyWorkstation } from '../../pages/resources/MyWorkstation';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import type { Handover } from '../../types/domain';
vi.mock('../../services/api', () => import('../../services/mock/testFacade'));

beforeEach(() => { useSessionStore.getState().signIn({ id: 'EMP-IN', name: 'Incoming', role: 'EMPLOYEE', title: 'Agent', email: 'incoming@example.com' }); vi.spyOn(useSessionStore.getState(),'signOut').mockImplementation(async()=>useSessionStore.getState().clear()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useSessionStore.getState().clear(); });
function renderWorker(element: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/my/workstation']}><Routes><Route path="/my/workstation" element={element} /><Route path="/login" element={<p>Next worker sign-in</p>} /></Routes></MemoryRouter></QueryClientProvider>); return qc;
}
function transfer(): Handover { return { id: 'HO-UI', assetId: 'LAP-UI', workstationId: 'WS-UI', poolId: 'POOL-UI', platformCode: 'KANE-1', dept: 'DP', incomingId: 'EMP-IN', incomingName: 'Incoming', outgoingId: 'EMP-OUT', outgoingName: 'Outgoing', incomingShift: 'NIGHT', outgoingShift: 'MORNING', scheduledAt: '2026-10-13T19:30:00+05:30', status: 'PENDING', receivedAt: null, outgoingConfirmedAt: null, checklist: null, incidentId: null }; }

it('updates the device clock and changes shifts at the exact boundary', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T19:29:59+05:30')); render(<ShiftClock />);
  expect(screen.getByText('19:29:59')).toBeInTheDocument(); expect(screen.getByText('Morning shift')).toBeInTheDocument();
  vi.setSystemTime(new Date('2026-10-13T19:30:00+05:30'));
  // A visibility event also refreshes clocks after a suspended browser tab resumes.
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.getByText('19:30:00')).toBeInTheDocument(); expect(screen.getByText('Night shift')).toBeInTheDocument();
});

it('switches workers by removing the session, remembered identity and query data before login', async () => {
  const qc = new QueryClient(); qc.setQueryData(['private-employee-data'], { secret: 'old worker' }); localStorage.setItem('portcity-login-email', 'old@example.com');
  renderWorker(<SwitchWorkerButton />, qc); fireEvent.click(screen.getByRole('button', { name: 'Switch worker' }));
  await screen.findByText('Next worker sign-in'); expect(useSessionStore.getState().user).toBeNull(); expect(qc.getQueryCache().getAll()).toHaveLength(0); expect(localStorage.getItem('portcity-login-email')).toBeNull();
});

it('shows shared devices without pending receipt or handover actions', async () => {
  vi.spyOn(api,'getMyWork').mockResolvedValue({person:{id:'EMP-IN',dept:'DP'},platform:{code:'JAX-15'}} as any);
  const retired=vi.spyOn(api,'getMyWorkstationHandovers');
  renderWorker(<MyWorkstation />);
  await screen.findByText('JAX-15 · DP');
  expect(screen.queryByRole('button',{name:'Confirm receipt'})).not.toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'Report an equipment issue'})).not.toBeInTheDocument();
  expect(screen.getByText(/Contact your supervisor for equipment support/)).toBeInTheDocument();
  expect(retired).not.toHaveBeenCalled();
});
