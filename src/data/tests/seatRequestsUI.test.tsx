import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {UpcomingSeats} from '../../components/freelancer/UpcomingSeats';
import {SeatRequests} from '../../components/replacement/SeatRequests';
import type {SeatRequest,SeatVacancyOverview} from '../../types/seatRequests';
const calls=vi.hoisted(()=>({getMySeatVacancies:vi.fn(),requestVacancySeat:vi.fn(),withdrawSeatRequest:vi.fn(),listSeatRequests:vi.fn(),decideSeatRequest:vi.fn()}));
vi.mock('../../services/api',()=>({api:calls,errorMessage:(e:Error)=>e.message,ApiError:class extends Error{}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const request:SeatRequest={id:'REQ1',replacementId:'R1',freelancerId:'F1',name:'Freelancer One',note:'Ready to cover',version:1,status:'PENDING',createdAt:'2026-10-23T04:30:00Z',platformCode:'P1',dept:'DP',date:'2026-10-25',shift:'MORNING',shiftStart:'2026-10-25T02:00:00Z',shiftEnd:'2026-10-25T14:00:00Z',eligible:true,reasons:[]};
const overview:SeatVacancyOverview={serverNow:'2026-10-23T04:30:00Z',requests:[],vacancies:[{id:'R1',platformCode:'P1',dept:'DP',date:'2026-10-25',shift:'MORNING',shiftStart:request.shiftStart,shiftEnd:request.shiftEnd,eligible:true,reasons:[],request:null}]};
function mount(element:React.ReactNode){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);}
test('freelancer submits a seat request with an optional message, then can withdraw it',async()=>{
 calls.getMySeatVacancies.mockResolvedValue(structuredClone(overview));calls.requestVacancySeat.mockImplementation(async()=>{calls.getMySeatVacancies.mockResolvedValue({...overview,requests:[request],vacancies:[{...overview.vacancies[0],request:{id:'REQ1',status:'PENDING',version:1}}]});return request;});calls.withdrawSeatRequest.mockResolvedValue({...request,status:'WITHDRAWN'});
 mount(<UpcomingSeats month="2026-10"/>);fireEvent.click(await screen.findByRole('button',{name:'Request this seat'}));fireEvent.change(screen.getByLabelText('Message to supervisor (optional)'),{target:{value:'Ready to cover'}});fireEvent.click(screen.getByRole('button',{name:'Send request'}));
 await waitFor(()=>expect(calls.requestVacancySeat).toHaveBeenCalledWith('R1',{note:'Ready to cover'}));fireEvent.click(await screen.findByRole('button',{name:'Withdraw request'}));await waitFor(()=>expect(calls.withdrawSeatRequest).toHaveBeenCalledWith('REQ1',1));
});
test('supervisor sees highlighted interest and allocates the specific version of the request',async()=>{
 calls.listSeatRequests.mockResolvedValue([request]);calls.decideSeatRequest.mockResolvedValue({...request,status:'ALLOCATED'});mount(<SeatRequests replacementId="R1"/>);
 expect(await screen.findByText('Freelancer One')).toBeInTheDocument();expect(screen.getByText('Priority interest')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Allocate seat'}));await waitFor(()=>expect(calls.decideSeatRequest).toHaveBeenCalledWith('REQ1',{version:1,decision:'ALLOCATE'}));
});
test('ineligible vacancies remain visible with a reason and no enabled request action',async()=>{
 calls.getMySeatVacancies.mockResolvedValue({...overview,vacancies:[{...overview.vacancies[0],eligible:false,reasons:['Availability: unavailable']}]});mount(<UpcomingSeats month="2026-10"/>);expect(await screen.findByText('Availability: unavailable')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Request this seat'})).toBeDisabled();
});
