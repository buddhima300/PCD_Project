import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EmployeePlatformAction } from '../../components/placement/EmployeePlatformAction';
import { OffDayBalance } from '../../components/offday/OffDayBalance';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, ApiError } from '../../services/api';
import { ShiftTag } from '../../components/ui/Tags';
import { EmployeeCareerSummary, EmployeeCareerHistory } from '../../components/placement/EmployeeCareer';
import type { Employee } from '../../types/domain';
import type { EmployeeDetail } from '../../services/api';

vi.mock('../../services/api',async () => ({ApiError:(await import('../../services/errors')).ApiError,api:{getEmployeePlatformOptions:vi.fn(),setEmployeePlatform:vi.fn(),unassignEmployeePlatform:vi.fn(),getEmployeeCareerOptions:vi.fn(),promoteEmployee:vi.fn(),getEmployeeReleaseInfo:vi.fn(),verifyEmployeeDeviceReturn:vi.fn()},errorMessage:(e:Error) => e.message}));
const employee={id:'EMP-TEST',name:'Test employee',dept:'DP',shift:'MORNING',platformCode:'',accountStatus:'ACTIVE',status:'ACTIVE'} as Employee;
beforeEach(() => {
  useSessionStore.getState().signIn({id:'SUP',name:'Supervisor',role:'SUPERVISOR',email:'sup@test.local',title:'Supervisor'});
  vi.mocked(api.getEmployeePlatformOptions).mockResolvedValue([{code:'PLAT-1',name:'Platform one',capacity:5,used:2,available:3,usableDevices:5}]);
  vi.mocked(api.setEmployeePlatform).mockResolvedValue({...employee,platformCode:'PLAT-1'});
  vi.mocked(api.unassignEmployeePlatform).mockResolvedValue({...employee,platformCode:''});
  vi.mocked(api.getEmployeeCareerOptions).mockResolvedValue({currentLevel:'STAFF',nextLevel:'PIC',revision:0,hasLinkedAccount:true,hasSupervisorAccess:false,canGrantSupervisorAccess:false,supervisorAccessBlocker:null,blockedReason:null});
  vi.mocked(api.promoteEmployee).mockResolvedValue({employee:{...employee,careerLevel:'PIC',careerRevision:1},supervisorAccessGranted:false});
  vi.mocked(api.getEmployeeReleaseInfo).mockResolvedValue({devices:[],handovers:[],instructions:'Complete the normal outgoing handover in My workstation.'});
});
afterEach(() => {cleanup();vi.clearAllMocks();useSessionStore.getState().clear();});
function mount(element:React.ReactNode) { const qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<QueryClientProvider client={qc}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);return qc; }

