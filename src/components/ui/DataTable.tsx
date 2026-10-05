import React from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: {key: string;dir: 'asc' | 'desc';};
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  caption?: string;
  stickyHeader?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, sort, onSort, onRowClick, rowClassName, caption, stickyHeader }: DataTableProps<T>) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-left text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-line bg-mist/70">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? sort!.dir === 'asc' ? 'ascending' : 'descending' : undefined}
                  className={cn('whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                  
                  {c.sortable && onSort ?
                  <button onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                      {c.header}
                      {active ? sort!.dir === 'asc' ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" /> : <ChevronsUpDownIcon className="h-3 w-3 opacity-50" />}
                    </button> :

                  c.header
                  }
                </th>);

            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
          <tr
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            className={cn(
              'border-b border-line last:border-0',
              onRowClick && 'cursor-pointer transition-colors duration-100 hover:bg-primary-50/50 focus-visible:bg-primary-50 focus-visible:outline-none',
              rowClassName?.(r)
            )}>
            
              {columns.map((c) =>
            <td key={c.key} className={cn('whitespace-nowrap px-4 py-2.5 align-middle text-ink', c.align === 'right' && 'text-right tabular', c.align === 'center' && 'text-center', c.className)}>
                  {c.cell(r)}
                </td>
            )}
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}