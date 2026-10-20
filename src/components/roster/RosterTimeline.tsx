import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpRightIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RosterDay, RosterPerson } from '../../types/roster';
import { leaveLabels } from '../../types/roster';
import { cn } from '../../utils/cn';

export const dayLabel = (day:RosterDay) => day.scheduled===false?'Not scheduled':day.kind ? leaveLabels[day.kind] : day.state==='REPLACED'?'Covered absence':day.state==='ABSENT'?'Absent':'Working';
const compactLabel = (day:RosterDay) => day.scheduled===false?'—':day.kind==='HALF_DAY'?'½ day':day.kind==='EIGHT_HOUR'?'8h':day.kind==='ANNUAL_LEAVE'?'Annual':day.kind==='MEDICAL_LEAVE'?'Medical':day.kind==='CASUAL_LEAVE'?'Casual':day.kind==='OFF_DAY'||day.state==='OFF'?'Off':day.state==='ABSENT'?'Absent':'Work';
export const dayTone = (day:RosterDay) => day.scheduled===false?'unscheduled':day.kind==='OFF_DAY'||day.state==='OFF'?'off':day.kind==='EIGHT_HOUR'?'short':day.kind==='HALF_DAY'?'half':day.kind==='INFORMED_ABSENCE'||day.state==='ABSENT'?'absent':day.kind?'leave':day.state==='REPLACED'?'covered':'working';
export const dateLabel=(date:string,options:Intl.DateTimeFormatOptions={month:'short',day:'numeric'}) => new Intl.DateTimeFormat('en',{...options,timeZone:'Asia/Colombo'}).format(new Date(`${date}T12:00:00Z`));
export const timeLabel=(instant:string) => new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Colombo'}).format(new Date(instant));

