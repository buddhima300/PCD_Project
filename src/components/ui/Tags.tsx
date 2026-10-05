import React from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import type { DeptCode, ShiftCode } from '../../types/domain';
import { cn } from '../../utils/cn';
import { deptNames } from '../../utils/format';

export function ShiftTag({ shift, className }: {shift: ShiftCode;className?: string;}) {
  const m = shift === 'MORNING';
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', m ? 'bg-warning-50 text-warning-600 ring-warning-100' : 'bg-primary-50 text-primary-700 ring-primary-100', className)}>
      {m ? <SunIcon className="h-3 w-3" aria-hidden /> : <MoonIcon className="h-3 w-3" aria-hidden />}
      {m ? 'Morning' : 'Night'}
    </span>);

}

export function DeptTag({ dept, full, className }: {dept: DeptCode;full?: boolean;className?: string;}) {
  return (
    <span title={deptNames[dept]} className={cn('inline-flex items-center whitespace-nowrap rounded-md bg-mist px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink ring-1 ring-inset ring-line', className)}>
      {dept}
      {full && <span className="ml-1 font-sans font-medium text-ink-muted">{deptNames[dept]}</span>}
    </span>);

}

export function IdText({ children, className }: {children: React.ReactNode;className?: string;}) {
  return <span className={cn('font-mono text-[12px] text-ink', className)}>{children}</span>;
}