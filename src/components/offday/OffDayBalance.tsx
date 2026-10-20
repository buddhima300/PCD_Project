import type { EmployeeDetail } from '../../services/api';
import { RadialProgress } from '../ui/RadialProgress';

export function OffDayBalance({detail}: {detail:EmployeeDetail}) {
  const balance = detail.offDayBalance;
  if (!balance) return <p className="my-4 text-sm text-ink-muted">Off-day balance unavailable. Refresh the employee record.</p>;
  const {month,remaining,allowance,used} = balance;
  return <section className="my-5 flex items-center gap-4 rounded-xl border border-line p-4" aria-label={`Off-day balance for ${month}`}>
    <RadialProgress value={remaining} max={allowance} label="Remaining off-days" tone={remaining?'lime':'orange'} display={String(remaining)} caption="remaining" valueText={`${remaining} of ${allowance} off-days remaining`}/><div><h3 className="text-sm font-semibold">Off-day balance</h3><p className="mt-1 text-xs text-ink-muted">{new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'Asia/Colombo'}).format(new Date(`${month}-01T12:00:00Z`))}</p><p className="mt-2 text-sm">{used} used / {allowance} allowed</p><p className="mt-1 text-xs text-ink-muted">Approved days, including upcoming days this month.</p></div>
  </section>;
}