it('assigns an unassigned employee from the panel without selecting hardware', async () => {
  mount(<EmployeePlatformAction employee={employee} />);
  fireEvent.click(screen.getByRole('button',{name:'Assign'}));
  await screen.findByRole('option',{name:/PLAT-1/});
  fireEvent.change(screen.getByLabelText('Platform'),{target:{value:'PLAT-1'}});
  fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'New platform staffing'}});
  fireEvent.click(screen.getByRole('button',{name:'Assign platform'}));
  await waitFor(() => expect(api.setEmployeePlatform).toHaveBeenCalledWith('EMP-TEST',{platformCode:'PLAT-1',shift:'MORNING',expectedPlatform:'',reason:'New platform staffing'}));
  await waitFor(() => expect(screen.queryByLabelText('Platform')).not.toBeInTheDocument());
});
it('shows Change for assigned staff and retains input when a concurrent assignment fills capacity', async () => {
  vi.mocked(api.setEmployeePlatform).mockRejectedValueOnce(new Error('No shared device capacity remains for this shift.'));
  mount(<EmployeePlatformAction employee={{...employee,platformCode:'OLD-1'}} />);
  fireEvent.click(screen.getByRole('button',{name:'Change'}));
  await screen.findByRole('option',{name:/PLAT-1/});
  fireEvent.change(screen.getByLabelText('Platform'),{target:{value:'PLAT-1'}});
  fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Rebalance staffing'}});
  fireEvent.click(screen.getByRole('button',{name:'Change platform'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Reason')).toHaveValue('Rebalance staffing');
  expect(screen.getByLabelText('Platform')).toHaveValue('PLAT-1');
});
it('hides supervisor actions for employees and renders an accessible monthly balance', () => {
  useSessionStore.getState().signIn({id:'EMP',name:'Employee',role:'EMPLOYEE',email:'emp@test.local',title:'Agent'});
  mount(<><EmployeePlatformAction employee={employee} /><OffDayBalance detail={{employee,offDayBalance:{month:'2026-10',used:1,allowance:4,remaining:3}} as EmployeeDetail} /></>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(api.getEmployeePlatformOptions).not.toHaveBeenCalled();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','3');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext','3 of 4 off-days remaining');
  expect(screen.getByText('October 2026')).toBeInTheDocument();
});

it('requires a reason before unassignment and keeps input with a relevant blocker link', async () => {
  vi.mocked(api.unassignEmployeePlatform).mockRejectedValueOnce(new ApiError('DEVICE_RETURN_REQUIRED','Return the device currently held.',409));
  mount(<EmployeePlatformAction employee={{...employee,platformCode:'PLAT-1'}} />);
  fireEvent.click(screen.getByRole('button',{name:'Unassign'}));
  expect(screen.getByRole('button',{name:'Confirm unassign'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Unassignment reason'),{target:{value:'Moving to another team'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm unassign'}));
  await screen.findByRole('alert');
  expect(api.unassignEmployeePlatform).toHaveBeenCalledWith(employee.id,{expectedPlatform:'PLAT-1',reason:'Moving to another team'});
  expect(screen.getByLabelText('Unassignment reason')).toHaveValue('Moving to another team');
  expect(screen.getByRole('link',{name:'Review device return'})).toHaveAttribute('href','/equipment');
});

it('unassigns from the current platform and closes the action form on success', async () => {
  mount(<EmployeePlatformAction employee={{...employee,platformCode:'PLAT-1'}} />);
  fireEvent.click(screen.getByRole('button',{name:'Unassign'}));
  fireEvent.change(screen.getByLabelText('Unassignment reason'),{target:{value:'Staffing adjustment'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm unassign'}));
  await waitFor(() => expect(screen.queryByLabelText('Unassignment reason')).not.toBeInTheDocument());
  expect(api.unassignEmployeePlatform).toHaveBeenCalledOnce();
});

it('opens one action at a time and promotes only to the backend-provided next level', async () => {
  mount(<EmployeePlatformAction employee={{...employee,platformCode:'PLAT-1'}} />);
  fireEvent.click(screen.getByRole('button',{name:'Unassign'}));
  fireEvent.click(screen.getByRole('button',{name:'Promote'}));
  await screen.findByLabelText('Promotion reason');
  expect(screen.queryByLabelText('Unassignment reason')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Platform')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Promotion reason'),{target:{value:'Excellent performance review'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm promotion'}));
  await waitFor(() => expect(api.promoteEmployee).toHaveBeenCalledWith(employee.id,{expectedLevel:'STAFF',expectedRevision:0,nextLevel:'PIC',reason:'Excellent performance review',grantSupervisorAccess:false}));
  await waitFor(() => expect(screen.queryByLabelText('Promotion reason')).not.toBeInTheDocument());
});

it('makes SPV access an explicit choice and blocks access while production membership remains', async () => {
  vi.mocked(api.getEmployeeCareerOptions).mockResolvedValue({currentLevel:'TL',nextLevel:'SPV',revision:2,hasLinkedAccount:true,hasSupervisorAccess:false,canGrantSupervisorAccess:true,supervisorAccessBlocker:'Unassign before granting supervisor access.',blockedReason:null});
  mount(<EmployeePlatformAction employee={{...employee,careerLevel:'TL',platformCode:'PLAT-1'}} />);
  fireEvent.click(screen.getByRole('button',{name:'Promote'}));
  const checkbox=await screen.findByLabelText('Grant supervisor dashboard access');
  expect(checkbox).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Promotion reason'),{target:{value:'Ready for supervisor responsibilities'}});
  expect(screen.getByRole('button',{name:'Confirm promotion'})).toBeEnabled();
  fireEvent.click(checkbox);
  expect(screen.getByRole('button',{name:'Confirm promotion'})).toBeDisabled();
  expect(screen.getByText(/Unassign before granting supervisor access/)).toBeInTheDocument();
});

it('shows the career timeline and stops promotion at SPV', () => {
  mount(<><EmployeePlatformAction employee={{...employee,careerLevel:'SPV'}} /><EmployeeCareerSummary employee={{...employee,careerLevel:'PIC'}} /><EmployeeCareerHistory employee={{...employee,careerHistory:[{id:'C1',from:'STAFF',to:'PIC',at:'2026-10-16T07:00:00Z',actorId:'SUP',actorName:'Supervisor',reason:'Leadership review passed',platformCode:'PLAT-1',dept:'DP',supervisorAccessGranted:false}]}} /></>);
  expect(screen.getByRole('button',{name:'Promote'})).toBeDisabled();
  expect(screen.queryByRole('button',{name:'Unassign'})).not.toBeInTheDocument();
  expect(screen.getByText('Platform responsibility needs reassignment.')).toBeInTheDocument();
  expect(screen.getByText('Leadership review passed')).toBeInTheDocument();
});

it('renders fully filled blue morning and red night badges with white text', () => {
  mount(<><ShiftTag shift="MORNING" filled /><ShiftTag shift="NIGHT" filled /></>);
  expect(screen.getByText('Morning')).toHaveClass('bg-blue-700','text-white');
  expect(screen.getByText('Night')).toHaveClass('bg-red-700','text-white');
});
