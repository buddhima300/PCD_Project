import type { ShiftCoverage } from '../../types/equipment';

const colors = {assigned:'rgb(var(--primary-500))',live:'rgb(var(--success))',training:'rgb(var(--violet))',pending:'rgb(var(--warning))',blocked:'rgb(var(--danger))',free:'rgb(var(--line))'};
function Bar({label,segments,capacity}:{label:string;segments:{label:string;count:number;color:string}[];capacity:number}) {
  const total = segments.reduce((n,s) => n+s.count,0), scale = Math.max(1,capacity,total);
  return <div className="space-y-1"><div className="flex justify-between text-[11px]"><span>{label}</span><span className="tabular">{total} / {capacity}</span></div>
    <div className="flex h-2 overflow-hidden rounded-full" style={{background:colors.free}} role="img" aria-label={`${label}: ${segments.map(s => `${s.count} ${s.label}`).join(', ')}; ${capacity} capacity`}>
      {segments.filter(s => s.count > 0).map(s => <span key={s.label} title={`${s.count} ${s.label}`} style={{width:`${100*s.count/scale}%`,background:s.color}} />)}
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted">{segments.map(s => <span key={s.label} className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{background:s.color}} />{s.count} {s.label}</span>)}</div>
  </div>;
}
export function AllocationBars({coverage:c,label}:{coverage:ShiftCoverage;label:string}) {
  return <div className="space-y-2 rounded-xl border border-line p-2">
    <p className="text-xs font-semibold">{label}</p>
    <Bar label="Staffing" capacity={c.capacity} segments={[{label:'production',count:c.production,color:colors.assigned},{label:'training',count:c.training,color:colors.training}]} />
    <Bar label="Shared devices" capacity={c.capacity} segments={[{label:'usable devices',count:c.usable,color:colors.live}]} />
    <p className="text-[10px] text-ink-muted">{c.vacancies} staffing vacancies · {c.usable}/{c.capacity} usable devices registered</p>
  </div>;
}
