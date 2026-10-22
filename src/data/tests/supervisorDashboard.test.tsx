import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SupervisorOverview } from '../../pages/dashboard/SupervisorOverview';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api, type OpsDashboard } from '../../services/api';
import { getColomboWeather } from '../../services/weather';
import { useBreakSnapshot, useBreakMonitor } from '../../features/break-management/hooks';

vi.mock('../../services/api',async()=>({ApiError:(await import('../../services/errors')).ApiError,api:{getDashboard:vi.fn()}}));
vi.mock('../../services/weather',()=>({getColomboWeather:vi.fn()}));
vi.mock('../../features/break-management/hooks',()=>({useBreakSnapshot:vi.fn(),useBreakMonitor:vi.fn()}));
const data={kpis:{activePlatforms:1,totalPlatforms:1},platforms:[{code:'KANE-13',categoryCode:'KANE',occupancy:[],totalWorkstations:10,pendingReplacements:0,activeIncidents:0}],analytics:{date:'2026-10-22',currentShift:'NIGHT',serverNow:'2026-10-22T15:00:00Z',shifts:{MORNING:{scheduled:8,target:10,confirmed:7,needsReview:1,devicesHeld:0,capacity:10,vacancies:2},NIGHT:{scheduled:6,target:10,confirmed:4,needsReview:0,devicesHeld:4,capacity:10,vacancies:4}}}} as unknown as OpsDashboard;
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
  useSessionStore.getState().signIn({id:'SUP',name:'Nimal',role:'SUPERVISOR',email:'sup@test.local',title:'Supervisor'});
  vi.mocked(api.getDashboard).mockResolvedValue(data);
  vi.mocked(getColomboWeather).mockResolvedValue({temperature:29,condition:'Partly cloudy',humidity:70,wind:12,observedAt:'2026-10-22T20:15'});
  vi.mocked(useBreakSnapshot).mockReturnValue({enabled:true,isPending:false,isError:false,data:{capabilities:{monitor:true}}} as ReturnType<typeof useBreakSnapshot>);
  vi.mocked(useBreakMonitor).mockImplementation(filters=>({isPending:false,isError:false,data:{activeCount:2,pendingCount:3,overrunCount:1,requestTotal:10,total:filters.status==='ACTIVE'?2:20,serverNow:'2026-10-22T15:00:00Z',sessions:filters.status==='ACTIVE'?[{id:'BR1',workerName:'Amali Perera',platform:'KANE-13',department:'DP',elapsedSeconds:300}]:[]}} as unknown as ReturnType<typeof useBreakMonitor>));
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();useSessionStore.getState().clear();});
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><SupervisorOverview/></MemoryRouter></QueryClientProvider>);}
it('shows a system-time greeting, live break staff, weather and comparable shift charts',async()=>{
  mount();
  expect(screen.getByRole('heading',{name:'Good evening, Nimal'})).toBeInTheDocument();
  expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
  expect(screen.getByText('20:30:00')).toBeInTheDocument();
  expect(screen.getByText('Amali Perera')).toBeInTheDocument();
  expect(screen.getByRole('progressbar',{name:'Pending requests'})).toHaveAttribute('aria-valuenow','3');
  expect(await screen.findByRole('progressbar',{name:'NIGHT Confirmed attendance'})).toHaveAttribute('aria-valuenow','4');
  expect(screen.getByRole('progressbar',{name:'MORNING Confirmed attendance'})).toHaveAttribute('aria-valuenow','7');
  expect(screen.getByRole('heading',{name:'Night shift overview'})).toBeInTheDocument();
  const table=screen.getByRole('table',{name:'Platform operations'});
  expect(within(table).queryByRole('columnheader',{name:'Status'})).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:/Your people. Your platforms./})).toBeInTheDocument();
});
it('shows weather failure honestly while the database metrics remain usable',async()=>{
  vi.mocked(getColomboWeather).mockRejectedValue(new Error('Offline'));
  mount();
  expect(await screen.findByText(/Weather unavailable/,{},{timeout:4000})).toBeInTheDocument();
  expect(screen.getByRole('progressbar',{name:'NIGHT Scheduled workforce'})).toHaveAttribute('aria-valuenow','6');
});

