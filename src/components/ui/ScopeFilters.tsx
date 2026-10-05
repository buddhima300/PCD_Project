import React from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { useReferenceData } from '../../hooks/useReferenceData';
import type { DeptCode, ShiftCode } from '../../types/domain';
import { deptNames } from '../../utils/format';
import { Select } from './Field';

export interface Scope {
  category?: string;
  platform?: string;
  dept?: DeptCode | '';
  shift?: ShiftCode | '';
}

interface ScopeFiltersProps<T extends Scope> {
  value: T;
  onChange: (v: T) => void;
  show?: Array<'category' | 'platform' | 'dept' | 'shift'>;
  children?: React.ReactNode;
}

// Platform hierarchy filter: Category → Platform → Department → Shift. Platform list narrows to the category.
export function ScopeFilters<T extends Scope>({ value, onChange, show = ['category', 'platform', 'dept', 'shift'], children }: ScopeFiltersProps<T>) {
  const { categories, platforms } = useReferenceData();
  const visible = platforms.filter((p) => !value.category || p.categoryCode === value.category);
  const hasAny = Boolean(value.category || value.platform || value.dept || value.shift);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {show.includes('category') &&
      <Select
        compact
        aria-label="Platform category"
        className="w-36"
        value={value.category ?? ''}
        placeholder="All categories"
        options={categories.map((c) => ({ value: c.code, label: c.code }))}
        onChange={(e) => onChange({ ...value, category: e.target.value, platform: '' })} />

      }
      {show.includes('platform') &&
      <Select
        compact
        aria-label="Platform"
        className="w-36"
        value={value.platform ?? ''}
        placeholder="All platforms"
        options={visible.map((p) => ({ value: p.code, label: p.code }))}
        onChange={(e) => onChange({ ...value, platform: e.target.value })} />

      }
      {show.includes('dept') &&
      <Select
        compact
        aria-label="Department"
        className="w-40"
        value={value.dept ?? ''}
        placeholder="All departments"
        options={(Object.keys(deptNames) as DeptCode[]).map((d) => ({ value: d, label: `${d} · ${deptNames[d]}` }))}
        onChange={(e) => onChange({ ...value, dept: e.target.value as DeptCode | '' })} />

      }
      {show.includes('shift') &&
      <Select
        compact
        aria-label="Shift"
        className="w-32"
        value={value.shift ?? ''}
        placeholder="Both shifts"
        options={[
        { value: 'MORNING', label: 'Morning' },
        { value: 'NIGHT', label: 'Night' }]
        }
        onChange={(e) => onChange({ ...value, shift: e.target.value as ShiftCode | '' })} />

      }
      {children}
      {hasAny &&
      <button
        onClick={() => onChange({ ...value, category: '', platform: '', dept: '', shift: '' })}
        className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-muted hover:bg-mist hover:text-ink">
        
          <RotateCcwIcon className="h-3.5 w-3.5" /> Reset
        </button>
      }
    </div>);

}