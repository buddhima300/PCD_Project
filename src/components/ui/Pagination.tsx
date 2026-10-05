import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-muted">
      <span className="tabular">
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="rounded-lg p-1.5 hover:bg-mist disabled:opacity-40" aria-label="Previous page">
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="tabular px-2">
          Page {page} / {pages}
        </span>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} className="rounded-lg p-1.5 hover:bg-mist disabled:opacity-40" aria-label="Next page">
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>);

}