interface Props { days:string[]; rows:RosterPerson[]; today:string; selectedDate:string; onSelect:(date:string,person?:RosterPerson)=>void }
export function RosterTimeline({days,rows,today,selectedDate,onSelect}:Props) {
  const scroll=useRef<HTMLDivElement>(null);
  const virtual=useVirtualizer({count:rows.length,getScrollElement:()=>scroll.current,estimateSize:()=>76,overscan:6});
  const template=`244px repeat(${days.length}, 66px)`;
  const bands=useMemo(()=>rows.map(row=>{
    const result:{start:number;end:number;day:RosterDay}[]=[];
    row.cells.forEach((day,index)=>{const last=result.at(-1);if(last&&dayTone(day)===dayTone(last.day)&&day.kind===last.day.kind&&day.state===last.day.state&&day.shift===last.day.shift&&day.pending.join()===last.day.pending.join()&&!!day.uncoveredHours===!!last.day.uncoveredHours&&day.replacement?.id===last.day.replacement?.id)last.end=index;else result.push({start:index,end:index,day});});return result;
  }),[rows]);
  return <div ref={scroll} className="roster-scroll scroll-thin" tabIndex={0} aria-label="Employee schedule timeline. Scroll horizontally to view all dates.">
    <div style={{minWidth:244+days.length*66}}>
      <div className="roster-timeline-heading" style={{gridTemplateColumns:template}}>
        <div className="roster-person-heading"><span>TEAM MEMBER</span><span>{rows.length} people</span></div>
        {days.map(date=><button key={date} className={cn('roster-date',date===today&&'is-today',date===selectedDate&&'is-selected')} aria-pressed={date===selectedDate} onClick={()=>onSelect(date)}><span>{dateLabel(date,{weekday:'short'})}</span><strong>{date.slice(-2)}</strong></button>)}
      </div>
      {!rows.length&&<p className="p-10 text-sm text-ink-muted">No employees match these filters.</p>}
      <div style={{height:virtual.getTotalSize(),position:'relative'}}>
        {virtual.getVirtualItems().map(item=>{const row=rows[item.index];return <div key={row.employeeId} className="roster-timeline-row" style={{height:item.size,transform:`translateY(${item.start}px)`,gridTemplateColumns:template}}>
          <div className="roster-person"><span className="roster-avatar" aria-hidden>{row.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><div className="min-w-0"><Link to={`/employees/${row.employeeId}`} className="flex items-center gap-1 truncate text-sm font-medium">{row.name}<ArrowUpRightIcon className="h-3 w-3 shrink-0 opacity-50"/></Link><p className="mt-1 truncate text-[11px] text-ink-muted">{row.platformCode} <span className="mx-1 opacity-40">/</span> {row.dept}</p></div></div>
          {row.cells.map((day,index)=><button key={day.date} style={{gridColumn:index+2}} className={cn('roster-track',day.date===selectedDate&&'is-selected')} onClick={()=>onSelect(day.date,row)} aria-label={`${row.name}, ${dateLabel(day.date)}, ${dayLabel(day)}, ${day.workingHours} working hours${day.pending.length?', request pending':''}`}/>)}
          {bands[item.index].map(band=><div key={band.start} className={cn('roster-band',`roster-tone-${dayTone(band.day)}`,band.day.pending.length>0&&'has-pending')} style={{gridColumn:`${band.start+2} / ${band.end+3}`,gridRow:1}} aria-hidden>
            {band.end>band.start&&(band.day.shift==='MORNING'?<SunIcon className="h-3 w-3 shrink-0"/>:<MoonIcon className="h-3 w-3 shrink-0"/>)}
            <span className="truncate">{band.end===band.start?compactLabel(band.day):`${dayLabel(band.day)}${band.day.uncoveredHours>0?' · needs cover':''}`}</span>
            {band.end>band.start&&<span className="ml-auto shrink-0 opacity-60">{band.end-band.start+1}d</span>}
            {band.day.pending.length>0&&<span className="roster-pending-dot"/>}
          </div>)}
        </div>;})}
      </div>
    </div>
  </div>;
}

export function RosterLegendNew(){return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-muted">{[['working','Working'],['off','Off-day'],['leave','Leave'],['half','Half-day'],['short','8-hour'],['absent','Absent']].map(([tone,label])=><span key={tone} className="inline-flex items-center gap-1.5"><i className={`roster-legend-dot roster-tone-${tone}`}/>{label}</span>)}<span className="inline-flex items-center gap-1.5"><i className="roster-pending-dot"/>Pending</span></div>;}

export function RosterAgenda({rows,onSelect,today}:Pick<Props,'rows'|'onSelect'|'today'>){
  const person=rows[0];
  if(!person)return <p className="p-8 text-sm text-ink-muted">Your roster will appear after your platform assignment.</p>;
  return <div className="divide-y divide-line">{person.cells.map(day=><button key={day.date} onClick={()=>onSelect(day.date)} className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-mist" aria-label={`${dateLabel(day.date)}, ${dayLabel(day)}`}>
    <span className={cn('flex w-10 shrink-0 flex-col items-center rounded-lg py-1',day.date===today?'bg-primary/10 text-primary-700':'text-ink-muted')}><span className="text-[10px]">{dateLabel(day.date,{weekday:'short'})}</span><strong className="text-lg font-medium">{Number(day.date.slice(-2))}</strong></span>
    <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{dayLabel(day)}</span><span className="mt-1 block text-[11px] text-ink-muted">{day.workingHours?`${day.shift.toLowerCase()} · ${timeLabel(day.shiftStart)} · ${day.workingHours}h working`:'No scheduled working hours'}</span>{day.pending.length>0&&<span className="mt-1 block text-[10px] text-warning-600">Pending: {day.pending.map(k=>leaveLabels[k]).join(', ')}</span>}</span>
    <span className={cn('roster-calendar-pill shrink-0',`roster-tone-${dayTone(day)}`)}>{compactLabel(day)}</span>
  </button>)}</div>;
}

export function RosterCalendar({days,rows,today,selectedDate,onSelect,employee,selectedDates=[],onToggle,capacity=[]}:Props&{employee?:boolean;selectedDates?:string[];onToggle?:(date:string)=>void;capacity?:{date:string;used:number;limit:number}[]}){
  const lead=(new Date(`${days[0]}T12:00:00Z`).getUTCDay()+6)%7;
  return <div className="p-3 sm:p-5"><div className="mb-2 grid grid-cols-7">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span className="py-2 text-center text-[11px] font-medium text-ink-subtle" key={d}>{d}</span>)}</div><div className="roster-calendar">
    {Array.from({length:lead},(_,i)=><div key={`pad-${i}`} className="roster-calendar-pad"/>)}
    {days.map(date=>{const cells=rows.map(r=>r.cells.find(c=>c.date===date)!).filter(Boolean),day=cells[0],cap=capacity.find(c=>c.date===date),leave=cells.filter(c=>c.kind&&c.kind!=='OFF_DAY').length,off=cells.filter(c=>c.state==='OFF').length,missing=cells.reduce((n,c)=>n+c.uncoveredHours,0);return <button key={date} onClick={()=>onToggle?onToggle(date):onSelect(date)} aria-pressed={selectedDates.includes(date)||date===selectedDate} aria-label={`${dateLabel(date,{month:'long',day:'numeric'})}${employee&&day?`, ${dayLabel(day)}`:''}${cap?`, ${cap.used} of 2 off-day slots used`:''}`} className={cn('roster-calendar-day',date===today&&'is-today',(selectedDates.includes(date)||(!onToggle&&date===selectedDate))&&'is-selected',date<today&&'is-past')}>
      <span className="flex items-center justify-between"><strong className="roster-day-number">{Number(date.slice(-2))}</strong>{date===today&&<span className="hidden text-[9px] uppercase text-primary-700 sm:inline">Today</span>}{selectedDates.includes(date)&&<span className="text-primary-700">✓</span>}</span>
      {employee&&day?<><span className={cn('roster-calendar-pill',`roster-tone-${dayTone(day)}`)}><span className="sm:hidden">{compactLabel(day)}</span><span className="hidden sm:inline">{dayLabel(day)}</span></span><span className="hidden text-[10px] text-ink-muted sm:block">{day.workingHours>0?`${timeLabel(day.shiftStart)} · ${day.workingHours}h`:'Rest & recharge'}</span>{day.pending.length>0&&<span className="text-[9px] text-warning-600">Pending request</span>}{cap&&<span className={cn('mt-auto text-[9px]',cap.used>=2?'text-danger-600':'text-ink-subtle')}>{cap.used}/2 off <span className="hidden sm:inline">slots</span></span>}</>:<><span className="hidden text-[11px] text-ink-muted sm:block">{cells.filter(c=>c.workingHours>0).length} working</span><span className="text-[10px] text-violet-600">{off} off <span className="hidden sm:inline">· {leave} leave</span></span>{missing>0&&<span className="mt-auto text-[10px] text-danger-600">{missing}h <span className="hidden sm:inline">uncovered</span></span>}</>}
    </button>;})}
  </div></div>;
}


