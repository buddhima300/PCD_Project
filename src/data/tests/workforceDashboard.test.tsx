import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkforceDashboardPanels } from '../../pages/dashboard/WorkforceDashboardPanels';
import type { DashboardWorkforce } from '../../types/dashboard';
afterEach(cleanup);
const data:DashboardWorkforce={today:'2026-10-30',from:'2026-10-01',to:'2026-10-30',attendance:{MORNING:{assigned:10,confirmed:8},NIGHT:{assigned:6,confirmed:3}},absences:[{employeeId:'E1',name:'Amali',platformCode:'KANE-13',dept:'DP',frequency:2,dates:['2026-10-20','2026-10-28']}],absenceTrend:[{date:'2026-10-28',count:1},{date:'2026-10-29',count:0}],absenceHistogram:[{label:'1',count:0},{label:'2',count:1}],offDays:[{employeeId:'E2',name:'Nimal',platformCode:'JAX-4',dept:'WD',shift:'MORNING'}],nextWeek:{from:'2026-10-31',to:'2026-11-06',platforms:[{platformCode:'KANE-13',slots:2,hours:18,dates:['2026-10-31','2026-11-02'],departments:['DP']}],trend:[{date:'2026-10-31',count:1},{date:'2026-11-01',count:0}]}};
it('shows attendance ratios, absence frequencies, today off-days and next-week uncovered platforms with accessible charts',()=>{
  render(<MemoryRouter><WorkforceDashboardPanels data={data} current="NIGHT" rosterDate="2026-10-29"/></MemoryRouter>);
  expect(screen.getByRole('progressbar',{name:'MORNING employee attendance'})).toHaveAttribute('aria-valuetext','8 confirmed out of 10 assigned employees');
  expect(screen.getByRole('progressbar',{name:'NIGHT employee attendance'})).toHaveAttribute('aria-valuenow','3');
  const absenceTable=screen.getByRole('table',{name:'Employees with recorded absences'});
  expect(within(absenceTable).getByText('Amali')).toBeInTheDocument();expect(within(absenceTable).getByText('2')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Nimal'})).toHaveAttribute('href','/employees/E2');
  expect(screen.getByText('2 uncovered shifts · 18 hours')).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Daily recorded absence trend'})).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Absence days per employee distribution'})).toBeInTheDocument();
  expect(screen.getByRole('img',{name:"Today's approved off-days by department"})).toBeInTheDocument();
});
it('shows zero and unavailable states without inventing absences or replacements',()=>{
  render(<MemoryRouter><WorkforceDashboardPanels data={{...data,absences:[],offDays:[],attendance:{MORNING:{assigned:0,confirmed:0},NIGHT:{assigned:2,confirmed:null}},nextWeek:{...data.nextWeek,platforms:[]}}} current="MORNING" rosterDate="2026-10-29"/></MemoryRouter>);
  expect(screen.getByText('No recorded absences in this period.')).toBeInTheDocument();
  expect(screen.getByText('No approved off-days for today.')).toBeInTheDocument();
  expect(screen.getByText('No uncovered replacements in the next seven days.')).toBeInTheDocument();
  expect(screen.getByRole('progressbar',{name:'NIGHT employee attendance'})).toHaveAttribute('aria-valuetext','Attendance unavailable');
});
