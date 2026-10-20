import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeLoginToggle } from '../../components/placement/EmployeeLoginToggle';
import { EmployeeReleaseReview } from '../../components/placement/EmployeeReleaseReview';
import { Login } from '../../pages/Login';
import { api, ApiError } from '../../services/api';
import { login } from '../../services/http';
import { useSessionStore } from '../../hooks/useSessionStore';
import type { Employee } from '../../types/domain';

vi.mock('../../services/api',async () => ({ApiError:(await import('../../services/errors')).ApiError,api:{setEmployeeLoginAccess:vi.fn(),getEmployeeReleaseInfo:vi.fn(),verifyEmployeeDeviceReturn:vi.fn()},errorMessage:(e:Error) => e.message}));
vi.mock('../../services/http',async original => ({...await original<typeof import('../../services/http')>(),login:vi.fn()}));
const employee={id:'EMP-ACCESS',name:'Access worker',status:'ACTIVE',accountStatus:'ACTIVE',loginAccess:{hasAccount:true,revision:3,canManage:true,disabledReason:null,changedAt:null}} as Employee;
beforeEach(() => {
  useSessionStore.getState().clear();
  vi.mocked(api.setEmployeeLoginAccess).mockResolvedValue({...employee,accountStatus:'LOCKED'});
  vi.mocked(api.getEmployeeReleaseInfo).mockResolvedValue({devices:[],handovers:[],instructions:'Return the device through My workstation and confirm the outgoing handover.'});
});
afterEach(() => {cleanup();vi.clearAllMocks();useSessionStore.getState().clear();});
function mount(element:React.ReactNode) {
  const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<QueryClientProvider client={qc}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);return qc;
}

it('uses a solid green login switch and stops directory row click/keyboard propagation', async () => {
  const rowClick=vi.fn(),rowKey=vi.fn();
  mount(<div onClick={rowClick} onKeyDown={rowKey}><EmployeeLoginToggle employee={employee} /></div>);
  const toggle=screen.getByRole('switch',{name:'Login access for Access worker'});
  expect(toggle).toBeChecked();expect(toggle).toHaveClass('bg-green-700','text-white');
  fireEvent.keyDown(toggle,{key:'Enter'});expect(rowKey).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(api.setEmployeeLoginAccess).toHaveBeenCalledWith('EMP-ACCESS',{enabled:false,expectedRevision:3}));
  expect(rowClick).not.toHaveBeenCalled();
});

it('uses a solid red blocked switch and enables the existing account', async () => {
  mount(<EmployeeLoginToggle employee={{...employee,accountStatus:'LOCKED'}} />);
  const toggle=screen.getByRole('switch');expect(toggle).not.toBeChecked();expect(toggle).toHaveClass('bg-red-700','text-white');
  fireEvent.click(toggle);
  await waitFor(() => expect(api.setEmployeeLoginAccess).toHaveBeenCalledWith('EMP-ACCESS',{enabled:true,expectedRevision:3}));
});

it('disables the switch for missing or protected logins without provisioning a new account', () => {
  mount(<EmployeeLoginToggle employee={{...employee,loginAccess:{hasAccount:false,revision:0,canManage:false,disabledReason:'No linked login.',changedAt:null}}} />);
  expect(screen.getByRole('switch')).toBeDisabled();expect(screen.getByText('No login')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch'));expect(api.setEmployeeLoginAccess).not.toHaveBeenCalled();
});

it('refreshes canonical status after a stale login-access request fails', async () => {
  vi.mocked(api.setEmployeeLoginAccess).mockRejectedValueOnce(new ApiError('CONCURRENCY_CONFLICT','Login access changed.',409));
  const qc=mount(<EmployeeLoginToggle employee={employee} />),refresh=vi.spyOn(qc,'invalidateQueries');
  fireEvent.click(screen.getByRole('switch'));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(screen.getByRole('switch')).toBeChecked();
});

it('shows device custody without pending counterpart actions', async () => {
  vi.mocked(api.getEmployeeReleaseInfo).mockResolvedValue({devices:[{assetId:'LAP-1',workstationId:'WS-1',poolId:'POOL-1',canVerifyReturn:false,reviewBlocker:'Complete the current shift handover.'}],handovers:[{id:'HO-1',assetId:'LAP-1',poolId:'POOL-1',scheduledAt:'2026-10-16T19:30:00+05:30',incomingName:'Incoming',outgoingName:'Outgoing',needsReceipt:true,needsOutgoing:true}],instructions:'Open My workstation and confirm outgoing handover.'});
  mount(<EmployeeReleaseReview employeeId={employee.id} onBusy={vi.fn()} />);
  await screen.findByText('Currently held: LAP-1 · WS-1');
  expect(screen.queryByText('HO-1 · LAP-1')).not.toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'Review this handover'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Review physical return'})).not.toBeInTheDocument();
});

it('requires physical verification and a reason for a legacy return review', async () => {
  vi.mocked(api.getEmployeeReleaseInfo).mockResolvedValue({devices:[{assetId:'LAP-OLD',workstationId:'WS-OLD',poolId:'POOL-1',canVerifyReturn:true,reviewBlocker:null}],handovers:[],instructions:'Legacy custody needs a physical return review.'});
  vi.mocked(api.verifyEmployeeDeviceReturn).mockImplementation(async () => {vi.mocked(api.getEmployeeReleaseInfo).mockResolvedValue({devices:[],handovers:[],instructions:''});return {assetId:'LAP-OLD',returnedAt:'2026-10-16T12:00:00Z'};});
  mount(<EmployeeReleaseReview employeeId={employee.id} onBusy={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button',{name:'Review physical return'}));
  const submit=screen.getByRole('button',{name:'Record verified return'});expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Return review reason'),{target:{value:'Device physically checked and returned'}});
  expect(submit).toBeDisabled();fireEvent.click(screen.getByLabelText('I verified that this device was physically returned'));
  fireEvent.click(submit);
  await waitFor(() => expect(api.verifyEmployeeDeviceReturn).toHaveBeenCalledWith(employee.id,{assetId:'LAP-OLD',reason:'Device physically checked and returned',physicallyReturned:true}));
  await screen.findByText('No device is currently held by this employee.');
});

it('displays the supervisor-unlock message when valid credentials belong to a deactivated account', async () => {
  vi.mocked(login).mockRejectedValueOnce(new ApiError('ACCOUNT_BLOCKED','Your account is temporarily blocked or deactivated. Please contact your Supervisor to review and unlock your account.',403));
  mount(<Login />);
  fireEvent.change(screen.getByLabelText('Work email'),{target:{value:'worker@test.local'}});
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'Valid-password-42'}});
  fireEvent.click(screen.getByRole('button',{name:'Login'}));
  await screen.findByText('Your account is temporarily blocked or deactivated. Please contact your Supervisor to review and unlock your account.');
  expect(useSessionStore.getState().user).toBeNull();
});
