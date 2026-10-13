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

beforeEach(() => { useSessionStore.getState().signIn({ id: 'EMP-IN', name: 'Incoming', role: 'EMPLOYEE', title: 'Agent', email: 'incoming@example.com' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useSessionStore.getState().signOut(); });
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

it('lets the incoming worker confirm first and captures the device timestamp without an editable time field', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T19:30:00+05:30'));
  const h = transfer();
  vi.spyOn(api, 'getMyWorkstationHandovers').mockImplementation(async () => ({ tasks: [structuredClone(h)], workstation: null, history: h.receivedAt ? [structuredClone(h)] : [], totalHistory: h.receivedAt ? 1 : 0 }));
  const submit = vi.spyOn(api, 'submitHandoverConfirmation').mockImplementation(async (_id, input) => { h.receivedAt = input.deviceTimestamp; h.status = 'RECEIVED'; h.incomingNotes = input.notes; return structuredClone(h); });
  renderWorker(<MyWorkstation />); await screen.findByRole('button', { name: 'Confirm receipt' });
  expect(screen.queryByLabelText(/receipt time/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Receipt notes (optional)'), { target: { value: 'Laptop received' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith('HO-UI', expect.objectContaining({ direction: 'INCOMING', deviceTimestamp: '2026-10-13T14:00:00.000Z', notes: 'Laptop received' })));
  await screen.findByText(/Your confirmation is saved/); expect(screen.getByText('Pending counterpart')).toBeInTheDocument();
});

it('disables early receipt and requires a reason for the unavailable-worker exception', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T19:14:00+05:30'));
  vi.spyOn(api, 'getMyWorkstationHandovers').mockResolvedValue({ tasks: [transfer()], workstation: null, history: [], totalHistory: 0 });
  renderWorker(<MyWorkstation />); expect(await screen.findByRole('button', { name: 'Confirm receipt' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Outgoing worker unavailable · self-confirm attendance')); expect(screen.getByLabelText('Required reason for self-confirmation')).toBeRequired(); expect(screen.getByRole('button', { name: 'Self-confirm attendance' })).toBeDisabled();
});
