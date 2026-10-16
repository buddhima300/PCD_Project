import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '../../../hooks/useSessionStore';
import { mockBreakApi, resetBreakDemo, breakScenarios } from '../mock';
import { breakApi } from '../api';
import { WorkflowDialog, type Workflow } from '../WorkflowDialog';
import { BreakManagementPage } from '../BreakManagementPage';
import { defaultFilters } from '../contracts';
import { setAuthContext } from '../../../services/mock/core';

function login(role: 'EMPLOYEE' | 'SUPERVISOR' = 'EMPLOYEE') { const user = { id: role === 'EMPLOYEE' ? 'EMP-00421' : 'USR-SUP-001', role, name: role === 'EMPLOYEE' ? 'Arjun Mehta' : 'Leila Haddad', title: role, email: 'demo@example.test' }; useSessionStore.getState().signIn(user); setAuthContext({userId:user.id,role:user.role,name:user.name}); }
function mount(node: React.ReactNode, route = '/my/breaks') { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{node}</MemoryRouter></QueryClientProvider>); return client; }
async function dialog(workflow: Workflow) { const close = vi.fn(); const feedback = vi.fn(); mount(<WorkflowDialog workflow={workflow} onClose={close} onFeedback={feedback} />); await waitFor(() => expect(screen.getByRole('button', { name: 'Review decision' })).toBeEnabled()); return { close, feedback, user: userEvent.setup() }; }
beforeEach(() => { login(); breakScenarios.now = Date.parse('2026-10-11T04:30:00Z'); resetBreakDemo(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); onlineManager.setOnline(true); });
it('requires start confirmation, prevents duplicate submits, and confirms only after adapter result', async () => {
  const spy = vi.spyOn(breakApi, 'execute'); const { user, feedback } = await dialog({ kind: 'start' });
  expect(spy).not.toHaveBeenCalled(); await user.click(screen.getByRole('button', { name: 'Review decision' })); expect(spy).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: 'Confirm Start Break' }); fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.stringContaining('confirmed'), false)); expect(spy).toHaveBeenCalledTimes(1); expect((await mockBreakApi.snapshot()).active).not.toBeNull(); spy.mockRestore();
});
it('requires end confirmation and preserves original start event', async () => {
  const s = await mockBreakApi.snapshot(); await mockBreakApi.execute({ kind: 'start', policyVersion: s.policy.version, shiftDate: s.shift!.date }, 'start'); const active = (await mockBreakApi.snapshot()).active!;
  breakScenarios.now! += 60000; const { user, feedback } = await dialog({ kind: 'end', session: active });
  await user.click(screen.getByRole('button', { name: 'Review decision' })); expect((await mockBreakApi.snapshot()).active).not.toBeNull(); await user.click(screen.getByRole('button', { name: 'Confirm End Break' })); await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.stringContaining('confirmed'), false)); expect((await mockBreakApi.session(active.id)).events.map(e => e.action)).toEqual(['STARTED', 'ENDED']);
});
it('displays active session and disables actions offline', async () => {
  const s = await mockBreakApi.snapshot(); await mockBreakApi.execute({ kind: 'start', policyVersion: s.policy.version, shiftDate: s.shift!.date }, 'start'); mount(<BreakManagementPage />);
  await screen.findByRole('button', { name: 'End Break' }); Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); fireEvent(window, new Event('offline'));
  expect(screen.getByRole('button', { name: 'End Break' })).toBeDisabled(); expect(screen.getByText(/No operations are queued/i)).toBeInTheDocument();
});
it('shows exhausted allowance and validates request reasons', async () => {
  const s = await mockBreakApi.snapshot(); await mockBreakApi.execute({ kind: 'start', policyVersion: s.policy.version, shiftDate: s.shift!.date }, 'start'); const active = (await mockBreakApi.snapshot()).active!; breakScenarios.now! += 61 * 60000; await mockBreakApi.execute({ kind: 'end', id: active.id, version: active.version }, 'end');
  mount(<BreakManagementPage />); const user = userEvent.setup(); await screen.findByRole('button', { name: 'Request Extra Break' }); expect(screen.getByRole('button', { name: 'Start Break' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Request Extra Break' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Review decision' })).toBeEnabled()); await user.click(screen.getByRole('button', { name: 'Review decision' })); expect(screen.getByRole('alert')).toHaveTextContent(/3 character/);
  await user.type(screen.getByLabelText('Reason (required)'), 'Personal need'); await user.click(screen.getByRole('button', { name: 'Review decision' })); await user.click(screen.getByRole('button', { name: 'Confirm Request Extra Break' })); await screen.findByText('Pending');
});
it('requires a reason for overrun review and supports keyboard cancellation with focus restoration', async () => {
  login('SUPERVISOR'); const record = (await mockBreakApi.monitor(defaultFilters)).sessions[0]; const { user, close } = await dialog({ kind: 'review', session: record });
  await user.click(screen.getByRole('button', { name: 'Review decision' })); expect(screen.getByRole('alert')).toBeInTheDocument();
  await user.keyboard('{Escape}'); expect(close).toHaveBeenCalled();
});
it('hides restricted data when access is revoked while open', async () => {
  const client = mount(<BreakManagementPage />); await screen.findByRole('button', { name: 'Start Break' }); breakScenarios.revoked.add('EMP-00421'); await client.invalidateQueries({ queryKey: ['breaks'] });
  await screen.findByText('Your break access has been revoked.'); expect(screen.queryByRole('button', { name: 'Start Break' })).not.toBeInTheDocument(); expect(screen.queryByText('Your session history')).not.toBeInTheDocument();
});
it('reports a lost response without success feedback and reconciles confirmed state', async () => {
  const { user, feedback } = await dialog({ kind: 'start' }); await user.click(screen.getByRole('button', { name: 'Review decision' })); breakScenarios.uncertain = true;
  await user.click(screen.getByRole('button', { name: 'Confirm Start Break' })); await waitFor(() => expect(feedback).toHaveBeenCalledWith(expect.stringContaining('response lost'), true)); expect(feedback).not.toHaveBeenCalledWith(expect.anything(), false); expect((await mockBreakApi.snapshot()).active).not.toBeNull();
});
it('refreshes a concurrent review before allowing another decision', async () => {
  login('SUPERVISOR'); const record = (await mockBreakApi.monitor(defaultFilters)).sessions[0]; const { user } = await dialog({ kind: 'review', session: record }); await user.type(screen.getByLabelText('Reason (required)'), 'Reviewed event context'); await user.click(screen.getByRole('button', { name: 'Review decision' }));
  await mockBreakApi.execute({ kind: 'review', id: record.id, version: record.version, outcome: 'Confirmed', reason: 'Another reviewer confirmed' }, 'other'); await user.click(screen.getByRole('button', { name: 'Confirm Review Overrun' })); await screen.findByText(/Another authorized user changed the record/); expect(screen.queryByRole('button', { name: 'Confirm Review Overrun' })).not.toBeInTheDocument(); expect(screen.getByLabelText('Reason (required)')).toHaveValue('Reviewed event context');
});
it('renders controlled loading and malformed error states', async () => {
  breakScenarios.malformed = true; mount(<BreakManagementPage />); expect(screen.getByRole('status')).toHaveTextContent(/Loading/); await screen.findByText(/Malformed demo response/); expect(screen.queryByRole('button', { name: 'Start Break' })).not.toBeInTheDocument();
});
it('restricts policy configuration to returned capability', async () => {
  login('SUPERVISOR'); mount(<BreakManagementPage />, '/breaks/policy'); await screen.findByRole('button', { name: 'Configure policy' }); expect(within(screen.getByRole('navigation', { name: 'Break Management sections' })).getByRole('link', { name: 'Policy settings' })).toBeInTheDocument();
});
