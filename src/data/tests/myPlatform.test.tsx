import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MyPlatform} from '../../pages/resources/MyPlatform';
import type {MyPlatformOverview} from '../../types/myPlatform';
const get=vi.hoisted(()=>vi.fn());
vi.mock('../../services/api',()=>({api:{getMyPlatformOverview:get},ApiError:class extends Error {}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const data:MyPlatformOverview={serverNow:'2026-10-23T04:30:00Z',today:'2026-10-23',live:{date:'2026-10-23',shift:'MORNING'},person:{name:'Alex',dept:'DP'},assignment:{platformCode:'P1',dept:'DP',shift:'MORNING',kind:'TRAINEE',training:{completed:3,required:10,start:'2026-10-20',end:'2026-11-01'}},platform:{code:'P1',name:'Platform One',description:'Operations floor',category:'Category A',status:'ACTIVE',lifecycle:'OPERATIONAL'},team:[{id:'E1',name:'Alex',dept:'DP',shift:'MORNING',kind:'TRAINEE',self:true,status:'Training'}],departments:[],breaks:[{id:'B1',workerId:'E2',name:'Blair',dept:'DP',startedAt:'2026-10-23T04:20:00Z',endedAt:null,seconds:600,active:true}],offDays:[{id:'O1',name:'Casey',dept:'DP',date:'2026-10-24',shift:'NIGHT'}]};
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});render(<QueryClientProvider client={client}><MyPlatform/></QueryClientProvider>);}
test('trainee overview displays training, live breaks and approved off-days',async()=>{
 get.mockResolvedValue(structuredClone(data));mount();
 expect(await screen.findByText('Platform One')).toBeInTheDocument();
 expect(screen.getByText('Trainee · platform training')).toBeInTheDocument();
 expect(screen.getByRole('progressbar',{name:'Training days completed'})).toHaveAttribute('value','3');
 expect(screen.getByText('Blair')).toBeInTheDocument();expect(screen.getByText('On break')).toBeInTheDocument();expect(screen.getByText('Casey')).toBeInTheDocument();expect(screen.getByText('You')).toBeInTheDocument();
});
test('unassigned staff see placement guidance without a fabricated platform',async()=>{
 get.mockResolvedValue({...data,assignment:null,platform:null});mount();expect(await screen.findByText('No current platform assignment')).toBeInTheDocument();expect(screen.queryByText('Platform colleagues')).not.toBeInTheDocument();
});
