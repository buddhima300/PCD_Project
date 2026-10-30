import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { IncrementEligibilityPanel,IncrementProgressCard } from '../../components/increment/IncrementExams';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../../services/api';
import type { IncrementEmployee } from '../../types/incrementExams';
vi.mock('../../services/api',()=>({api:{listIncrementEligibility:vi.fn(),getIncrementProgress:vi.fn(),scheduleIncrementExam:vi.fn(),cancelIncrementExam:vi.fn(),setIncrementOpeningBalance:vi.fn()},errorMessage:(e:Error)=>e.message}));
const employee:IncrementEmployee={employeeId:'EMP-1',staffNumber:'EMP-1',name:'Test Employee',department:'DP',platformCode:'P1',appointment:null,appointmentNeedsReview:false,
  progress:{policy:'JOINING_90_V1',threshold:90,joinedAt:'2026-07-01',asOf:'2026-10-23T04:00:00Z',creditedDays:90,remainingDays:0,percent:100,eligible:true,eligibleSince:'2026-09-30',active:true,verificationRequired:false,eligibilityVersion:'a'.repeat(64),
    breakdown:{opening:80,working:5,offDays:4,halfDays:1,excluded:2,unverified:3},baseline:{throughDate:'2026-09-20',creditedDays:80,reason:'Signed attendance ledger',revision:1,valid:true}}};
function mount(element:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});render(<MemoryRouter><QueryClientProvider client={client}>{element}</QueryClientProvider></MemoryRouter>);return client;}
beforeEach(()=>{vi.resetAllMocks();useSessionStore.getState().signIn({id:'SUP',name:'Supervisor',role:'SUPERVISOR',title:'Supervisor',email:'supervisor@test.local'},['attendance.correct']);
  vi.mocked(api.getIncrementProgress).mockResolvedValue(structuredClone(employee));vi.mocked(api.listIncrementEligibility).mockResolvedValue({items:[employee],total:1,page:1,pageSize:8,eligible:1,scheduled:0,serverNow:employee.progress.asOf});});
afterEach(()=>{cleanup();useSessionStore.getState().clear();});
it('shows lifetime progress and appointed exam details in the employee profile',async()=>{
  vi.mocked(api.getIncrementProgress).mockResolvedValue({...employee,appointment:{id:'EXAM-1',startsAt:'2026-11-02T04:30:00Z',location:'Room 2',instructions:'Bring staff ID',status:'SCHEDULED',revision:1,updatedAt:'2026-10-23T04:00:00Z',appointedBy:'Supervisor'}});
  const cache=mount(<IncrementProgressCard/>);
  expect(await screen.findByRole('progressbar',{name:'Increment exam qualifying days'})).toHaveAttribute('aria-valuenow','90');
  expect(screen.getByText('Room 2')).toBeVisible();expect(screen.getByText('Bring staff ID')).toBeVisible();expect(screen.getByText('Signed attendance ledger',{exact:false})).toBeVisible();
  expect(screen.getByText('Lifetime qualifying progress, independent of the attendance date filter below.')).toBeVisible();cache.clear();
});
it('preserves scheduling details on failure and uses an identical idempotency key when retrying',async()=>{
  vi.mocked(api.scheduleIncrementExam).mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue(employee);
  const cache=mount(<IncrementEligibilityPanel/>);
  fireEvent.click(await screen.findByRole('button',{name:'Appoint physical exam'}));
  fireEvent.change(screen.getByLabelText('Physical exam date and time'),{target:{value:'2026-11-02T10:00'}});
  fireEvent.change(screen.getByLabelText('Exam location'),{target:{value:'Colombo Room 2'}});
  fireEvent.change(screen.getByLabelText('Exam details and instructions'),{target:{value:'Bring staff ID'}});
  fireEvent.click(screen.getByRole('button',{name:'Save exam appointment'}));
  await screen.findByText(/Connection interrupted/);expect(screen.getByLabelText('Exam location')).toHaveValue('Colombo Room 2');
  fireEvent.click(screen.getByRole('button',{name:'Save exam appointment'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const calls=vi.mocked(api.scheduleIncrementExam).mock.calls;expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
  expect(calls[0][1]).toMatchObject({startsAt:'2026-11-02T04:30:00.000Z',expectedRevision:0,expectedEligibilityVersion:'a'.repeat(64)});cache.clear();
});
it('requires evidence and half-day precision for verified historical balances',async()=>{
  vi.mocked(api.setIncrementOpeningBalance).mockResolvedValue(employee);
  const cache=mount(<IncrementEligibilityPanel/>);fireEvent.click(await screen.findByRole('button',{name:'Verify historical days'}));
  expect(screen.getByRole('button',{name:'Save verified balance'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Verified qualifying days'),{target:{value:'89.5'}});
  fireEvent.change(screen.getByLabelText('Verification evidence and reason'),{target:{value:'Paper attendance ledger verified'}});
  fireEvent.click(screen.getByRole('button',{name:'Save verified balance'}));
  await waitFor(()=>expect(api.setIncrementOpeningBalance).toHaveBeenCalledWith('EMP-1',expect.objectContaining({creditedDays:89.5,expectedRevision:1})));
  cache.clear();
});
